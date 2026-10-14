import type { DateTime } from 'luxon';
import { baDateTime, type LocalDateParts, type LocalTimeParts, partsToLocalDate } from './ba';

/**
 * Tokenizadores de fechas en español rioplatense tal como aparecen en agendas:
 *   "Sábado 18 de octubre de 2026, 20:00"   "sáb 18 oct, 20 hs"   "18/10/2026 20.30"
 *   "del 12 al 30 de octubre"   "del 9 de octubre al 1 de febrero"   "16–18 oct. 2026"
 *   "mediodía"   "a las 20 h"
 *
 * Determinista (sin Intl). Cuando falta el año se infiere SOLO si la fecha cae
 * entre ~60 días atrás y 12 meses adelante respecto de `now`; si no, devuelve
 * null y el registro queda como candidato en vez de publicar una fecha dudosa.
 */

const MONTH_TOKENS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sept: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

const WEEKDAY_PATTERN =
  '(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\\.?';
const MONTH_PATTERN = Object.keys(MONTH_TOKENS)
  .sort((a, b) => b.length - a.length)
  .join('|');

export function stripDiacriticsLower(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function monthFromToken(token: string): number | undefined {
  return MONTH_TOKENS[stripDiacriticsLower(token).replace(/\.$/, '')];
}

function cleanup(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[‒–—―]/g, '-') // guiones tipográficos → '-'
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Horas ──────────────────────────────────────────────────────────────────

/**
 * "20:00" "20.30" "20 hs" "20hs" "20 h" "a las 20" "mediodía" "medianoche" → {hour, minute}.
 * Devuelve null si no hay una hora reconocible. Números sueltos solo cuentan si
 * van precedidos de "a las" o seguidos de hs/h/horas o con minutos.
 */
export function parseTimeEs(text: string): LocalTimeParts | null {
  const t = cleanup(text);
  if (/\bmediodia\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmedianoche\b/.test(t)) return { hour: 0, minute: 0 };

  const explicit =
    /(?:a las|a la|desde las|desde la|hora:?|horario:?)\s*(\d{1,2})(?:[:.h](\d{2}))?/.exec(t) ??
    /(\d{1,2})[:.](\d{2})\s*(?:hs?\b|horas?\b|h\b)?/.exec(t) ??
    /(\d{1,2})\s*(?:hs\b|h\b|horas?\b)/.exec(t);
  if (!explicit) return null;

  const hour = Number(explicit[1]);
  const minute = explicit[2] !== undefined ? Number(explicit[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// ── Fechas ─────────────────────────────────────────────────────────────────

export interface ParseDateOptions {
  /** Referencia para inferir el año cuando no viene. */
  now: DateTime;
  /** Cuánto hacia atrás (días) se acepta una fecha sin año antes de asumir el año siguiente. */
  pastToleranceDays?: number;
}

const DEFAULT_PAST_TOLERANCE_DAYS = 60;

/**
 * Elige el año para (month, day) sin año: el actual si la fecha no quedó más de
 * `pastToleranceDays` atrás; si no, el siguiente. Null si aun así cae a más de
 * 12 meses (no debería pasar) o si la fecha no existe (30 de febrero).
 */
export function inferYear(
  month: number,
  day: number,
  { now, pastToleranceDays = DEFAULT_PAST_TOLERANCE_DAYS }: ParseDateOptions,
): number | null {
  for (const year of [now.year, now.year + 1]) {
    let candidate: DateTime;
    try {
      candidate = baDateTime({ year, month, day });
    } catch {
      return null;
    }
    const diffDays = candidate.startOf('day').diff(now.startOf('day'), 'days').days;
    if (diffDays >= -pastToleranceDays && diffDays <= 366) return year;
  }
  return null;
}

function buildDate(
  day: number,
  month: number,
  year: number | undefined,
  options: ParseDateOptions,
): LocalDateParts | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = year;
  if (y !== undefined && y < 100) y += 2000;
  if (y === undefined) {
    const inferred = inferYear(month, day, options);
    if (inferred === null) return null;
    y = inferred;
  }
  try {
    partsToLocalDate({ year: y, month, day });
  } catch {
    return null;
  }
  return { year: y, month, day };
}

const DATE_TEXT_RE = new RegExp(
  `(?:${WEEKDAY_PATTERN}\\s*,?\\s*)?(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_PATTERN})\\.?(?:\\s*(?:de\\s+|del\\s+)?(\\d{4}))?`,
);
const DATE_NUMERIC_RE = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/;

/**
 * Primera fecha completa del texto: "sábado 18 de octubre de 2026", "18 oct", "18/10/2026".
 * Con año ausente se infiere según `now` (ver inferYear).
 */
export function parseDateEs(text: string, options: ParseDateOptions): LocalDateParts | null {
  const t = cleanup(text);

  const m = DATE_TEXT_RE.exec(t);
  if (m) {
    const month = monthFromToken(m[2] ?? '');
    if (month) {
      return buildDate(Number(m[1]), month, m[3] ? Number(m[3]) : undefined, options);
    }
  }

  const n = DATE_NUMERIC_RE.exec(t);
  if (n) {
    // Formato local: día/mes[/año]. Si el "día" > 12 y el "mes" ≤ 12 no hay ambigüedad.
    return buildDate(Number(n[1]), Number(n[2]), n[3] ? Number(n[3]) : undefined, options);
  }

  return null;
}

export interface ParsedDateRange {
  start: LocalDateParts;
  end: LocalDateParts;
}

const RANGE_FULL_RE = new RegExp(
  `(?:del?\\s+)?(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_PATTERN})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?\\s*(?:al?|hasta(?: el)?|-)\\s*(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_PATTERN})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?`,
);
const RANGE_SAME_MONTH_RE = new RegExp(
  `(?:del?\\s+)?(\\d{1,2})\\s*(?:al?|hasta(?: el)?|-)\\s*(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_PATTERN})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?`,
);
const RANGE_UNTIL_RE = new RegExp(
  `hasta(?: el)?\\s+(?:${WEEKDAY_PATTERN}\\s*)?(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_PATTERN})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?`,
);

/**
 * Rangos: "del 12 al 30 de octubre", "16-18 oct. 2026", "del 9 de octubre al 1 de febrero",
 * "hasta el 13 de diciembre" (inicio = hoy). Si el fin cae antes que el inicio sin
 * año explícito, se asume el año siguiente para el fin (9 oct → 1 feb).
 */
export function parseDateRangeEs(text: string, options: ParseDateOptions): ParsedDateRange | null {
  const t = cleanup(text);

  const full = RANGE_FULL_RE.exec(t);
  if (full) {
    const m1 = monthFromToken(full[2] ?? '');
    const m2 = monthFromToken(full[5] ?? '');
    if (m1 && m2) {
      const start = buildDate(Number(full[1]), m1, full[3] ? Number(full[3]) : undefined, options);
      if (!start) return null;
      const endYear = full[6] ? Number(full[6]) : undefined;
      const end = finishRange(start, Number(full[4]), m2, endYear);
      return end ? { start, end } : null;
    }
  }

  const same = RANGE_SAME_MONTH_RE.exec(t);
  if (same) {
    const month = monthFromToken(same[3] ?? '');
    if (month) {
      const start = buildDate(
        Number(same[1]),
        month,
        same[4] ? Number(same[4]) : undefined,
        options,
      );
      if (!start) return null;
      const end = finishRange(start, Number(same[2]), month, start.year);
      return end ? { start, end } : null;
    }
  }

  const until = RANGE_UNTIL_RE.exec(t);
  if (until) {
    const month = monthFromToken(until[2] ?? '');
    if (month) {
      const end = buildDate(
        Number(until[1]),
        month,
        until[3] ? Number(until[3]) : undefined,
        options,
      );
      if (!end) return null;
      const today = { year: options.now.year, month: options.now.month, day: options.now.day };
      return { start: today, end };
    }
  }

  return null;
}

function finishRange(
  start: LocalDateParts,
  endDay: number,
  endMonth: number,
  endYear: number | undefined,
): LocalDateParts | null {
  let year = endYear ?? start.year;
  if (endYear === undefined) {
    const before = endMonth < start.month || (endMonth === start.month && endDay < start.day);
    if (before) year = start.year + 1;
  }
  try {
    partsToLocalDate({ year, month: endMonth, day: endDay });
  } catch {
    return null;
  }
  return { year, month: endMonth, day: endDay };
}

export interface ParsedDateTime {
  date: LocalDateParts;
  time: LocalTimeParts | null;
}

/** Fecha + hora opcional en un mismo texto. */
export function parseDateTimeEs(text: string, options: ParseDateOptions): ParsedDateTime | null {
  const date = parseDateEs(text, options);
  if (!date) return null;
  // Quitar la parte de fecha antes de buscar la hora para no confundir "18" con las 18 h.
  const t = cleanup(text);
  const dateMatch = DATE_TEXT_RE.exec(t) ?? DATE_NUMERIC_RE.exec(t);
  const rest = dateMatch ? t.replace(dateMatch[0], ' ') : t;
  return { date, time: parseTimeEs(rest) };
}

/** Detecta en el texto marcas de estado que un parser puede afirmar. */
export function detectStatusEs(
  text: string,
): 'cancelled' | 'postponed' | 'sold_out' | 'rescheduled' | null {
  const t = cleanup(text);
  if (/\b(cancelad[oa]s?|suspendid[oa]s?)\b/.test(t)) return 'cancelled';
  if (/\b(postergad[oa]s?|pospuest[oa]s?)\b/.test(t)) return 'postponed';
  if (/\b(reprogramad[oa]s?)\b/.test(t)) return 'rescheduled';
  if (/\b(agotad[oa]s?|sold out|localidades agotadas)\b/.test(t)) return 'sold_out';
  return null;
}

/** Detecta gratuidad explícita. Devuelve undefined cuando la fuente no lo dice. */
export function detectFreeEs(text: string): boolean | undefined {
  const t = cleanup(text);
  if (
    /\b(entrada (libre|gratuita|gratis)|gratis|gratuit[oa]s?|sin cargo|libre y gratuita)\b/.test(t)
  ) {
    return true;
  }
  return undefined;
}
