import { dedupKey, diceCoefficient, type NormalizedEvent } from '@culturaba/shared';
import {
  type EventRow,
  eventOccurrenceDates,
  findEventsByDedupKey,
  findEventsOnDates,
} from '../db/repo';
import type { Queryable } from '../db/sql';

export const FUZZY_MATCH_THRESHOLD = 0.85;
export const FUZZY_REVIEW_THRESHOLD = 0.7;
const DATE_TOLERANCE_DAYS = 1;

export interface MatchResult {
  event: EventRow | null;
  /** Parecido pero no suficiente para fusionar: se crea nuevo y se deja para revisión. */
  reviewCandidate?: { event: EventRow; score: number };
}

/**
 * Encuentra el evento existente al que pertenece un registro normalizado.
 *  1. dedup_key (título normalizado | institución) + compatibilidad de fechas;
 *  2. fuzzy (Dice) entre eventos de la misma institución con fechas en común:
 *     ≥ 0.85 fusiona, 0.70–0.85 crea nuevo y marca para revisión.
 * El match por external_id lo hace el pipeline antes de llegar acá.
 */
export async function findMatchingEvent(
  db: Queryable,
  normalized: NormalizedEvent,
  institutionId: string,
): Promise<MatchResult> {
  const incomingRanges = normalized.occurrences.map((o) => ({
    start: o.startDate,
    end: o.endDate,
  }));

  const key = dedupKey(normalized.title, normalized.institutionSlug);
  const byKey = await findEventsByDedupKey(db, key, institutionId);
  for (const candidate of byKey) {
    if (await datesCompatible(db, candidate.id, incomingRanges)) return { event: candidate };
  }

  if (incomingRanges.length === 0) return { event: null };

  const onDates = await findEventsOnDates(db, institutionId, incomingRanges);
  let best: { event: EventRow; score: number } | null = null;
  for (const candidate of onDates) {
    const score = diceCoefficient(normalized.title, candidate.title);
    if (!best || score > best.score) best = { event: candidate, score };
  }
  if (best && best.score >= FUZZY_MATCH_THRESHOLD) return { event: best.event };
  if (best && best.score >= FUZZY_REVIEW_THRESHOLD) {
    return { event: null, reviewCandidate: best };
  }
  return { event: null };
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
