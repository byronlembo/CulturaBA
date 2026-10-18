import {
  BA_TZ,
  detectStatusEs,
  inferYear,
  type LocalTimeParts,
  type ParsedOccurrenceStatus,
  partsToLocalDate,
  stripDiacriticsLower,
} from '@culturaba/shared';
import { DateTime } from 'luxon';

/**
 * Parser PURO de las fechas de museomoderno.org (ver docs/research/museo-moderno.md §4-§5).
 *
 * Agenda (CPT `agenda`): las fechas están en el texto del contenido, en "líneas de fecha" que
 * EMPIEZAN con la fecha (día de semana opcional + día + mes), seguidas o no de la hora:
 *   "Miércoles 28 de octubre, a las 17 h"                 → timed 17:00
 *   "Sábado 31 de octubre, de 16.30 a 18.30 h"             → timed 16:30–18:30
 *   "Sábado 3, 17 y 24  y domingo 4, 11, 18 y 25  de octubre, de 15 a 17 h" → 7 funciones
 *   "Viernes 23 y sábado 24 de octubre, 19 h"              → 2 funciones
 *   "Sábado 27 de septiembre, a las 17 y 19 h"             → 2 funciones el mismo día
 *   "Sábado 10 de octubre" + línea siguiente "16.30 h – Performance" → timed 16:30
 *   "Sábado 10 de octubre" sin hora en la línea ni en la siguiente   → all_day (nunca se inventa hora)
 *   "16 a 19 de abril"                                      → range, solo si no hay funciones
 * Un día que ya tiene función por una línea con hora propia no toma la hora de las cabeceras de
 * programa ("SÁBADO 3 DE OCTUBRE" + "15 a 17 h – Movimiento invención…"): son actividades
 * internas de un programa, no otra función.
 *
 * Patrones semanales sin fechas ("Todos los miércoles, de 16 a 18 h", "Dos sábados o domingos
 * por mes, de 11.30 a 13.30 h") NO se convierten en funciones: no publican temporada.
 *
 * Año (el sitio casi nunca lo publica):
 *  · con año → ese año, verificado con el día de semana si viene;
 *  · con día de semana → el único año (del anterior al siguiente) en que la fecha cae ese día,
 *    y nunca a más de 12 meses de hoy;
 *  · sin año ni día de semana → inferYear de shared anclado en la PUBLICACIÓN del ítem (no en
 *    hoy: el sitio retoca entradas viejas) y solo hasta ~6 meses adelante de hoy.
 * Lo que no se puede afirmar queda como aviso y no se emite.
 *
 * Exposiciones: "Inicio: 20 de Agosto de 2026" / "Fin: 30 de Abril de 2027" en la ficha y
 * "Hasta el 28 de Febrero de 2027" en el listado; ver exhibitionRange.
 */

type Warn = (message: string) => void;

const WEEKDAYS: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sabados: 6,
  domingo: 7,
  domingos: 7,
};

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

