import {
  BA_TZ,
  type NormalizedOccurrenceInput,
  type ParsedOccurrenceStatus,
  type Price,
  rangeBounds,
  stripDiacriticsLower,
  toIsoInstant,
  type VenueRef,
} from '@culturaba/shared';
import { DateTime } from 'luxon';

/**
 * Funciones de un evento de Linda a partir de `fechasDelEvento[]`.
 *
 * Lo que dice el relevamiento (y se verificó en el fixture 2026-10-14): cada elemento es
 * un instante ISO en UTC ("2026-10-17T00:00:00.000Z" = vie 16/10 21:00 BA), uno por
 * función; los 1 179 instantes coinciden con algún par {dia, hora} de `horarios[]`;
 * `fechaInicio`/`fechaFin` son el mínimo y el máximo; la lista empieza unos días antes de
 * hoy (mínimo global 2026-10-09), así que incluye funciones pasadas.
 *
 * REGLA ELEGIDA
 *  1. Funciones (no muestra): una ocurrencia `timed` por instante, con la hora tal cual
 *     (endsAt = null). Un instante a medianoche local (00:00) se trata como "fecha sin
 *     hora": no se emite (aviso). Las pasadas se emiten igual: el pipeline las ignora
 *     para "futuro" y nunca hacen que algo parezca vigente.
 *  2. Muestras/exposiciones (isExhibition): los instantes son horarios de APERTURA de
 *     cada día (p. ej. la-isla: 43 días a las 11:00; viva-frida: 132 días con 12:00,
 *     11:00, 23:00 y 00:00 mezcladas), no funciones. Se emite UNA ocurrencia `range` desde
 *     la fecha local del primer instante publicado hasta la del último, con externalId
 *     estable `${id}|muestra` (el inicio se corre a medida que Linda recorta el pasado y
 *     así se actualiza en el lugar, sin "reprogramaciones"), scheduleText = oraciones
 *     LITERALES del texto que publican días y horario de apertura ("de martes a viernes,
 *     de 14 a 21 horas…") o null si no hay, y sourceDateText con los extremos ISO.
 *  3. Nunca `all_day`: Linda no publica "todo el día".
 *
 * Es muestra si se cumplen las tres:
 *  E1. el título o la descripción corta la nombran como tal (sustantivos "muestra",
 *      "exposición(es)", "exhibición(es)", "retrospectiva"; "muestra" solo con artículo
 *      o al inicio de oración para no confundir el verbo "muestra"), o bien etiqueta
 *      "Ferias y exposiciones" + lugar "museos_y";
 *  E2. instantes en ≥ 2 días distintos (descarta "una noche de exhibición"; Linda recorta
 *      el pasado, así que no puede exigirse más sin perder muestras en su última semana);
 *  E3. sin etiquetas de artes en vivo (Teatro, Música, Cine), salvo que también tenga
 *      "Ferias y exposiciones".
 */

/**
 * Linda recorta las fechas pasadas (deja ~5 días hacia atrás), así que una muestra en su
 * última semana puede tener pocos días publicados. Basta con 2 si E1 y E3 se cumplen.
 */
export const EXHIBITION_MIN_DAYS = 2;

export interface LocalInstant {
  /** Texto tal como vino en la API. */
  source: string;
  startsAt: string;
  localDate: string;
  /** HH:MM local. */
  localTime: string;
  millis: number;
  midnight: boolean;
}

/** Ordena, deduplica y convierte a hora de Buenos Aires. Descarta (con aviso) lo ilegible. */
export function parseInstants(values: readonly string[]): {
  instants: LocalInstant[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const byMillis = new Map<number, LocalInstant>();
  for (const source of values) {
    const dt = DateTime.fromISO(source, { setZone: true });
    if (!dt.isValid || !/T\d{2}:\d{2}/.test(source)) {
      warnings.push(`instante ilegible en fechasDelEvento: "${source}"`);
      continue;
    }
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(source.trim())) {
      // Sin zona explícita la hora dependería de la zona del proceso: no se adivina.
      warnings.push(`instante sin zona horaria en fechasDelEvento: "${source}", omitido`);
      continue;
    }
    const ba = dt.setZone(BA_TZ);
    const millis = ba.toMillis();
    if (byMillis.has(millis)) continue;
    byMillis.set(millis, {
      source,
      startsAt: toIsoInstant(ba),
      localDate: ba.toISODate() ?? '',
      localTime: ba.toFormat('HH:mm'),
      millis,
      midnight: ba.hour === 0 && ba.minute === 0,
    });
  }
  const instants = [...byMillis.values()].sort((a, b) => a.millis - b.millis);
  return { instants, warnings };
}

