import { DateTime } from 'luxon';
import { BA_TZ } from '../constants/tz';

/**
 * Utilidades de fecha/hora ancladas a America/Argentina/Buenos_Aires.
 * Todo instante se intercambia como ISO 8601 con offset; las fechas "locales"
 * son YYYY-MM-DD en la zona de Buenos Aires. El formateo para la UI usa tablas
 * propias (no Intl) para que el resultado sea idéntico en Node y en Hermes.
 */

export interface LocalDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface LocalTimeParts {
  hour: number; // 0-23
  minute: number; // 0-59
}

export function baNow(): DateTime {
  return DateTime.now().setZone(BA_TZ);
}

export function toBa(value: string | number | Date | DateTime): DateTime {
  if (DateTime.isDateTime(value)) return value.setZone(BA_TZ);
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: BA_TZ });
  if (typeof value === 'number') return DateTime.fromMillis(value, { zone: BA_TZ });
  return DateTime.fromISO(value, { setZone: true }).setZone(BA_TZ);
}

/** Construye un instante a partir de fecha y hora locales de Buenos Aires. */
export function baDateTime(
  date: LocalDateParts,
  time: LocalTimeParts = { hour: 0, minute: 0 },
): DateTime {
  const dt = DateTime.fromObject(
    { year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute },
    { zone: BA_TZ },
  );
  if (!dt.isValid) {
    throw new Error(
      `Fecha local inválida: ${JSON.stringify({ date, time })} (${dt.invalidReason})`,
    );
  }
  return dt;
}

export function toIsoInstant(dt: DateTime): string {
  const iso = dt.setZone(BA_TZ).toISO({ suppressMilliseconds: true });
  if (!iso) throw new Error('DateTime inválido');
  return iso;
}

/** YYYY-MM-DD en Buenos Aires del instante dado. */
export function localDateOf(value: string | number | Date | DateTime): string {
  const iso = toBa(value).toISODate();
  if (!iso) throw new Error('Instante inválido');
  return iso;
}

export function localDateToParts(localDate: string): LocalDateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`Fecha local inválida: ${localDate}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function partsToLocalDate(parts: LocalDateParts): string {
  const dt = DateTime.fromObject(parts, { zone: BA_TZ });
  const iso = dt.toISODate();
  if (!dt.isValid || !iso) throw new Error(`Fecha inválida: ${JSON.stringify(parts)}`);
  return iso;
}

/** Límites de un evento de día completo: 00:00:00 a 23:59:59 locales. */
export function allDayBounds(localDate: string): { startsAt: string; endsAt: string } {
  const start = baDateTime(localDateToParts(localDate));
  const end = start.set({ hour: 23, minute: 59, second: 59 });
  return { startsAt: toIsoInstant(start), endsAt: toIsoInstant(end) };
}

/** Límites de un rango de días (exposiciones): inicio 00:00 del primero, fin 23:59:59 del último. */
export function rangeBounds(
  startLocalDate: string,
  endLocalDate: string,
): { startsAt: string; endsAt: string } {
  const start = baDateTime(localDateToParts(startLocalDate));
  const end = baDateTime(localDateToParts(endLocalDate)).set({ hour: 23, minute: 59, second: 59 });
  if (end < start) throw new Error(`Rango invertido: ${startLocalDate} > ${endLocalDate}`);
  return { startsAt: toIsoInstant(start), endsAt: toIsoInstant(end) };
}

// ── Formateo para la UI (tablas propias, sin Intl) ─────────────────────────

export const WEEKDAYS_ES = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];
export const WEEKDAYS_ES_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
export const MONTHS_ES_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "20:00" */
export function formatBaTime(value: string | number | Date | DateTime): string {
  const dt = toBa(value);
  return `${pad2(dt.hour)}:${pad2(dt.minute)}`;
}

/** "sáb 18 oct" (sin año si es el año actual de referencia). */
export function formatBaDateShort(
  value: string | number | Date | DateTime,
  reference: DateTime = baNow(),
): string {
  const dt = toBa(value);
  const base = `${WEEKDAYS_ES_SHORT[dt.weekday - 1]} ${dt.day} ${MONTHS_ES_SHORT[dt.month - 1]}`;
  return dt.year === reference.year ? base : `${base} ${dt.year}`;
}

/** "sábado 18 de octubre de 2026" */
export function formatBaDateLong(value: string | number | Date | DateTime): string {
  const dt = toBa(value);
  return `${WEEKDAYS_ES[dt.weekday - 1]} ${dt.day} de ${MONTHS_ES[dt.month - 1]} de ${dt.year}`;
}

/** "sáb 18 oct · 20:00" */
export function formatBaDateTimeShort(
  value: string | number | Date | DateTime,
  reference: DateTime = baNow(),
): string {
  return `${formatBaDateShort(value, reference)} · ${formatBaTime(value)}`;
}

/** "Del 12 oct al 30 nov" / "Del 9 oct 2026 al 1 feb 2027" */
export function formatBaDateRange(
  startLocalDate: string,
  endLocalDate: string,
  reference: DateTime = baNow(),
): string {
  const s = localDateToParts(startLocalDate);
  const e = localDateToParts(endLocalDate);
  const sameYear = s.year === e.year && s.year === reference.year;
  const fmt = (p: LocalDateParts) =>
    `${p.day} ${MONTHS_ES_SHORT[p.month - 1]}${sameYear ? '' : ` ${p.year}`}`;
  if (startLocalDate === endLocalDate) return fmt(s);
  return `Del ${fmt(s)} al ${fmt(e)}`;
}

/** true si la zona del dispositivo no coincide con Buenos Aires (para avisar en la UI). */
export function deviceZoneDiffersFromBa(deviceZone: string | undefined): boolean {
  if (!deviceZone) return false;
  const now = DateTime.now();
  return now.setZone(deviceZone).offset !== now.setZone(BA_TZ).offset;
}