const WEEKDAY_ALT = Object.keys(WEEKDAYS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const MONTH_ALT = Object.keys(MONTHS).join('|');

/** Sin año ni día de semana, una fecha inferida solo se acepta hasta ~6 meses adelante. */
export const UNVERIFIED_HORIZON_DAYS = 183;
/** Regla del proyecto: nunca más de 12 meses adelante. */
export const MAX_AHEAD_DAYS = 366;

/** Minúsculas sin acentos, guiones tipográficos → '-', ordinales "1°" → "1", espacios colapsados. */
export function normalizeLine(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[‒–—―]/g, '-')
    .replace(/(\d{1,2})\s*[°º]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatTime(t: LocalTimeParts): string {
  return `${pad2(t.hour)}:${pad2(t.minute)}`;
}

function toLocal(year: number, month: number, day: number): string | null {
  try {
    return partsToLocalDate({ year, month, day });
  } catch {
    return null;
  }
}

function weekdayOf(local: string): number {
  return DateTime.fromISO(local, { zone: BA_TZ }).weekday;
}

function daysFrom(local: string, now: DateTime): number {
  return DateTime.fromISO(local, { zone: BA_TZ }).diff(now.setZone(BA_TZ).startOf('day'), 'days')
    .days;
}

export function todayOf(now: DateTime): string {
  return now.setZone(BA_TZ).toISODate() ?? '';
}

// ── Horas ──────────────────────────────────────────────────────────────────

export interface TimeSlot {
  start: LocalTimeParts;
  /** Solo si el texto publica la franja ("de 16 a 18 h"). */
  end: LocalTimeParts | null;
}

const T = '(\\d{1,2})(?:[.:](\\d{2}))?';
const UNIT = '(?:h|hs|horas?)\\b';
/** "de 15 a 17 h" · "12 a 19 h" · "de 11:30 a 13:30 h" · "de 16.30 a 18.30 h" · "16-18 h". */
const TIME_RANGE_RE = new RegExp(
  `(?:^|[^\\d.:])(?:de\\s+)?${T}\\s*(?:${UNIT}\\.?)?\\s*(?:a|-)\\s*${T}\\s*${UNIT}`,
);
const T_LIST = '\\d{1,2}(?:[.:]\\d{2})?(?:\\s*(?:,|y)\\s*(?:las\\s+)?\\d{1,2}(?:[.:]\\d{2})?)*';
/** "19 h" · "17.00 h" · "a las 17 y 19 h" · "17 y 19 h". */
const TIME_LIST_UNIT_RE = new RegExp(`(?:^|[^\\d.:])(${T_LIST})\\s*${UNIT}`);
/** "a las 11.30" (sin unidad). */
const TIME_LIST_ALAS_RE = new RegExp(`\\ba las\\s+(${T_LIST})`);
/** Línea que EMPIEZA con una hora: "19 h", "16.30 h – Performance", "12 a 19 h – …", "19 h | …". */
const TIME_ONLY_LINE_RE = new RegExp(
  `^(?:de\\s+)?\\d{1,2}(?:[.:]\\d{2})?\\s*(?:${UNIT}|(?:a|-)\\s*\\d{1,2}(?:[.:]\\d{2})?\\s*${UNIT})|^a las \\d`,
);

function timeOf(h: string | undefined, m: string | undefined): LocalTimeParts | null {
  const hour = Number(h);
  const minute = m !== undefined ? Number(m) : 0;
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function minutesOf(t: LocalTimeParts): number {
  return t.hour * 60 + t.minute;
}

/**
 * Horas publicadas en un texto ya normalizado. Una franja ("de 16 a 18 h") da inicio y fin;
 * una lista ("a las 17 y 19 h") da una función por hora, sin fin.
 */
export function parseTimes(cleaned: string, warn: Warn = () => {}): TimeSlot[] {
  const range = TIME_RANGE_RE.exec(cleaned);
  if (range) {
    const start = timeOf(range[1], range[2]);
    const end = timeOf(range[3], range[4]);
    if (!start) return [];
    if (end && minutesOf(end) <= minutesOf(start)) {
      warn(`franja horaria que no termina el mismo día ("${range[0].trim()}"): se omite el fin`);
      return [{ start, end: null }];
    }
    return [{ start, end }];
  }
  const list = TIME_LIST_UNIT_RE.exec(cleaned) ?? TIME_LIST_ALAS_RE.exec(cleaned);
  if (!list?.[1]) return [];
  const slots: TimeSlot[] = [];
  for (const m of list[1].matchAll(/(\d{1,2})(?:[.:](\d{2}))?/g)) {
    const t = timeOf(m[1], m[2]);
    if (!t) {
      warn(`hora inválida "${m[0]}", se ignora`);
      continue;
    }
    if (!slots.some((s) => minutesOf(s.start) === minutesOf(t)))
      slots.push({ start: t, end: null });
  }
  return slots;
}

/** Hora con la que empieza una línea ("16.30 h – Performance" → 16:30); [] si no empieza con hora. */
export function leadingTimes(line: string): TimeSlot[] {
  const cleaned = normalizeLine(line);
  if (!TIME_ONLY_LINE_RE.test(cleaned)) return [];
  // Solo la cabecera: "18 h – Entrevista pública…" no debe leer horas del texto que sigue.
  const head = cleaned.split(/\s[-|]\s|\s\|/)[0] ?? cleaned;
  return parseTimes(head);
}

// ── Líneas de fecha ────────────────────────────────────────────────────────

type Token =
  | { kind: 'weekday'; value: number; end: number }
  | { kind: 'month'; value: number; end: number }
  | { kind: 'year'; value: number; end: number }
  | { kind: 'day'; value: number; end: number }
  | { kind: 'range'; end: number }
  | { kind: 'sep'; end: number };

const TOKEN_RE = new RegExp(
  `\\s*(?:(${WEEKDAY_ALT})|(${MONTH_ALT})|(\\d{4})|(\\d{1,2})(?![\\d.:])|(al|a|hasta el|hasta|-)|(del|de|el|y|e|,))(?=[\\s,.;:-]|$)`,
  'y',
);

function tokenize(cleaned: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(cleaned); m; m = TOKEN_RE.exec(cleaned)) {
    const end = TOKEN_RE.lastIndex;
    if (m[1]) tokens.push({ kind: 'weekday', value: WEEKDAYS[m[1]] ?? 0, end });
    else if (m[2]) tokens.push({ kind: 'month', value: MONTHS[m[2]] ?? 0, end });
    else if (m[3]) tokens.push({ kind: 'year', value: Number(m[3]), end });
    else if (m[4]) tokens.push({ kind: 'day', value: Number(m[4]), end });
    else if (m[5]) tokens.push({ kind: 'range', end });
    else tokens.push({ kind: 'sep', end });
    if (end >= cleaned.length) break;
  }
  return tokens;
}

interface DayRef {
  day: number;
  month: number;
  year: number | null;
  weekday: number | null;
}

export interface DateLine {
  /** Parte de fecha (normalizada) y resto de la línea (horas, notas). */
  datePart: string;
  rest: string;
  days: DayRef[];
  /** Rango "16 a 19 de abril" / "del 12 de septiembre al 1 de marzo". */
  range: { from: DayRef; to: DayRef } | null;
  /** Días sin mes ("domingo 18" al final): no se adivinan. */
  loose: number;
}

const LABEL_RE = /^(?:fechas?|dias?)\s*:\s*/;

/**
 * Línea que EMPIEZA con una fecha: [día de semana] día [, día y día] de mes [de año] …
 * Null si la línea no empieza así (descripciones, "Todos los miércoles…", "2001", "5 Ana…").
 */
export function parseDateLine(line: string): DateLine | null {
  const cleaned = normalizeLine(line).replace(LABEL_RE, '');
  const tokens = tokenize(cleaned);
  const first = tokens.find((t) => t.kind !== 'sep');
  if (!first || (first.kind !== 'weekday' && first.kind !== 'day')) return null;

  let last = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t?.kind === 'month') {
      last = i;
      // "… de octubre de 2026": el año pertenece a la fecha.
      const sep = tokens[i + 1];
      const year = tokens[i + 2];
      if (sep?.kind === 'sep' && year?.kind === 'year') last = i + 2;
    }
  }
  if (last === -1) return null;
  const dateTokens = tokens.slice(0, last + 1);
  if (!dateTokens.some((t) => t.kind === 'day')) return null;
  const end = dateTokens.at(-1)?.end ?? 0;

  // ¿Rango? Un conector "al"/"a"/"hasta"/"-" entre dos días.
  const rangeIdx = dateTokens.findIndex(
    (t, i) =>
      t.kind === 'range' &&
      dateTokens.slice(0, i).some((x) => x.kind === 'day') &&
      dateTokens.slice(i + 1).some((x) => x.kind === 'day'),
  );

  const days: DayRef[] = [];
  let loose = 0;
  let weekday: number | null = null;
  let pending: Array<{ day: number; weekday: number | null }> = [];
  let groups: DayRef[][] = [];
  for (const t of dateTokens) {
    if (t.kind === 'weekday') weekday = t.value;
    else if (t.kind === 'day') pending.push({ day: t.value, weekday });
    else if (t.kind === 'month') {
      const group = pending.map((p) => ({ ...p, month: t.value, year: null as number | null }));
      if (group.length) groups.push(group);
      pending = [];
    } else if (t.kind === 'year') {
      // El año va con el último grupo y con los anteriores que no lo publican.
      groups = groups.map((g, gi) =>
        g.map((d) => (d.year === null || gi === groups.length - 1 ? { ...d, year: t.value } : d)),
      );
    }
  }
  loose = pending.length;
  for (const g of groups) days.push(...g);

  let range: DateLine['range'] = null;
  if (rangeIdx !== -1 && days.length >= 2) {
    const from = days[0];
    const to = days.at(-1);
    if (from && to) range = { from, to };
  }

  return {
    datePart: cleaned.slice(0, end).trim(),
    rest: cleaned.slice(end).trim(),
    days: range ? [] : days,
    range,
    loose,
  };
}