const EXHIBITION_NOUN_RE = /\b(?:exposicion(?:es)?|exhibicion(?:es)?|retrospectiva)\b/;
const MUESTRA_NOUN_RE =
  /(?:^|[.!?:;|(«"“]\s*|\b(?:la|una|esta|nueva|gran|primera|su|otra)\s+)muestras?\b/;

export interface ExhibitionInput {
  title: string;
  /** `description` corta de Linda, en texto plano. */
  summary: string;
  /** Claves normalizadas de etiquetas (etiquetaKey). */
  etiquetaKeys: readonly string[];
  lugar?: string | null;
  distinctDays: number;
  performingEtiquetas: ReadonlySet<string>;
}

export function namesItselfExhibition(title: string, summary: string): boolean {
  const text = stripDiacriticsLower(`${title}. ${summary}`);
  return EXHIBITION_NOUN_RE.test(text) || MUESTRA_NOUN_RE.test(text);
}

export function isExhibition(input: ExhibitionInput): boolean {
  const fye = input.etiquetaKeys.includes('ferias y exposiciones');
  const e1 =
    namesItselfExhibition(input.title, input.summary) || (fye && input.lugar === 'museos_y');
  const e2 = input.distinctDays >= EXHIBITION_MIN_DAYS;
  const e3 = fye || !input.etiquetaKeys.some((k) => input.performingEtiquetas.has(k));
  return e1 && e2 && e3;
}

// ── Horario de apertura en prosa (solo para scheduleText de muestras) ───────

const WEEKDAY_RE =
  /\b(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|feriados|todos los dias)\b/;
const HOURS_RANGE_RE = /\bde\s+\d{1,2}(?:[:.]\d{2})?\s*(?:h|hs|horas)?\s*a\s+(?:las\s+)?\d{1,2}\b/;
const ABBREVIATIONS = new Set(['av', 'avda', 'dr', 'dra', 'pres', 'sr', 'sra', 'gral', 'nº', 'n°']);
const MAX_SCHEDULE_SENTENCES = 3;
const MAX_SCHEDULE_LENGTH = 400;

/** Parte un texto en oraciones sin cortar en "Av." ni dentro de comillas “…”/«…». */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    let current = '';
    let quoteDepth = 0;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i] ?? '';
      current += ch;
      if (ch === '“' || ch === '«') quoteDepth += 1;
      if ((ch === '”' || ch === '»') && quoteDepth > 0) quoteDepth -= 1;
      if (!'.!?'.includes(ch) || quoteDepth > 0) continue;
      const next = line[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue;
      const lastWord = /([\p{L}º°]+)\.$/u.exec(current)?.[1]?.toLowerCase();
      if (ch === '.' && lastWord && ABBREVIATIONS.has(lastWord)) continue;
      if (current.trim()) out.push(current.trim());
      current = '';
    }
    if (current.trim()) out.push(current.trim());
  }
  return out;
}

/**
 * Oraciones literales que publican días + franja horaria de apertura
 * ("La muestra estará abierta al público de martes a viernes, de 14 a 21 horas…").
 * Null si el texto no las tiene (no se arma un horario a partir de `horarios[]`).
 */
export function extractOpeningHoursText(text: string): string | null {
  const picked: string[] = [];
  for (const sentence of splitSentences(text)) {
    const norm = stripDiacriticsLower(sentence);
    if (!WEEKDAY_RE.test(norm) || !HOURS_RANGE_RE.test(norm)) continue;
    if (picked.join(' ').length + sentence.length > MAX_SCHEDULE_LENGTH) break;
    picked.push(sentence);
    if (picked.length >= MAX_SCHEDULE_SENTENCES) break;
  }
  return picked.length > 0 ? picked.join(' ') : null;
}

