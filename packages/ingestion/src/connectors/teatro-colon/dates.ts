import {
  inferYear,
  type LocalTimeParts,
  parseTimeEs,
  stripDiacriticsLower,
} from '@culturaba/shared';
import type { DateTime } from 'luxon';

/**
 * Fechas tal como las publica teatrocolon.org.ar:
 *   · listado mensual: `h1.month` "octubre", `.day-number` "14.", `.day-hour` "mié_17.30 hs"
 *   · detalle: `h4` "octubre" + `span.hide-desktop p` "viernes 09/10, 20:00 hs" (sin año)
 * Todo es determinista y puro; el año faltante se resuelve con el listado o con
 * `inferYear` (ventana −60 días / +12 meses respecto de `now`).
 */

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** "octubre", "Octubre", "octubre/26" → 10. Null si no es un mes. */
export function monthNumberEs(text: string): number | null {
  const key = stripDiacriticsLower(text)
    .trim()
    .replace(/[^a-z].*$/s, '');
  return MONTHS[key] ?? null;
}

/** Listado: "14." → 14. */
export function parseDayNumber(text: string): number | null {
  const m = /(\d{1,2})/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= 1 && day <= 31 ? day : null;
}

/** Listado: "mié_17.30 hs" / "dom_11.00 hs" → {17,30}. El prefijo `<dow>_` se descarta. */
export function parseListingHour(text: string): LocalTimeParts | null {
  const sep = text.indexOf('_');
  return parseTimeEs(sep >= 0 ? text.slice(sep + 1) : text);
}

export interface DetailDayText {
  day: number;
  month: number;
  /** Solo si el texto trae año explícito (hoy no lo trae). */
  year?: number;
  time: LocalTimeParts | null;
}

/** Detalle: "viernes 09/10, 20:00 hs" → {day: 9, month: 10, time: {20, 0}}. */
export function parseDetailDayText(text: string): DetailDayText | null {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}))?/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const rest = text.slice(m.index + m[0].length);
  const result: DetailDayText = { day, month, time: parseTimeEs(rest) };
  if (m[3]) result.year = Number(m[3]);
  return result;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "20:00" */
export function timeKey(time: LocalTimeParts): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

/** Clave (mes, día, hora) para cruzar funciones del detalle con filas del listado. */
export function dayTimeKey(month: number, day: number, time: LocalTimeParts | null): string {
  return `${pad2(month)}-${pad2(day)}|${time ? timeKey(time) : '--:--'}`;
}

/**
 * Año de una función del detalle (que solo trae dd/mm): el del listado mensual si
 * hay una fila con el mismo (mes, día, hora); si no, el inferido respecto de `now`.
 * Null cuando la fecha cae fuera de la ventana razonable (no se publica).
 */
export function resolveYear(
  month: number,
  day: number,
  time: LocalTimeParts | null,
  listingYears: ReadonlyMap<string, number>,
  now: DateTime,
): number | null {
  const fromListing = listingYears.get(dayTimeKey(month, day, time));
  if (fromListing !== undefined) return fromListing;
  return inferYear(month, day, { now });
}