// ── Año ────────────────────────────────────────────────────────────────────

export interface YearContext {
  now: DateTime;
  /** Publicación del ítem: ancla para fechas sin año ni día de semana. */
  anchor: DateTime;
}

/** dd/mm(/aaaa) + día de semana → YYYY-MM-DD, o null (con aviso) si no se puede afirmar. */
export function resolveDay(ref: DayRef, ctx: YearContext, warn: Warn = () => {}): string | null {
  const label = `${ref.day}/${ref.month}${ref.year ? `/${ref.year}` : ''}`;
  if (ref.year !== null) {
    const local = toLocal(ref.year, ref.month, ref.day);
    if (!local) {
      warn(`fecha inexistente ${label}, se ignora`);
      return null;
    }
    if (ref.weekday !== null && weekdayOf(local) !== ref.weekday) {
      warn(`el día de semana no coincide con ${local}, se ignora`);
      return null;
    }
    return local;
  }
  if (ref.weekday !== null) {
    const base = ctx.now.setZone(BA_TZ).year;
    const matches = [base - 1, base, base + 1]
      .map((y) => toLocal(y, ref.month, ref.day))
      .filter(
        (d): d is string =>
          d !== null && weekdayOf(d) === ref.weekday && daysFrom(d, ctx.now) <= MAX_AHEAD_DAYS,
      );
    if (matches.length !== 1 || !matches[0]) {
      warn(`ningún año cercano hace coincidir ${label} con el día de semana publicado, se ignora`);
      return null;
    }
    return matches[0];
  }
  const year = inferYear(ref.month, ref.day, { now: ctx.anchor.setZone(BA_TZ) });
  const local = year !== null ? toLocal(year, ref.month, ref.day) : null;
  if (!local) {
    warn(`fecha sin año que no se puede ubicar (${label}), se ignora`);
    return null;
  }
  if (daysFrom(local, ctx.now) > UNVERIFIED_HORIZON_DAYS) {
    warn(`año ambiguo para ${label} (sin año ni día de semana), se ignora`);
    return null;
  }
  return local;
}