// ── Ocurrencias ────────────────────────────────────────────────────────────

export interface OccurrenceContext {
  eventId: string;
  exhibition: boolean;
  venue: VenueRef | null;
  ticketsUrl: string | null;
  price: Price | null;
  status: ParsedOccurrenceStatus;
  statusReason?: string;
  /** Texto plano completo (descripción + componentes) para el horario de muestras. */
  bodyText: string;
}

export function buildOccurrences(
  instants: readonly LocalInstant[],
  ctx: OccurrenceContext,
): { occurrences: NormalizedOccurrenceInput[]; warnings: string[] } {
  const warnings: string[] = [];
  const common = {
    timezone: BA_TZ,
    recurrenceRule: null,
    venue: ctx.venue,
    status: ctx.status,
    ...(ctx.statusReason ? { statusReason: ctx.statusReason } : {}),
    ticketsUrl: ctx.ticketsUrl,
    price: ctx.price,
  };

  const first = instants[0];
  const last = instants.at(-1);
  if (!first || !last) {
    warnings.push('sin fechasDelEvento: no hay funciones');
    return { occurrences: [], warnings };
  }

  if (ctx.exhibition) {
    const scheduleText = extractOpeningHoursText(ctx.bodyText);
    if (!scheduleText) warnings.push('muestra sin horario de apertura en el texto');
    const segments = consecutiveDateRuns(instants);
    warnings.push(
      `muestra: ${instants.length} instantes en ${segments.length} tramo(s) continuo(s) ${first.localDate}…${last.localDate}`,
    );
    return {
      occurrences: segments.map((seg) => {
        const bounds = rangeBounds(seg.start.localDate, seg.end.localDate);
        return {
          ...common,
          // Clave por el FIN del tramo: estable aunque Linda recorte el pasado (corre el inicio).
          externalId: `${ctx.eventId}|tramo|${seg.end.localDate}`,
          kind: 'range' as const,
          startsAt: bounds.startsAt,
          endsAt: bounds.endsAt,
          startDate: seg.start.localDate,
          endDate: seg.end.localDate,
          scheduleText,
          sourceDateText: `${seg.start.source} … ${seg.end.source} (${seg.days} fechas publicadas)`,
        };
      }),
      warnings,
    };
  }

  const occurrences: NormalizedOccurrenceInput[] = [];
  for (const instant of instants) {
    if (instant.midnight) {
      warnings.push(`${instant.localDate}: instante a medianoche local (fecha sin hora), omitido`);
      continue;
    }
    occurrences.push({
      ...common,
      // Del instante normalizado (UTC), no del texto: un cambio de formato no cambia el id.
      externalId: `${ctx.eventId}|${DateTime.fromMillis(instant.millis, { zone: 'utc' }).toISO({ suppressMilliseconds: true })}`,
      kind: 'timed',
      startsAt: instant.startsAt,
      endsAt: null,
      startDate: instant.localDate,
      endDate: instant.localDate,
      scheduleText: null,
      sourceDateText: instant.source,
    });
  }
  return { occurrences, warnings };
}

/**
 * Tramos de días publicados consecutivos. Una muestra que cierra los martes (Linda no
 * publica esos días) queda como varios rangos en vez de uno que afirme días cerrados.
 */
export function consecutiveDateRuns(
  instants: readonly LocalInstant[],
): { start: LocalInstant; end: LocalInstant; days: number }[] {
  const byDate = new Map<string, LocalInstant>();
  for (const i of instants) if (!byDate.has(i.localDate)) byDate.set(i.localDate, i);
  const days = [...byDate.keys()].sort();
  const runs: { start: LocalInstant; end: LocalInstant; days: number }[] = [];
  let startIdx = 0;
  for (let k = 1; k <= days.length; k += 1) {
    const prev = days[k - 1];
    const cur = days[k];
    const contiguous =
      prev !== undefined &&
      cur !== undefined &&
      DateTime.fromISO(prev).plus({ days: 1 }).toISODate() === cur;
    if (contiguous) continue;
    const start = byDate.get(days[startIdx] ?? '');
    const end = byDate.get(prev ?? '');
    if (start && end) runs.push({ start, end, days: k - startIdx });
    startIdx = k;
  }
  return runs;
}
