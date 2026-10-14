import {
  BA_TZ,
  detectStatusEs,
  inferYear,
  type LocalDateParts,
  type LocalTimeParts,
  type ParsedOccurrenceStatus,
  parseDateRangeEs,
  partsToLocalDate,
  stripDiacriticsLower,
} from '@culturaba/shared';
import { DateTime } from 'luxon';

/**
 * Parser PURO del texto de funciones del Complejo Teatral ("Funciones:" del detalle =
 * `.list-data .date` del listado). El sitio publica tres formas, en texto libre:
 *
 *  1. Fechas enumeradas con hora: "Viernes 16, sábado 17 y domingo 18 de octubre, 20 horas"
 *     "Jueves 29 de octubre, 16.30 y 20.30 horas" · "Domingo 18 de octubre. 18 horas"
 *     → ocurrencias `timed` exactas.
 *  2. Patrón semanal: "Jueves a domingos, 19.30 horas" · "Miércoles a sábados, 20.30 horas.
 *     Domingos, 19.30 horas", a veces con rango ("Desde el 17/10 hasta el 1°/11").
 *     NO se expande a ciegas: solo se emite una función por cada día en que la agenda
 *     del sitio (/agenda/?fecha=) listó la producción, con la hora que el patrón asigna
 *     a ese día de semana. Día listado sin hora para ese día de semana → aviso, sin función.
 *  3. Rangos (muestras, ciclos): "Del 15 de septiembre al 28 de noviembre, de lunes a
 *     sábados de 11 a 20 horas" → una ocurrencia `range` con scheduleText literal.
 *     Sin fin publicado ("A partir del 8 de octubre", "Marzo a noviembre") → nada.
 *
 * Los avisos en rojo de la sinopsis se aplican como excepciones ("… no habrá funciones"),
 * límites de temporada ("Desde el 24 de octubre") o estado (cancelada/agotada/postergada).
 * Nunca se inventa una fecha ni una hora: lo que no se puede afirmar queda como aviso.
 */

export interface ScheduleInput {
  /** Texto de "Funciones:" (detalle) o del listado. */
  functionsText: string;
  /** Avisos en rojo de la sinopsis (texto plano). */
  notes?: string[];
  /** Días YYYY-MM-DD en los que la agenda por día del sitio listó la producción. */
  agendaDays?: string[];
  /** Grilla de ciclos de cine (.details h4), una línea por función; solo si no hay otra fecha. */
  gridLines?: string[];
  now: DateTime;
}

export interface TimedSpec {
  kind: 'timed';
  date: string;
  time: LocalTimeParts;
  sourceText: string;
  status: ParsedOccurrenceStatus;
  statusReason?: string;
}

export interface RangeSpec {
  kind: 'range';
  start: string;
  end: string;
  scheduleText: string;
  sourceText: string;
}

export type OccurrenceSpec = TimedSpec | RangeSpec;

export type ScheduleForm = 'enumerated' | 'weekly' | 'range' | 'grid' | 'none';

export interface ScheduleResult {
  specs: OccurrenceSpec[];
  form: ScheduleForm;
  warnings: string[];
}

// ── Léxico ─────────────────────────────────────────────────────────────────

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
const WEEKDAY_SRC = '(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';

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
const MONTH_SRC = Object.keys(MONTHS).join('|');