function resolveRange(
  from: DayRef,
  to: DayRef,
  ctx: YearContext,
  warn: Warn,
): { start: string; end: string } | null {
  const end = resolveDay(to, ctx, warn);
  if (!end) return null;
  const endYear = Number(end.slice(0, 4));
  const ordered = from.month < to.month || (from.month === to.month && from.day <= to.day);
  const start = resolveDay(
    { ...from, year: from.year ?? (ordered ? endYear : endYear - 1) },
    ctx,
    warn,
  );
  if (!start) return null;
  if (start > end) {
    warn(`rango invertido ${start} – ${end}, se ignora`);
    return null;
  }
  return { start, end };
}

// ── Agenda ─────────────────────────────────────────────────────────────────

interface SpecBase {
  /** Índice de la línea de fecha en el contenido (para atribuir lugar y entradas). */
  lineIndex: number;
  sourceText: string;
}

export interface TimedSpec extends SpecBase {
  kind: 'timed';
  date: string;
  start: LocalTimeParts;
  end: LocalTimeParts | null;
  status: ParsedOccurrenceStatus;
}

export interface AllDaySpec extends SpecBase {
  kind: 'all_day';
  date: string;
  status: ParsedOccurrenceStatus;
}

export interface RangeSpec extends SpecBase {
  kind: 'range';
  start: string;
  end: string;
}

export type AgendaSpec = TimedSpec | AllDaySpec | RangeSpec;

export interface AgendaSchedule {
  specs: AgendaSpec[];
  /** Líneas con días de semana y hora pero sin fechas ("Todos los miércoles, de 16 a 18 h"). */
  weekly: string[];
  warnings: string[];
}

export interface AgendaScheduleInput {
  /** Líneas de texto del contenido, en orden. */
  lines: readonly string[];
  now: DateTime;
  anchor: DateTime;
}

const WEEKDAY_WORD_RE = new RegExp(`\\b(?:${WEEKDAY_ALT})\\b`);
const WEEKLY_LINE_MAX = 160;

function lineStatus(cleaned: string): ParsedOccurrenceStatus | 'rescheduled' | null {
  const s = detectStatusEs(cleaned);
  return s === 'cancelled' || s === 'postponed' || s === 'sold_out' || s === 'rescheduled'
    ? s
    : null;
}

/** Último instante que vale de una especificación (YYYY-MM-DD de fin). */
export function specEndDate(spec: AgendaSpec): string {
  return spec.kind === 'range' ? spec.end : spec.date;
}

