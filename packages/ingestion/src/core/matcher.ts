import {
  canonicalUrl,
  dedupKey,
  diceCoefficient,
  isPageKey,
  type NormalizedEvent,
  titleOverlap,
} from '@culturaba/shared';
import {
  type EventRow,
  eventHasRecordFrom,
  eventOccurrenceDates,
  findEventsByDedupKey,
  findEventsBySameAsUrls,
  findEventsOnDates,
} from '../db/repo';
import type { Queryable } from '../db/sql';

export const FUZZY_MATCH_THRESHOLD = 0.85;
export const FUZZY_REVIEW_THRESHOLD = 0.7;
export const TITLE_WORDS_THRESHOLD = 0.8;
const DATE_TOLERANCE_DAYS = 1;

export interface MatchResult {
  event: EventRow | null;
  /** Por qué se fusionó (para métricas y depuración). */
  matchedBy?: 'same_as_url' | 'dedup_key' | 'fuzzy' | 'title_words';
  /** Parecido pero no suficiente para fusionar: se crea nuevo y se deja para revisión. */
  reviewCandidate?: { event: EventRow; score: number };
}

/**
 * Encuentra el evento existente al que pertenece un registro normalizado.
 *  0. misma página: la URL oficial, la del registro o una `sameAsUrls` coincide con la
 *     de UN solo evento de la misma institución (en cualquier sentido) + fechas compatibles;
 *  1. dedup_key (título normalizado | institución) + compatibilidad de fechas;
 *  2. fuzzy (Dice) entre eventos de la misma institución con fechas en común:
 *     ≥ 0.85 fusiona, 0.70–0.85 crea nuevo y marca para revisión;
 *  3. palabras del título: entre fuentes distintas (una fuente nunca lista dos veces lo
 *     mismo), misma institución y fechas en común, si el título más corto está casi
 *     entero en el otro (≥ 0.8; Linda: "…le cantan a Charly", Usina: "…una noche para
 *     Charly"). Con dos candidatos empatados no se fusiona.
 * El match por external_id lo hace el pipeline antes de llegar acá.
 */
export async function findMatchingEvent(
  db: Queryable,
  normalized: NormalizedEvent,
  institutionId: string,
  sourceId: string,
): Promise<MatchResult> {
  const incomingRanges = normalized.occurrences.map((o) => ({
    start: o.startDate,
    end: o.endDate,
  }));

  const urlKeys = sameAsKeys(normalized);
  const byUrl: EventRow[] = [];
  for (const candidate of await findEventsBySameAsUrls(db, institutionId, sourceId, urlKeys)) {
    if (await datesCompatible(db, candidate.id, incomingRanges)) byUrl.push(candidate);
  }
  // Una página que reclaman dos eventos no identifica a ninguno: se sigue por título.
  if (byUrl.length === 1 && byUrl[0]) return { event: byUrl[0], matchedBy: 'same_as_url' };

  const key = dedupKey(normalized.title, normalized.institutionSlug);
  const byKey = await findEventsByDedupKey(db, key, institutionId);
  for (const candidate of byKey) {
    if (await datesCompatible(db, candidate.id, incomingRanges)) {
      return { event: candidate, matchedBy: 'dedup_key' };
    }
  }

  if (incomingRanges.length === 0) return { event: null };

  const onDates = await findEventsOnDates(db, institutionId, incomingRanges);
  let best: { event: EventRow; score: number } | null = null;
  for (const candidate of onDates) {
    const score = diceCoefficient(normalized.title, candidate.title);
    if (!best || score > best.score) best = { event: candidate, score };
  }
  if (best && best.score >= FUZZY_MATCH_THRESHOLD) return { event: best.event, matchedBy: 'fuzzy' };
  const byWords = await bestByTitleWords(db, normalized.title, onDates, sourceId);
  if (byWords) return { event: byWords, matchedBy: 'title_words' };
  if (best && best.score >= FUZZY_REVIEW_THRESHOLD) {
    return { event: null, reviewCandidate: best };
  }
  return { event: null };
}

/**
 * Páginas de venta que identifican UNA producción: la ticketera oficial de la Ciudad
 * usa un id por evento o por visita. Otras ticketeras (portadas, páginas de sala,
 * pases de festival) no sirven para afirmar que dos registros son el mismo evento.
 */
const SHARED_TICKET_KEY_RE = /^entradasba\.buenosaires\.gob\.ar\/(?:evento|visitas)\/[^/]+$/;

export function isSharedTicketKey(key: string): boolean {
  return SHARED_TICKET_KEY_RE.test(key);
}

/** Claves canónicas que identifican a este registro: sus páginas y sus entradas oficiales. */
export function sameAsKeys(normalized: NormalizedEvent): string[] {
  const pages = [normalized.officialUrl, normalized.url, ...(normalized.sameAsUrls ?? [])]
    .map(canonicalUrl)
    .filter(isPageKey);
  const tickets = [normalized.ticketsUrl, ...normalized.occurrences.map((o) => o.ticketsUrl)]
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map(canonicalUrl)
    .filter(isSharedTicketKey);
  return [...new Set([...pages, ...tickets])];
}

async function bestByTitleWords(
  db: Queryable,
  title: string,
  candidates: EventRow[],
  sourceId: string,
): Promise<EventRow | null> {
  const scored: { event: EventRow; score: number }[] = [];
  for (const event of candidates) {
    const score = titleOverlap(title, event.title);
    if (score < TITLE_WORDS_THRESHOLD) continue;
    if (await eventHasRecordFrom(db, event.id, sourceId)) continue;
    scored.push({ event, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first || (second && second.score === first.score)) return null;
  return first.event;
}

async function datesCompatible(
  db: Queryable,
  eventId: string,
  incoming: { start: string; end: string }[],
): Promise<boolean> {
  const existing = await eventOccurrenceDates(db, eventId);
  if (existing.length === 0 || incoming.length === 0) return true;
  for (const a of incoming) {
    for (const b of existing) {
      if (overlapsWithTolerance(a, { start: b.start_date, end: b.end_date }, DATE_TOLERANCE_DAYS)) {
        return true;
      }
    }
  }
  return false;
}

function overlapsWithTolerance(
  a: { start: string; end: string },
  b: { start: string; end: string },
  toleranceDays: number,
): boolean {
  const ms = toleranceDays * 86_400_000;
  const aStart = Date.parse(a.start) - ms;
  const aEnd = Date.parse(a.end) + ms;
  return aStart <= Date.parse(b.end) && aEnd >= Date.parse(b.start);
}