/** Minúsculas sin acentos, ordinales (1°, 1º, 1ro) → 1, guiones tipográficos → '-'. */
export function cleanText(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[‒–—―]/g, '-')
    .replace(/(\d{1,2})\s*[°º]/g, '$1')
    .replace(/\b(\d{1,2})(?:ro|ero)\b/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function condense(text: string): string {
  return text
    .replace(/\s*\n+\s*/g, ' · ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Segmentos: por línea y por ". " seguido de un día de semana ("… 20.30 horas. Domingos, 19.30"). */
export function splitSegments(text: string): string[] {
  const BY_WEEKDAY =
    /\.\s+(?=(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\b)/i;
  return text
    .split(/\r?\n+/)
    .flatMap((line) => line.split(BY_WEEKDAY))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

// ── Horas ──────────────────────────────────────────────────────────────────

/** "de 11 a 20 horas" / "14 a 21 horas": horario de apertura, no funciones. */
const HOURS_RANGE_RE =
  /\b(?:de\s+)?(\d{1,2})(?:[.:]\d{2})?\s+a\s+(?:las\s+)?(\d{1,2})(?:[.:]\d{2})?\s*(?:horas?|hs\.?|h)\b/;
/** "20 horas" · "19.30 horas" · "16.30 y 20.30 horas" · "a las 15 horas" · "20 hs". */
const TIME_LIST_RE =
  /(?:\ba las\s+)?((?:\d{1,2}(?:[.:]\d{2})?\s*(?:,\s*|y\s+)?)+)\s*(?:horas?|hs\.?|h)\b/;
const TIME_TOKEN_RE = /(\d{1,2})(?:[.:](\d{2}))?/g;

function extractTimes(cleaned: string): { times: LocalTimeParts[]; rest: string } {
  const m = TIME_LIST_RE.exec(cleaned);
  if (!m || m[1] === undefined) return { times: [], rest: cleaned };
  const times: LocalTimeParts[] = [];
  for (const t of m[1].matchAll(TIME_TOKEN_RE)) {
    const hour = Number(t[1]);
    const minute = t[2] !== undefined ? Number(t[2]) : 0;
    if (hour > 23 || minute > 59) continue;
    times.push({ hour, minute });
  }
  const rest = `${cleaned.slice(0, m.index)} ${cleaned.slice(m.index + m[0].length)}`;
  return { times, rest: rest.replace(/\s+/g, ' ').trim() };
}

// ── Fechas enumeradas ──────────────────────────────────────────────────────

interface DateItem {
  weekday: number | null;
  day: number;
  month: number | null;
  start: number;
  end: number;
}

const DATE_ITEM_RE = new RegExp(
  `(?:\\b${WEEKDAY_SRC}\\s+)?\\b(\\d{1,2})(?:\\/(\\d{1,2}))?\\b(?:\\s*(?:de\\s+)?\\b(${MONTH_SRC})\\b)?`,
  'g',
);
const CONNECTOR_RE = /^\s*(?:,\s*y|,|y)?\s*$/;

/**
 * "sabados 10 y 17, y domingos 11 y 18 de octubre" → [10/10, 17/10, 11/10, 18/10].
 * Un número sin mes solo cuenta si está encadenado (", " / " y ") hasta un número con mes;
 * así "2 funciones" no se convierte en una fecha. Verifica el día de semana cuando viene.
 */
export function scanDates(
  cleaned: string,
  now: DateTime,
  warnings: string[],
  context: string,
): LocalDateParts[] {
  const items: DateItem[] = [];
  for (const m of cleaned.matchAll(DATE_ITEM_RE)) {
    const day = Number(m[2]);
    if (!Number.isFinite(day) || day < 1 || day > 31) continue;
    const numericMonth = m[3] !== undefined ? Number(m[3]) : null;
    const monthName = m[4] !== undefined ? MONTHS[m[4]] : undefined;
    const month = monthName ?? numericMonth;
    if (month !== null && (month < 1 || month > 12)) continue;
    const weekdayToken = m[1] !== undefined ? WEEKDAYS[m[1]] : undefined;
    items.push({
      weekday: weekdayToken ?? null,
      day,
      month,
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // Propagar el mes hacia atrás solo a través de conectores (", " / " y ").
  for (let i = items.length - 2; i >= 0; i -= 1) {
    const current = items[i];
    const next = items[i + 1];
    if (!current || !next || current.month !== null) continue;
    const between = cleaned.slice(current.end, next.start);
    if (CONNECTOR_RE.test(between) && next.month !== null) current.month = next.month;
  }

  const result: LocalDateParts[] = [];
  for (const item of items) {
    if (item.month === null) {
      warnings.push(`${context}: número suelto sin mes ("${item.day}"), se ignora`);
      continue;
    }
    const year = inferYear(item.month, item.day, { now });
    if (year === null) {
      warnings.push(`${context}: no se pudo inferir el año de ${item.day}/${item.month}`);
      continue;
    }
    const parts = { year, month: item.month, day: item.day };
    let local: string;
    try {
      local = partsToLocalDate(parts);
    } catch {
      warnings.push(`${context}: fecha inexistente ${item.day}/${item.month}`);
      continue;
    }
    if (item.weekday !== null) {
      const actual = DateTime.fromISO(local, { zone: BA_TZ }).weekday;
      if (actual !== item.weekday) {
        warnings.push(`${context}: el día de semana no coincide con ${local}, se ignora`);
        continue;
      }
    }
    result.push(parts);
  }
  return result;
}

// ── Rangos y límites ───────────────────────────────────────────────────────

const NUMERIC_RANGE_RE =
  /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:al|hasta el|hasta|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const START_ONLY_RE = new RegExp(
  `\\b(?:desde el|desde|a partir del|a partir de el)\\s+(?:${WEEKDAY_SRC}\\s+)?(\\d{1,2})(?:\\/(\\d{1,2})|\\s*(?:de\\s+)?(${MONTH_SRC}))\\b`,
);

function stripWeekdays(cleaned: string): string {
  return cleaned.replace(new RegExp(`\\b${WEEKDAY_SRC}\\s+(?=\\d)`, 'g'), '');
}

function toLocal(parts: LocalDateParts): string | null {
  try {
    return partsToLocalDate(parts);
  } catch {
    return null;
  }
}

function yearOf(token: string | undefined, fallback: number): number {
  if (token === undefined) return fallback;
  const y = Number(token);
  return y < 100 ? 2000 + y : y;
}

/** Rango con ambos extremos: "del 15 al 22 de octubre", "17/10 hasta el 1/11", "del 23 de octubre al 6 de noviembre". */
export function detectRange(cleaned: string, now: DateTime): { start: string; end: string } | null {
  const n = NUMERIC_RANGE_RE.exec(cleaned);
  if (n) {
    const sm = Number(n[2]);
    const sd = Number(n[1]);
    const em = Number(n[5]);
    const ed = Number(n[4]);
    const sy = n[3] !== undefined ? yearOf(n[3], now.year) : inferYear(sm, sd, { now });
    if (sy === null) return null;
    let ey = n[6] !== undefined ? yearOf(n[6], sy) : sy;
    if (n[6] === undefined && (em < sm || (em === sm && ed < sd))) ey = sy + 1;
    const start = toLocal({ year: sy, month: sm, day: sd });
    const end = toLocal({ year: ey, month: em, day: ed });
    return start && end && end >= start ? { start, end } : null;
  }
  const r = parseDateRangeEs(stripWeekdays(cleaned), { now });
  if (!r) return null;
  const start = toLocal(r.start);
  const end = toLocal(r.end);
  return start && end && end >= start ? { start, end } : null;
}

/** Solo inicio: "desde el 24 de octubre", "a partir del sábado 31 de octubre". */
export function detectStartOnly(cleaned: string, now: DateTime): string | null {
  const m = START_ONLY_RE.exec(cleaned);
  if (!m || m[2] === undefined) return null;
  const day = Number(m[2]);
  const month = m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? MONTHS[m[4]] : undefined;
  if (month === undefined || month < 1 || month > 12) return null;
  const year = inferYear(month, day, { now });
  if (year === null) return null;
  return toLocal({ year, month, day });
}

// ── Patrón semanal ─────────────────────────────────────────────────────────

const WEEKDAY_TOKEN_RE = new RegExp(`\\b${WEEKDAY_SRC}\\b`, 'g');

/** "jueves a domingos" → [4,5,6,7]; "sabados y domingos" → [6,7]; "lunes, miercoles y viernes" → [1,3,5]. */
export function scanWeekdays(cleaned: string): number[] {
  const tokens = [...cleaned.matchAll(WEEKDAY_TOKEN_RE)].map((m) => ({
    weekday: WEEKDAYS[m[1] ?? ''] ?? 0,
    start: m.index,
    end: m.index + m[0].length,
  }));
  const days = new Set<number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t || t.weekday === 0) continue;
    const next = tokens[i + 1];
    const between = next ? cleaned.slice(t.end, next.start) : '';
    if (next && next.weekday !== 0 && /^\s+a\s+$/.test(between)) {
      let d = t.weekday;
      days.add(d);
      while (d !== next.weekday) {
        d = d === 7 ? 1 : d + 1;
        days.add(d);
      }
      i += 1;
    } else {
      days.add(t.weekday);
    }
  }
  return [...days].sort((a, b) => a - b);
}

// ── Segmentos ──────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  cleaned: string;
  times: LocalTimeParts[];
  openingHours: boolean;
  range: { start: string; end: string } | null;
  startOnly: string | null;
  dates: LocalDateParts[];
  weekdays: number[];
  status: ParsedOccurrenceStatus | null;
}

function parsedStatus(text: string): ParsedOccurrenceStatus | null {
  const s = detectStatusEs(text);
  return s === 'cancelled' || s === 'postponed' || s === 'sold_out' ? s : null;
}

function analyzeSegment(text: string, now: DateTime, warnings: string[]): Segment {
  let cleaned = cleanText(text);
  let openingHours = false;
  const hours = HOURS_RANGE_RE.exec(cleaned);
  if (hours) {
    openingHours = true;
    cleaned = `${cleaned.slice(0, hours.index)} ${cleaned.slice(hours.index + hours[0].length)}`
      .replace(/\s+/g, ' ')
      .trim();
  }
  const { times, rest } = extractTimes(cleaned);
  const range = detectRange(rest, now);
  const startOnly = range ? null : detectStartOnly(rest, now);
  const dates = range || startOnly ? [] : scanDates(rest, now, warnings, `"${text}"`);
  const weekdays = dates.length === 0 && !range && !startOnly ? scanWeekdays(rest) : [];
  return {
    text,
    cleaned,
    times,
    openingHours,
    range,
    startOnly,
    dates,
    weekdays,
    status: parsedStatus(text),
  };
}

// ── Avisos en rojo ─────────────────────────────────────────────────────────

const NO_FUNCTION_RE =
  /no habra funcion|no hay funcion|sin funcion|no se realizara|no habra actividad/;

interface NoteEffects {
  excluded: Set<string>;
  start: string | null;
  end: string | null;
  statuses: Array<{ dates: string[] | null; status: ParsedOccurrenceStatus; reason: string }>;
}

function analyzeNotes(notes: string[], now: DateTime, warnings: string[]): NoteEffects {
  const effects: NoteEffects = { excluded: new Set(), start: null, end: null, statuses: [] };
  for (const note of notes) {
    const cleaned = cleanText(note).replace(/\s+/g, ' ');
    if (!cleaned) continue;
    if (NO_FUNCTION_RE.test(cleaned)) {
      const dates = scanDates(cleaned, now, warnings, `aviso "${condense(note)}"`);
      if (dates.length === 0) {
        warnings.push(`aviso de suspensión sin fechas reconocibles: "${condense(note)}"`);
      }
      for (const d of dates) {
        const local = toLocal(d);
        if (local) effects.excluded.add(local);
      }
      continue;
    }
    const status = parsedStatus(note);
    if (status) {
      const dates = scanDates(cleaned, now, [], 'aviso')
        .map(toLocal)
        .filter((d): d is string => d !== null);
      effects.statuses.push({ dates: dates.length ? dates : null, status, reason: condense(note) });
      continue;
    }
    if (/^(desde|del|a partir)\b/.test(cleaned)) {
      const range = detectRange(cleaned, now);
      if (range) {
        effects.start = range.start;
        effects.end = range.end;
        continue;
      }
      const start = detectStartOnly(cleaned, now);
      if (start) effects.start = start;
    }
  }
  return effects;
}

// ── Orquestación ───────────────────────────────────────────────────────────

function timeKey(t: LocalTimeParts): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

export function formatTime(t: LocalTimeParts): string {
  return timeKey(t);
}

/** Parse puro: texto de funciones (+ avisos, + días de la agenda) → especificaciones de ocurrencias. */
export function parseSchedule(input: ScheduleInput): ScheduleResult {
  const warnings: string[] = [];
  const now = input.now.setZone(BA_TZ);
  const text = input.functionsText.trim();
  const segments = splitSegments(text).map((s) => analyzeSegment(s, now, warnings));
  const notes = analyzeNotes(input.notes ?? [], now, warnings);

  const timed = new Map<string, TimedSpec>();
  const addTimed = (
    date: string,
    time: LocalTimeParts,
    sourceText: string,
    status: ParsedOccurrenceStatus | null,
  ) => {
    const key = `${date}|${timeKey(time)}`;
    if (timed.has(key)) return;
    if (notes.excluded.has(date)) {
      warnings.push(`función ${date} ${timeKey(time)} excluida por aviso del sitio`);
      return;
    }
    timed.set(key, { kind: 'timed', date, time, sourceText, status: status ?? 'scheduled' });
  };

  // 1) Fechas enumeradas con hora.
  let form: ScheduleForm = 'none';
  for (const seg of segments) {
    if (seg.dates.length === 0) continue;
    if (seg.times.length === 0) {
      warnings.push(`fecha sin hora publicada: "${seg.text}" (no se emite función)`);
      continue;
    }
    form = 'enumerated';
    for (const d of seg.dates) {
      const local = toLocal(d);
      if (!local) continue;
      for (const t of seg.times) addTimed(local, t, seg.text, seg.status);
    }
  }

  // 2) Patrón semanal → solo los días confirmados por la agenda del sitio.
  const weekly = new Map<number, LocalTimeParts[]>();
  let weeklyStatus: ParsedOccurrenceStatus | null = null;
  for (const seg of segments) {
    if (seg.weekdays.length === 0 || seg.openingHours) continue;
    if (seg.times.length === 0) {
      warnings.push(`días de semana sin hora: "${seg.text}"`);
      continue;
    }
    for (const wd of seg.weekdays) weekly.set(wd, [...(weekly.get(wd) ?? []), ...seg.times]);
    weeklyStatus = weeklyStatus ?? seg.status;
  }
  const bounds = {
    start:
      notes.start ??
      segments.find((s) => s.range)?.range?.start ??
      segments.find((s) => s.startOnly)?.startOnly ??
      null,
    end: notes.end ?? segments.find((s) => s.range)?.range?.end ?? null,
  };
  if (weekly.size > 0) {
    if (form === 'none') form = 'weekly';
    const days = [...new Set(input.agendaDays ?? [])].sort();
    if (days.length === 0) {
      warnings.push(
        'patrón semanal sin días confirmados por la agenda del sitio: no se emiten funciones',
      );
    }
    const outOfRange: string[] = [];
    for (const day of days) {
      if ((bounds.start && day < bounds.start) || (bounds.end && day > bounds.end)) {
        outOfRange.push(day);
        continue;
      }
      const weekday = DateTime.fromISO(day, { zone: BA_TZ }).weekday;
      const times = weekly.get(weekday);
      if (!times) {
        warnings.push(
          `la agenda lista el ${day} pero el patrón no publica hora para ese día de semana`,
        );
        continue;
      }
      for (const t of times) addTimed(day, t, condense(text), weeklyStatus);
    }
    if (outOfRange.length) {
      warnings.push(
        `la agenda lista ${outOfRange.length} día(s) fuera del rango publicado (${bounds.start ?? '…'} – ${bounds.end ?? '…'}): ${outOfRange.join(', ')}`,
      );
    }
  }

  // 3) Rango puro (muestras, ciclos) cuando no hay funciones concretas.
  const specs: OccurrenceSpec[] = [...timed.values()].sort((a, b) =>
    `${a.date}T${timeKey(a.time)}`.localeCompare(`${b.date}T${timeKey(b.time)}`),
  );
  if (specs.length === 0 && weekly.size === 0) {
    const rangeSeg = segments.find((s) => s.range);
    if (rangeSeg?.range) {
      form = 'range';
      specs.push({
        kind: 'range',
        start: rangeSeg.range.start,
        end: rangeSeg.range.end,
        scheduleText: condense(text),
        sourceText: condense(text),
      });
    } else if (segments.some((s) => s.startOnly)) {
      warnings.push(`rango sin fin publicado: "${condense(text)}" (no se emite ocurrencia)`);
    } else if (text.length === 0) {
      warnings.push('sin texto de funciones');
    } else if (!segments.some((s) => s.dates.length > 0 || s.weekdays.length > 0)) {
      warnings.push(`texto de funciones no reconocido: "${condense(text)}"`);
    }
  }

  // 4) Grilla de ciclos de cine (.details h4): solo si no hubo nada y todas las líneas parsean.
  if (specs.length === 0 && input.gridLines && input.gridLines.length > 0) {
    const gridWarnings: string[] = [];
    const gridSpecs: TimedSpec[] = [];
    let complete = true;
    for (const line of input.gridLines) {
      const seg = analyzeSegment(line, now, gridWarnings);
      if (seg.dates.length === 0 || seg.times.length === 0) {
        complete = false;
        break;
      }
      for (const d of seg.dates) {
        const local = toLocal(d);
        if (!local) continue;
        for (const t of seg.times) {
          gridSpecs.push({
            kind: 'timed',
            date: local,
            time: t,
            sourceText: line,
            status: seg.status ?? 'scheduled',
          });
        }
      }
    }
    if (complete && gridSpecs.length > 0) {
      form = 'grid';
      warnings.push(...gridWarnings);
      const seen = new Set<string>();
      for (const s of gridSpecs) {
        const key = `${s.date}|${timeKey(s.time)}`;
        if (seen.has(key) || notes.excluded.has(s.date)) continue;
        seen.add(key);
        specs.push(s);
      }
      specs.sort((a, b) =>
        a.kind === 'timed' && b.kind === 'timed'
          ? `${a.date}T${timeKey(a.time)}`.localeCompare(`${b.date}T${timeKey(b.time)}`)
          : 0,
      );
      warnings.push(`funciones tomadas de la grilla del ciclo (${gridSpecs.length} líneas)`);
    } else if (gridSpecs.length > 0 || !complete) {
      warnings.push('grilla del ciclo con líneas no reconocidas: se ignora');
    }
  }

  // 5) Estados por aviso (fechas puntuales o todo el evento).
  for (const s of notes.statuses) {
    for (const spec of specs) {
      if (spec.kind !== 'timed') continue;
      if (s.dates === null || s.dates.includes(spec.date)) {
        spec.status = s.status;
        spec.statusReason = s.reason;
      }
    }
  }

  return { specs, form, warnings };
}