/** Texto de la agenda → funciones. Puro: el año sale de `now` y de la modificación del ítem. */
export function parseAgendaSchedule(input: AgendaScheduleInput): AgendaSchedule {
  const warnings: string[] = [];
  const ctx: YearContext = { now: input.now, anchor: input.anchor };
  const timed = new Map<string, TimedSpec>();
  const allDay = new Map<string, AllDaySpec>();
  /** Días con función leída de una línea con hora propia. */
  const ownTimeDays = new Set<string>();
  const ranges: RangeSpec[] = [];
  const weekly: string[] = [];

  const lines = input.lines;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = (lines[i] ?? '').trim();
    if (!raw) continue;
    const warn: Warn = (m) => warnings.push(`"${raw}": ${m}`);
    const parsed = parseDateLine(raw);
    if (!parsed) {
      const cleaned = normalizeLine(raw);
      if (
        cleaned.length <= WEEKLY_LINE_MAX &&
        WEEKDAY_WORD_RE.test(cleaned) &&
        !TIME_ONLY_LINE_RE.test(cleaned) &&
        parseTimes(cleaned).length > 0
      ) {
        weekly.push(raw);
      }
      continue;
    }
    const status = lineStatus(normalizeLine(raw));
    if (status === 'rescheduled') {
      warn('aviso de reprogramación: no se publican las fechas de esta línea');
      continue;
    }
    if (parsed.loose > 0) warn(`${parsed.loose} número(s) de día sin mes, se ignoran`);

    if (parsed.range) {
      const r = resolveRange(parsed.range.from, parsed.range.to, ctx, warn);
      if (r)
        ranges.push({ kind: 'range', start: r.start, end: r.end, lineIndex: i, sourceText: raw });
      continue;
    }

    const dates = parsed.days
      .map((d) => resolveDay(d, ctx, warn))
      .filter((d): d is string => d !== null);
    if (dates.length === 0) continue;

    let slots = parseTimes(parsed.rest, warn);
    let sourceText = raw;
    let fromNextLine = false;
    if (slots.length === 0) {
      const next = (lines[i + 1] ?? '').trim();
      const nextSlots = next ? leadingTimes(next) : [];
      // Cabecera de día + "16.30 h – Performance": la función empieza con la PRIMERA hora.
      if (nextSlots[0]) {
        slots = [nextSlots[0]];
        sourceText = `${raw} · ${next}`;
        fromNextLine = true;
      }
    }
    const occStatus: ParsedOccurrenceStatus = status ?? 'scheduled';

    if (slots.length === 0) {
      for (const date of dates) {
        if (!allDay.has(date)) {
          allDay.set(date, {
            kind: 'all_day',
            date,
            lineIndex: i,
            sourceText,
            status: occStatus,
          });
        }
      }
      continue;
    }
    for (const date of dates) {
      if (fromNextLine && ownTimeDays.has(date)) continue;
      if (!fromNextLine) ownTimeDays.add(date);
      for (const slot of slots) {
        const key = `${date}|${formatTime(slot.start)}`;
        if (timed.has(key)) continue;
        timed.set(key, {
          kind: 'timed',
          date,
          start: slot.start,
          end: slot.end,
          lineIndex: i,
          sourceText,
          status: occStatus,
        });
      }
    }
  }

  const timedDays = new Set([...timed.values()].map((s) => s.date));
  const specs: AgendaSpec[] = [
    ...timed.values(),
    ...[...allDay.values()].filter((s) => !timedDays.has(s.date)),
  ].sort((a, b) => {
    const ka = a.kind === 'timed' ? `${a.date}T${formatTime(a.start)}` : `${specEndDate(a)}T`;
    const kb = b.kind === 'timed' ? `${b.date}T${formatTime(b.start)}` : `${specEndDate(b)}T`;
    return ka.localeCompare(kb);
  });

  if (specs.length === 0 && ranges[0]) {
    specs.push(ranges[0]);
    if (ranges.length > 1) warnings.push('varios rangos de fechas: se publica solo el primero');
  } else if (ranges.length > 0) {
    warnings.push('rango de fechas junto a funciones concretas: se publican solo las funciones');
  }
  if (specs.length === 0 && weekly.length > 0) {
    warnings.push(`patrón semanal sin fechas publicadas ("${weekly[0]}"): no se emiten funciones`);
  }
  return { specs, weekly, warnings };
}

// ── Exposiciones ───────────────────────────────────────────────────────────

export interface PublishedDate {
  day: number | null;
  month: number;
  year: number | null;
}

