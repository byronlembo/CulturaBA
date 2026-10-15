import { DateTime } from 'luxon';

/** Una función para agregar al calendario del usuario (iCalendar, RFC 5545). */
export interface CalendarEntry {
  uid: string;
  title: string;
  kind: 'timed' | 'all_day' | 'range';
  startsAt: string;
  endsAt: string | null;
  /** Fechas locales de Buenos Aires (YYYY-MM-DD), para días completos y rangos. */
  startDate: string;
  endDate: string;
  location: string | null;
  description: string | null;
  url: string | null;
}

const utc = (iso: string) => DateTime.fromISO(iso).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
const day = (date: string) => date.replaceAll('-', '');
const nextDay = (date: string) => day(DateTime.fromISO(date).plus({ days: 1 }).toISODate() ?? date);
const text = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Líneas de más de 75 octetos se pliegan (RFC 5545 §3.1) sin cortar un carácter UTF-8. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0) ?? 0;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

/**
 * Archivo .ics de una función. Las funciones con hora llevan dos avisos (1 día y 2 h
 * antes); las muestras y días completos van como eventos de día entero, sin avisos.
 */
export function buildIcs(e: CalendarEntry, stamp: Date = new Date()): string {
  const timed = e.kind === 'timed';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CulturaBA//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@culturaba`,
    `DTSTAMP:${utc(stamp.toISOString())}`,
    ...(timed
      ? [`DTSTART:${utc(e.startsAt)}`, ...(e.endsAt ? [`DTEND:${utc(e.endsAt)}`] : [])]
      : [`DTSTART;VALUE=DATE:${day(e.startDate)}`, `DTEND;VALUE=DATE:${nextDay(e.endDate)}`]),
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    ...(e.description || e.url
      ? [`DESCRIPTION:${text([e.description, e.url].filter(Boolean).join('\n\n'))}`]
      : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    ...(timed
      ? ['P1D', 'PT2H'].flatMap((before) => [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${text(e.title)}`,
          `TRIGGER:-${before}`,
          'END:VALARM',
        ])
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Enlace "agregar a Google Calendar" para plataformas sin descarga de archivos. */
export function googleCalendarUrl(e: CalendarEntry): string {
  const dates =
    e.kind === 'timed'
      ? `${utc(e.startsAt)}/${utc(e.endsAt ?? e.startsAt)}`
      : `${day(e.startDate)}/${nextDay(e.endDate)}`;
  const details = [e.description, e.url].filter(Boolean).join('\n\n');
  const params: [string, string | null][] = [
    ['action', 'TEMPLATE'],
    ['text', e.title],
    ['dates', dates],
    ['location', e.location],
    ['details', details || null],
  ];
  return `https://calendar.google.com/calendar/render?${params
    .filter((kv): kv is [string, string] => Boolean(kv[1]))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;
}