const PUBLISHED_DATE_RE = new RegExp(
  `^(?:inicio|fin|desde|hasta)?\\s*:?\\s*(?:el\\s+)?(?:(\\d{1,2})\\s+de\\s+)?(${MONTH_ALT})(?:\\s+(?:de|del)\\s+(\\d{4}))?\\.?$`,
);

/** "Inicio: 20 de Agosto de 2026" · "Fin: Febrero de 2027" · "Hasta el 28 de Febrero de 2027". */
export function parsePublishedDate(text: string | null | undefined): PublishedDate | null {
  const m = PUBLISHED_DATE_RE.exec(normalizeLine(text ?? ''));
  if (!m) return null;
  const month = MONTHS[m[2] ?? ''];
  if (!month) return null;
  return {
    day: m[1] !== undefined ? Number(m[1]) : null,
    month,
    year: m[3] !== undefined ? Number(m[3]) : null,
  };
}

function exactLocal(p: PublishedDate | null): string | null {
  if (!p || p.day === null || p.year === null) return null;
  return toLocal(p.year, p.month, p.day);
}

/** "Hasta el 28 de Febrero de 2027" → "2027-02-28"; null si no publica día y año. */
export function publishedDay(text: string | null | undefined): string | null {
  return exactLocal(parsePublishedDate(text));
}

export interface ExhibitionDatesInput {
  /** "Inicio: …" de la ficha. */
  startText: string | null;
  /** "Fin: …" de la ficha. */
  endText: string | null;
  /** "Hasta el …" de la tarjeta del listado. */
  untilText: string | null;
  /** true si el sitio la lista en la pestaña "Presentes" (en cartel hoy). */
  current: boolean;
  now: DateTime;
}

export interface ExhibitionDates {
  range: { start: string; end: string } | null;
  /** El inicio publicado no tiene día ("Inicio: Abril de 2026") y la muestra está en cartel. */
  startsToday: boolean;
  sourceText: string;
  warnings: string[];
}

/**
 * Rango de una muestra con lo que publica el sitio:
 *  · fin: día exacto de "Fin:" o de "Hasta el …" (si ambos son exactos deben coincidir; si
 *    "Fin:" solo da el mes, "Hasta el …" debe caer en ese mes). Sin fin exacto → nada.
 *  · inicio: día exacto de "Inicio:". Si solo publica el mes ("Inicio: Abril de 2026") y la muestra
 *    está en "Presentes", el rango empieza HOY (como "hasta el X" en parseDateRangeEs: no se
 *    inventa el día de apertura). Una muestra futura sin día de inicio → nada.
 */
export function exhibitionRange(input: ExhibitionDatesInput): ExhibitionDates {
  const warnings: string[] = [];
  const sourceText = [input.startText, input.endText, input.untilText]
    .map((t) => (t ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0)
    .join(' · ');
  const none = (why: string): ExhibitionDates => {
    warnings.push(why);
    return { range: null, startsToday: false, sourceText, warnings };
  };

  const start = parsePublishedDate(input.startText);
  const end = parsePublishedDate(input.endText);
  const until = parsePublishedDate(input.untilText);
  const endExact = exactLocal(end);
  const untilExact = exactLocal(until);

  if (endExact && untilExact && endExact !== untilExact) {
    return none(`cierre contradictorio: ficha ${endExact}, listado ${untilExact}`);
  }
  const endLocal = endExact ?? untilExact;
  if (!endLocal) return none(`sin día de cierre publicado ("${sourceText || '—'}")`);
  if (
    !endExact &&
    end &&
    end.year !== null &&
    endLocal.slice(0, 7) !== `${end.year}-${pad2(end.month)}`
  ) {
    return none(`cierre contradictorio: ficha "${input.endText}", listado ${endLocal}`);
  }

  const today = todayOf(input.now);
  let startLocal = exactLocal(start);
  let startsToday = false;
  if (!startLocal) {
    if (!input.current) {
      return none(`muestra próxima sin día de inicio publicado ("${input.startText ?? '—'}")`);
    }
    startLocal = today;
    startsToday = true;
    warnings.push(
      `inicio sin día publicado ("${input.startText ?? '—'}"): la muestra está en cartel, el rango empieza hoy`,
    );
  }
  if (endLocal < startLocal) {
    return none(
      startsToday
        ? `la muestra cerró el ${endLocal} aunque el sitio la lista en cartel`
        : `rango invertido ${startLocal} – ${endLocal}`,
    );
  }
  return { range: { start: startLocal, end: endLocal }, startsToday, sourceText, warnings };
}
