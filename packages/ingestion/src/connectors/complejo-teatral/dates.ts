import {
  BA_TZ,
  detectStatusEs,
  type LocalDateParts,
  type LocalTimeParts,
  type ParsedOccurrenceStatus,
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
 *     → ocurrencias `timed` exactas. Cada fecha toma la lista de horas que la sigue.
 *  2. Patrón semanal: "Jueves a domingos, 19.30 horas" · "Miércoles a sábados, 20.30 horas.
 *     Domingos, 19.30 horas". Solo se emite con temporada publicada (inicio Y fin, en el
 *     texto o en un aviso: "Desde el 17/10 hasta el 1°/11"), y solo los días de esa
 *     temporada en que la agenda del sitio (/agenda/?fecha=) listó la producción, con la
 *     hora que el patrón asigna a ese día de semana. La agenda sola no alcanza: lista días
 *     fuera de temporada (Todos los ángeles, Oxitocina, Godot, Lavelli en los fixtures).
 *  3. Rangos (muestras, ciclos): "Del 15 de septiembre al 28 de noviembre, de lunes a
 *     sábados de 11 a 20 horas" → una ocurrencia `range` con scheduleText literal.
 *     Sin inicio o sin fin publicado ("A partir del 8 de octubre", "Hasta el …") → nada.
 *
 * Ciclos de cine: cuando "Funciones:" no da horas, se lee la grilla de .details en orden
 * ("Miércoles 28" + "A las 18 horas"; "Jueves 15, 17.30 horas"); ver parseGrid.
 *
 * Año: el sitio casi nunca lo publica. Una fecha toma el año en que no quedó más de 60 días
 * atrás (un rango, según su FIN) y se verifica con el día de semana publicado; sin día de
 * semana ni año, solo se acepta hasta ~6 meses adelante.
 *
 * Los avisos en rojo de la sinopsis se aplican como excepciones ("… no habrá funciones"),
 * límites de temporada ("Desde el 24 de octubre", "Hasta el …") o estado
 * (cancelada/agotada/postergada). Un día sin mes se resuelve contra las funciones ya
 * leídas, verificando el día de semana; si una suspensión no se puede atribuir, no se
 * publica ninguna función. Nunca se inventa una fecha ni una hora: lo que no se puede
 * afirmar queda como aviso.
 */

export interface ScheduleInput {
  /** Texto de "Funciones:" (detalle) o del listado. */
  functionsText: string;
  /** Avisos en rojo de la sinopsis (texto plano). */
  notes?: string[];
  /** Días YYYY-MM-DD en los que la agenda por día del sitio listó la producción. */
  agendaDays?: string[];
  /** Líneas de .details en orden (ciclos de cine); solo se usan si "Funciones:" no da horas. */
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

type Warn = (message: string) => void;

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

function weekdayNumber(token: string | undefined): number | null {
  return token !== undefined ? (WEEKDAYS[token] ?? null) : null;
}

// ── Fechas y año ───────────────────────────────────────────────────────────

/** Una fecha sin año se acepta hasta 60 días atrás (misma tolerancia que inferYear de shared). */
const PAST_TOLERANCE_DAYS = 60;
/**
 * shortcut: sin año ni día de semana que lo confirmen, una fecha inferida solo se acepta
 * hasta ~6 meses adelante (más lejos es ambiguo: ¿página vieja o próxima temporada?).
 * Revisar si el sitio empieza a anunciar con más anticipación sin día de semana.
 */
const UNVERIFIED_HORIZON_DAYS = 183;

interface DateRef {
  day: number;
  month: number;
  /** Año publicado en el texto (null = inferir). */
  year: number | null;
  /** Día de semana publicado (1 = lunes … 7 = domingo), para verificar la fecha. */
  weekday: number | null;
}

function toLocal(parts: LocalDateParts): string | null {
  try {
    return partsToLocalDate(parts);
  } catch {
    return null;
  }
}

function weekdayOf(local: string): number {
  return DateTime.fromISO(local, { zone: BA_TZ }).weekday;
}

function daysFromNow(local: string, now: DateTime): number {
  return DateTime.fromISO(local, { zone: BA_TZ }).diff(now.setZone(BA_TZ).startOf('day'), 'days')
    .days;
}

function yearToken(token: string | undefined): number | null {
  if (token === undefined) return null;
  const year = Number(token);
  return year < 100 ? 2000 + year : year;
}

/** Año de dd/mm sin año: el primero (desde el anterior) en que la fecha no queda > 60 días atrás. */
function yearFor(month: number, day: number, now: DateTime): number | null {
  const base = now.setZone(BA_TZ).year;
  for (const year of [base - 1, base, base + 1]) {
    const local = toLocal({ year, month, day });
    if (local && daysFromNow(local, now) >= -PAST_TOLERANCE_DAYS) return year;
  }
  return null;
}

/** dd/mm/aaaa → YYYY-MM-DD si existe y coincide con el día de semana publicado. */
function checkDate(ref: DateRef, year: number, warn: Warn): string | null {
  const local = toLocal({ year, month: ref.month, day: ref.day });
  if (!local) {
    warn(`fecha inexistente ${ref.day}/${ref.month}, se ignora`);
    return null;
  }
  if (ref.weekday !== null && weekdayOf(local) !== ref.weekday) {
    warn(`el día de semana no coincide con ${local}, se ignora`);
    return null;
  }
  return local;
}

function unverified(...refs: DateRef[]): boolean {
  return refs.every((r) => r.year === null && r.weekday === null);
}

/** Fecha suelta: año publicado o inferido, verificado con el día de semana cuando viene. */
function resolveDate(ref: DateRef, now: DateTime, warn: Warn): string | null {
  const year = ref.year ?? yearFor(ref.month, ref.day, now);
  if (year === null) {
    warn(`fecha inexistente ${ref.day}/${ref.month}, se ignora`);
    return null;
  }
  const local = checkDate(ref, year, warn);
  if (local && unverified(ref) && daysFromNow(local, now) > UNVERIFIED_HORIZON_DAYS) {
    warn(`año ambiguo para ${ref.day}/${ref.month} (sin año ni día de semana), se ignora`);
    return null;
  }
  return local;
}

export interface Bounds {
  start: string;
  end: string;
}

/**
 * Rango: el año sale del FIN (no más de 60 días atrás) y el inicio queda en ese año o en el
 * anterior. Así una muestra que empezó hace meses no salta al año siguiente.
 */
function resolveRange(from: DateRef, to: DateRef, now: DateTime, warn: Warn): Bounds | null {
  const ordered = from.month < to.month || (from.month === to.month && from.day <= to.day);
  const endYear =
    to.year ??
    (from.year !== null ? from.year + (ordered ? 0 : 1) : yearFor(to.month, to.day, now));
  if (endYear === null) {
    warn(`fecha inexistente ${to.day}/${to.month}, se ignora`);
    return null;
  }
  const start = checkDate(from, from.year ?? endYear - (ordered ? 0 : 1), warn);
  const end = checkDate(to, endYear, warn);
  if (!start || !end) return null;
  if (end < start) {
    warn(`rango invertido ${start} – ${end}, se ignora`);
    return null;
  }
  if (unverified(from, to) && daysFromNow(start, now) > UNVERIFIED_HORIZON_DAYS) {
    warn(`año ambiguo para el rango ${start} – ${end} (sin año ni día de semana), se ignora`);
    return null;
  }
  return { start, end };
}

// ── Rangos y límites de temporada ──────────────────────────────────────────

const WD = `(?:${WEEKDAY_SRC}\\s+)?`;
const RANGE_SEP = `\\s*(?:\\bal\\b|\\bhasta(?:\\s+el)?\\b|-)\\s*`;
const YEAR_SRC = `(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`;
const NUMERIC_DATE = `(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?`;
const TEXT_DATE = `(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_SRC})\\b${YEAR_SRC}`;

/** "17/10 hasta el 1/11" → [wd, d, m, a, wd, d, m, a]. */
const NUMERIC_RANGE_RE = new RegExp(`\\b${WD}${NUMERIC_DATE}${RANGE_SEP}${WD}${NUMERIC_DATE}`);
/** "martes 6 de octubre hasta el domingo 1 de noviembre" → [wd, d, mes, a, wd, d, mes, a]. */
const TEXT_RANGE_RE = new RegExp(`\\b${WD}${TEXT_DATE}${RANGE_SEP}${WD}${TEXT_DATE}`);
/** "16 al 18 de octubre", "12 hasta el 29 de noviembre" → [wd, d, wd, d, mes, a]. */
const SAME_MONTH_RANGE_RE = new RegExp(`\\b${WD}(\\d{1,2})${RANGE_SEP}${WD}${TEXT_DATE}`);
/** "desde el 24 de octubre", "a partir del sábado 31 de octubre", "desde el 17/10". */
const START_ONLY_RE = new RegExp(
  `\\b(?:desde(?:\\s+el)?|a partir del?|a partir de el)\\s+${WD}(?:${NUMERIC_DATE}|${TEXT_DATE})`,
);
/** "hasta el 1 de noviembre", "hasta el domingo 1/11". */
const END_ONLY_RE = new RegExp(`\\bhasta(?:\\s+el)?\\s+${WD}(?:${NUMERIC_DATE}|${TEXT_DATE})`);

function refOf(
  weekday: string | undefined,
  day: string | undefined,
  month: number | undefined,
  year: string | undefined,
): DateRef | null {
  if (day === undefined || month === undefined || Number.isNaN(month)) return null;
  return { day: Number(day), month, year: yearToken(year), weekday: weekdayNumber(weekday) };
}

interface Found<T> {
  /** null: el texto tiene la forma pero la fecha no se puede afirmar (ya avisado). */
  value: T | null;
  match: string;
}

/** Rango con ambos extremos: "del 15 al 22 de octubre", "17/10 hasta el 1/11", "del 23 de octubre al 6 de noviembre". */
export function detectRange(
  cleaned: string,
  now: DateTime,
  warn: Warn = () => {},
): Found<Bounds> | null {
  const pick = (m: RegExpExecArray, from: DateRef | null, to: DateRef | null) => ({
    value: from && to ? resolveRange(from, to, now, warn) : null,
    match: m[0],
  });
  const n = NUMERIC_RANGE_RE.exec(cleaned);
  if (n)
    return pick(n, refOf(n[1], n[2], Number(n[3]), n[4]), refOf(n[5], n[6], Number(n[7]), n[8]));
  const t = TEXT_RANGE_RE.exec(cleaned);
  if (t) {
    return pick(
      t,
      refOf(t[1], t[2], MONTHS[t[3] ?? ''], t[4]),
      refOf(t[5], t[6], MONTHS[t[7] ?? ''], t[8]),
    );
  }
  const s = SAME_MONTH_RANGE_RE.exec(cleaned);
  if (s) {
    const month = MONTHS[s[5] ?? ''];
    return pick(s, refOf(s[1], s[2], month, s[6]), refOf(s[3], s[4], month, s[6]));
  }
  return null;
}

function detectBound(re: RegExp, cleaned: string, now: DateTime, warn: Warn): Found<string> | null {
  const m = re.exec(cleaned);
  if (!m) return null;
  const ref =
    m[2] !== undefined
      ? refOf(m[1], m[2], Number(m[3]), m[4])
      : refOf(m[1], m[5], MONTHS[m[6] ?? ''], m[7]);
  return { value: ref ? resolveDate(ref, now, warn) : null, match: m[0] };
}

/** Solo inicio: "desde el 24 de octubre", "a partir del sábado 31 de octubre". */
export function detectStartOnly(cleaned: string, now: DateTime, warn: Warn = () => {}) {
  return detectBound(START_ONLY_RE, cleaned, now, warn);
}

/** Solo fin: "hasta el 1 de noviembre". Nunca se convierte en un rango que empieza hoy. */
export function detectEndOnly(cleaned: string, now: DateTime, warn: Warn = () => {}) {
  return detectBound(END_ONLY_RE, cleaned, now, warn);
}

// ── Fechas enumeradas ──────────────────────────────────────────────────────

/** [wd, día, mes numérico, año numérico, mes, año]. */
const DATE_ITEM_RE = new RegExp(
  `(?:\\b${WEEKDAY_SRC}\\s+)?\\b(\\d{1,2})(?:\\/(\\d{1,2})(?:\\/(\\d{2,4}))?)?\\b(?:\\s*(?:de\\s+)?\\b(${MONTH_SRC})\\b(?:\\s+de\\s+(\\d{4}))?)?`,
  'g',
);
const CONNECTOR_RE = /^\s*(?:,\s*y|,|y)?\s*$/;

/** Número de día sin mes ("domingo 18"): se resuelve contra fechas conocidas, nunca se adivina. */
interface LooseDay {
  day: number;
  weekday: number | null;
}

interface ScannedDates {
  dates: string[];
  loose: LooseDay[];
  /** Fechas con mes que no se pudieron afirmar (inexistentes, día de semana incoherente…). */
  rejected: number;
  /** Números de día encontrados (con o sin mes). */
  items: number;
}

/**
 * "sabados 10 y 17, y domingos 11 y 18 de octubre" → [10/10, 17/10, 11/10, 18/10].
 * Un número sin mes solo toma el mes de un número posterior encadenado por ", " / " y ";
 * si no, queda suelto (así "2 funciones" no se convierte en una fecha).
 */
export function scanDates(cleaned: string, now: DateTime, warn: Warn = () => {}): ScannedDates {
  const items: Array<{
    ref: DateRef | (Omit<DateRef, 'month'> & { month: null });
    start: number;
    end: number;
  }> = [];
  let count = 0;
  for (const m of cleaned.matchAll(DATE_ITEM_RE)) {
    count += 1;
    const day = Number(m[2]);
    if (day < 1 || day > 31) continue;
    const month =
      m[5] !== undefined ? (MONTHS[m[5]] ?? null) : m[3] !== undefined ? Number(m[3]) : null;
    const base = { day, year: yearToken(m[6] ?? m[4]), weekday: weekdayNumber(m[1]) };
    items.push({
      ref: month === null ? { ...base, month: null } : { ...base, month },
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // Propagar mes (y año) hacia atrás solo a través de conectores (", " / " y ").
  for (let i = items.length - 2; i >= 0; i -= 1) {
    const current = items[i];
    const next = items[i + 1];
    if (!current || !next || current.ref.month !== null || next.ref.month === null) continue;
    if (CONNECTOR_RE.test(cleaned.slice(current.end, next.start))) {
      current.ref = {
        ...current.ref,
        month: next.ref.month,
        year: current.ref.year ?? next.ref.year,
      };
    }
  }

  const out: ScannedDates = { dates: [], loose: [], rejected: 0, items: count };
  for (const { ref } of items) {
    if (ref.month === null) {
      out.loose.push({ day: ref.day, weekday: ref.weekday });
      continue;
    }
    const local = resolveDate(ref, now, warn);
    if (local) out.dates.push(local);
    else out.rejected += 1;
  }
  return out;
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

// ── Horas ──────────────────────────────────────────────────────────────────

/** "de 11 a 20 horas" / "14 a 21 horas": horario de apertura, no funciones. */
const HOURS_RANGE_RE =
  /\b(?:de\s+)?(\d{1,2})(?:[.:]\d{2})?\s+a\s+(\d{1,2})(?:[.:]\d{2})?\s*(?:horas?|hs\.?|h)\b/;
const TIME_SRC = '\\d{1,2}(?:[.:]\\d{2})?';
const TIME_UNIT = '(?:horas?|hs\\.?|h)\\b';
/**
 * "20 horas" · "16.30 y 20.30 horas" · "a las 15 horas" · "a las 20" · "20 hs". Las horas
 * de una lista solo se unen con " y ": en "Jueves 15, 17.30 horas" el 15 es el día.
 */
const TIME_LIST_RE = new RegExp(
  `\\ba las\\s+(${TIME_SRC}(?:\\s+y\\s+(?:las\\s+)?${TIME_SRC})*)(?:\\s*${TIME_UNIT})?|\\b(${TIME_SRC}(?:\\s+y\\s+${TIME_SRC})*)\\s*${TIME_UNIT}`,
  'g',
);

interface TimeList {
  index: number;
  end: number;
  times: LocalTimeParts[];
}

function findTimeLists(cleaned: string, warn: Warn): TimeList[] {
  const lists: TimeList[] = [];
  for (const m of cleaned.matchAll(TIME_LIST_RE)) {
    // "24/10 horas": el número es un mes, no una hora.
    if (m[2] !== undefined && cleaned.slice(0, m.index).endsWith('/')) {
      warn(`"${m[0]}" no se puede leer como hora, se ignora`);
      continue;
    }
    const times: LocalTimeParts[] = [];
    for (const t of (m[1] ?? m[2] ?? '').matchAll(/(\d{1,2})(?:[.:](\d{2}))?/g)) {
      times.push({ hour: Number(t[1]), minute: t[2] !== undefined ? Number(t[2]) : 0 });
    }
    if (times.some((t) => t.hour > 23 || t.minute > 59)) {
      warn(`hora inválida "${m[0]}", se ignora`);
      continue;
    }
    lists.push({ index: m.index, end: m.index + m[0].length, times });
  }
  return lists;
}

function stripTimes(cleaned: string): string {
  let out = cleaned;
  for (const list of findTimeLists(cleaned, () => {}).reverse()) {
    out = `${out.slice(0, list.index)} ${out.slice(list.end)}`;
  }
  return out;
}

// ── Segmentos y cláusulas ──────────────────────────────────────────────────

/** Una lista de horas y lo que la precede en el segmento: "sábado 17 de octubre, " + 18 h. */
interface Clause {
  times: LocalTimeParts[];
  dates: string[];
  loose: LooseDay[];
  rejected: number;
  weekdays: number[];
  ranges: Bounds[];
  start: string | null;
  end: string | null;
}

interface Segment {
  text: string;
  openingHours: boolean;
  status: ParsedOccurrenceStatus | null;
  clauses: Clause[];
}

function analyzeClause(text: string, times: LocalTimeParts[], now: DateTime, warn: Warn): Clause {
  let rest = text;
  const take = <T>(found: Found<T> | null): Found<T> | null => {
    if (found) rest = rest.replace(found.match, ' ');
    return found;
  };
  const ranges: Array<Found<Bounds>> = [];
  for (let r = take(detectRange(rest, now, warn)); r; r = take(detectRange(rest, now, warn))) {
    ranges.push(r);
  }
  const start = take(detectStartOnly(rest, now, warn));
  const end = take(detectEndOnly(rest, now, warn));
  const scanned = scanDates(rest, now, warn);
  const unreadable = [...ranges, start, end].filter((f) => f !== null && f.value === null).length;
  return {
    times,
    dates: scanned.dates,
    loose: scanned.loose,
    rejected: scanned.rejected + unreadable,
    // Un segmento con números de día nunca se trata como patrón semanal (aunque se descarten).
    weekdays: scanned.items === 0 ? scanWeekdays(rest) : [],
    ranges: ranges.flatMap((r) => (r.value ? [r.value] : [])),
    start: start?.value ?? null,
    end: end?.value ?? null,
  };
}

function analyzeSegment(text: string, now: DateTime, warnings: string[]): Segment {
  const warn: Warn = (m) => warnings.push(`"${text}": ${m}`);
  let cleaned = cleanText(text);
  const hours = HOURS_RANGE_RE.exec(cleaned);
  if (hours) {
    cleaned = `${cleaned.slice(0, hours.index)} ${cleaned.slice(hours.index + hours[0].length)}`;
  }
  const clauses: Clause[] = [];
  let from = 0;
  for (const list of findTimeLists(cleaned, warn)) {
    clauses.push(analyzeClause(cleaned.slice(from, list.index), list.times, now, warn));
    from = list.end;
  }
  clauses.push(analyzeClause(cleaned.slice(from), [], now, warn));
  return { text, openingHours: hours !== null, status: parsedStatus(cleaned), clauses };
}

function parsedStatus(text: string): ParsedOccurrenceStatus | null {
  const s = detectStatusEs(text);
  return s === 'cancelled' || s === 'postponed' || s === 'sold_out' ? s : null;
}

/**
 * Estado escrito dentro de un segmento ("Domingos, 19.30 horas (agotado)"): vale para las
 * funciones de ese segmento solo si no menciona otra fecha que no se pudo leer
 * ("(función del domingo 18 suspendida)"). Si no se puede atribuir: una suspensión anula el
 * segmento; un "agotado" se ignora.
 */
function segmentStatus(
  seg: Segment,
  warnings: string[],
): { status: ParsedOccurrenceStatus | null; drop: boolean } {
  if (!seg.status) return { status: null, drop: false };
  const described = seg.clauses.filter((c) => c.dates.length > 0 || c.weekdays.length > 0);
  const unclear = described.length > 1 || seg.clauses.some((c) => c.loose.length || c.rejected);
  if (!unclear) return { status: seg.status, drop: false };
  if (seg.status === 'sold_out') {
    warnings.push(
      `estado "agotado" que no se puede atribuir a una función: "${seg.text}" (se ignora)`,
    );
    return { status: null, drop: false };
  }
  warnings.push(
    `estado que no se puede atribuir a una función: "${seg.text}" (no se emite ese segmento)`,
  );
  return { status: null, drop: true };
}

// ── Avisos en rojo ─────────────────────────────────────────────────────────

const NO_FUNCTION_RE =
  /no habra funcion|no hay funcion|sin funcion|no se realizara|no habra actividad|\bse suspenden?\b/;
/** Avisos de temporada: "Desde el 24 de octubre", "Hasta el 1 de noviembre". */
const BOUND_NOTE_RE = /^(?:ultimas? funciones?:?\s*)?(?:desde|del|a partir|hasta)\b/;

/** Suspensión o reprogramación: esas fechas no se publican. */
function isCancellation(cleaned: string): boolean {
  return NO_FUNCTION_RE.test(cleaned) || detectStatusEs(cleaned) === 'rescheduled';
}

interface NoteRefs {
  /** Fechas candidatas que el aviso nombra. */
  dates: Set<string>;
  /** Fechas candidatas nombradas por un "sábado 17" que coincide con más de una. */
  ambiguous: Set<string>;
  mentions: boolean;
  /** Menciona fechas que no se pueden afirmar (número suelto, día de semana incoherente…). */
  unclear: boolean;
}

/** Fechas que menciona un aviso, resueltas contra las funciones candidatas (YYYY-MM-DD). */
function noteRefs(cleaned: string, candidates: string[], now: DateTime, warn: Warn): NoteRefs {
  const refs: NoteRefs = {
    dates: new Set(),
    ambiguous: new Set(),
    mentions: false,
    unclear: false,
  };
  let rest = stripTimes(cleaned);
  const range = detectRange(rest, now, warn);
  if (range) {
    refs.mentions = true;
    rest = rest.replace(range.match, ' ');
    const r = range.value;
    if (r) for (const c of candidates) if (c >= r.start && c <= r.end) refs.dates.add(c);
    if (!r) refs.unclear = true;
  }
  const scanned = scanDates(rest, now, warn);
  if (scanned.items > 0) refs.mentions = true;
  if (scanned.rejected > 0) refs.unclear = true;
  for (const d of scanned.dates) refs.dates.add(d);
  for (const loose of scanned.loose) {
    if (loose.weekday === null) {
      refs.unclear = true;
      continue;
    }
    const matches = candidates.filter(
      (c) => Number(c.slice(8, 10)) === loose.day && weekdayOf(c) === loose.weekday,
    );
    for (const m of matches) (matches.length > 1 ? refs.ambiguous : refs.dates).add(m);
  }
  return refs;
}

function applyNotes(
  specs: TimedSpec[],
  notes: string[],
  now: DateTime,
  warnings: string[],
): TimedSpec[] {
  let out = specs;
  for (const note of notes) {
    const cleaned = cleanText(note).replace(/\s+/g, ' ');
    const reason = condense(note);
    const cancellation = isCancellation(cleaned);
    const status = cancellation ? null : parsedStatus(cleaned);
    if (!cancellation && !status) continue;
    if (cleaned.includes('reprogramad')) {
      warnings.push(`aviso de reprogramación: "${reason}" (no se publican las fechas que nombra)`);
    }
    const warn: Warn = (m) => warnings.push(`aviso "${reason}": ${m}`);
    const refs = noteRefs(cleaned, [...new Set(out.map((s) => s.date))], now, warn);

    if (cancellation || ((status === 'cancelled' || status === 'postponed') && refs.unclear)) {
      if (!refs.mentions || refs.unclear) {
        if (out.length) warn('no se puede saber qué funciones afecta: no se publica ninguna');
        out = [];
        continue;
      }
      out = out.filter((s) => {
        if (!refs.dates.has(s.date) && !refs.ambiguous.has(s.date)) return true;
        warnings.push(`función ${s.date} ${timeKey(s.time)} excluida por aviso del sitio`);
        return false;
      });
      continue;
    }
    if (!status) continue;
    if (refs.mentions && refs.unclear) {
      warn('estado que no se puede atribuir a una función, se ignora');
      continue;
    }
    if (refs.ambiguous.size > 0) {
      if (status === 'sold_out') warn('"agotado" ambiguo entre varias funciones, se ignora');
      else {
        warn('estado ambiguo entre varias funciones: no se publican');
        out = out.filter((s) => !refs.ambiguous.has(s.date));
      }
    }
    for (const spec of out) {
      if (!refs.mentions || refs.dates.has(spec.date)) {
        spec.status = status;
        spec.statusReason = reason;
      }
    }
  }
  return out;
}

// ── Grilla de ciclos de cine ───────────────────────────────────────────────

const GRID_DAY_RE = new RegExp(
  `^${WEEKDAY_SRC}\\s+(\\d{1,2})(?:\\s*(?:de\\s+)?(${MONTH_SRC})(?:\\s+de\\s+(\\d{4}))?)?\\s*\\.?$`,
);
const GRID_DATES_RE = new RegExp(`^${WEEKDAY_SRC}\\s+\\d`);
const TIME_LIKE_RE = /\b\d{1,2}(?:[.:]\d{2})?\s*(?:horas?|hs)\b|\ba las \d/;

interface GridContext {
  /** Fechas publicadas en "Funciones:" sin hora: la grilla debe caer en ellas. */
  dates: string[];
  start: string | null;
  end: string | null;
}

/**
 * Grilla de un ciclo de cine (líneas de .details en orden): "Miércoles 28" + "A las 18 horas",
 * "Jueves 8, viernes 9 y domingo 11, 21 horas", "Sábado 31 de octubre, 21 horas". Un día sin
 * mes se ubica en el mes de la línea anterior (o del inicio publicado en "Funciones:") o en
 * el siguiente, siempre verificando el día de semana y que caiga dentro de lo publicado.
 * Una línea con hora que no se entiende, o un aviso de estado, anula toda la grilla.
 */
function parseGrid(
  lines: string[],
  ctx: GridContext,
  now: DateTime,
  warn: Warn,
): TimedSpec[] | null {
  const sorted = [...ctx.dates].sort();
  const lower = sorted[0] ?? ctx.start;
  const upper = sorted.at(-1) ?? ctx.end;
  const within = (d: string) =>
    sorted.length > 0 ? sorted.includes(d) : (!lower || d >= lower) && (!upper || d <= upper);
  let cursor = lower;
  let current: { date: string; line: string } | null = null;
  const out: TimedSpec[] = [];

  const locate = (weekday: number, day: number, month: number | null, year: number | null) => {
    if (month !== null) return resolveDate({ day, month, year, weekday }, now, () => {});
    if (!cursor) return null;
    const base = DateTime.fromISO(cursor, { zone: BA_TZ }).startOf('month');
    const found = [base, base.plus({ months: 1 })]
      .map((m) => toLocal({ year: m.year, month: m.month, day }))
      .filter((d): d is string => d !== null && weekdayOf(d) === weekday && within(d));
    return found.length === 1 ? (found[0] ?? null) : null;
  };
  const reject = (line: string, why: string) => {
    warn(`grilla del ciclo: ${why} ("${line.trim()}"); se ignora la grilla`);
    return null;
  };

  for (const line of lines) {
    const c = cleanText(line).replace(/\s+/g, ' ');
    if (!c) continue;
    const status = detectStatusEs(c) !== null || NO_FUNCTION_RE.test(c);
    if (status && (c.length <= 120 || TIME_LIKE_RE.test(c) || GRID_DATES_RE.test(c))) {
      return reject(line, 'aviso de estado');
    }
    const header = GRID_DAY_RE.exec(c);
    if (header) {
      const date = locate(
        WEEKDAYS[header[1] ?? ''] ?? 0,
        Number(header[2]),
        header[3] !== undefined ? (MONTHS[header[3]] ?? null) : null,
        yearToken(header[4]),
      );
      if (!date || !within(date)) return reject(line, 'día que no se puede ubicar');
      current = { date, line: line.trim() };
      cursor = date;
      continue;
    }
    const timeOnly = c.startsWith('a las ');
    if (timeOnly || GRID_DATES_RE.test(c)) {
      const lists = findTimeLists(c, () => {});
      const list = lists[0];
      if (lists.length !== 1 || !list) return reject(line, 'línea sin una hora clara');
      const entries: Array<{ date: string; source: string }> = [];
      if (timeOnly) {
        if (list.index !== 0 || !current) return reject(line, 'hora sin día');
        entries.push({ date: current.date, source: `${current.line} · ${line.trim()}` });
      } else {
        for (const m of c.slice(0, list.index).matchAll(DATE_ITEM_RE)) {
          const weekday = weekdayNumber(m[1]);
          const month = m[5] !== undefined ? (MONTHS[m[5]] ?? null) : m[3] ? Number(m[3]) : null;
          const date =
            weekday === null ? null : locate(weekday, Number(m[2]), month, yearToken(m[6] ?? m[4]));
          if (!date || !within(date)) return reject(line, 'fecha que no se puede ubicar');
          entries.push({ date, source: line.trim() });
          cursor = date;
        }
        const last = entries.at(-1);
        if (!last) return reject(line, 'línea sin fecha');
        current = { date: last.date, line: line.trim() };
      }
      for (const e of entries) {
        for (const time of list.times) {
          out.push({
            kind: 'timed',
            date: e.date,
            time,
            sourceText: e.source,
            status: 'scheduled',
          });
        }
      }
      continue;
    }
    if (TIME_LIKE_RE.test(c)) return reject(line, 'hora fuera del formato de la grilla');
  }
  return out.length > 0 ? out : null;
}

// ── Orquestación ───────────────────────────────────────────────────────────

function timeKey(t: LocalTimeParts): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

export function formatTime(t: LocalTimeParts): string {
  return timeKey(t);
}

/** Inicio y fin de temporada publicados (texto + avisos); si hay varios, la intersección. */
function seasonBounds(clauses: Clause[], notes: string[], now: DateTime, warnings: string[]) {
  const starts: string[] = [];
  const ends: string[] = [];
  const collect = (c: Clause) => {
    for (const r of c.ranges) {
      starts.push(r.start);
      ends.push(r.end);
    }
    if (c.start) starts.push(c.start);
    if (c.end) ends.push(c.end);
  };
  clauses.forEach(collect);
  for (const note of notes) {
    const cleaned = cleanText(note).replace(/\s+/g, ' ');
    if (!BOUND_NOTE_RE.test(cleaned) || isCancellation(cleaned) || parsedStatus(cleaned)) continue;
    collect(
      analyzeClause(cleaned, [], now, (m) => warnings.push(`aviso "${condense(note)}": ${m}`)),
    );
  }
  return { start: starts.sort().at(-1) ?? null, end: ends.sort()[0] ?? null };
}

/** Parse puro: texto de funciones (+ avisos, + días de la agenda) → especificaciones de ocurrencias. */
export function parseSchedule(input: ScheduleInput): ScheduleResult {
  const warnings: string[] = [];
  const now = input.now.setZone(BA_TZ);
  const text = input.functionsText.trim();
  const notes = [...(input.notes ?? [])];

  // Un segmento de "Funciones:" que suspende o solo da un estado se trata como aviso.
  const segments: Segment[] = [];
  for (const s of splitSegments(text)) {
    if (isCancellation(cleanText(s))) {
      notes.push(s);
      continue;
    }
    const seg = analyzeSegment(s, now, warnings);
    const describes = seg.clauses.some(
      (c) =>
        c.dates.length || c.weekdays.length || c.ranges.length || c.start || c.end || c.rejected,
    );
    if (seg.status && !describes) notes.push(s);
    else segments.push(seg);
  }
  const clauses = segments.flatMap((s) => s.clauses);

  const timed = new Map<string, TimedSpec>();
  const addTimed = (
    date: string,
    time: LocalTimeParts,
    sourceText: string,
    status: ParsedOccurrenceStatus | null,
  ) => {
    const key = `${date}|${timeKey(time)}`;
    if (!timed.has(key)) {
      timed.set(key, { kind: 'timed', date, time, sourceText, status: status ?? 'scheduled' });
    }
  };

  // 1) Fechas enumeradas (cada una con la lista de horas que la sigue) y patrón semanal.
  let form: ScheduleForm = 'none';
  const weekly = new Map<
    number,
    Array<{ time: LocalTimeParts; status: ParsedOccurrenceStatus | null }>
  >();
  let weeklySeen = false;
  for (const seg of segments) {
    const { status, drop } = segmentStatus(seg, warnings);
    for (const c of seg.clauses) {
      for (const l of c.loose) {
        warnings.push(`"${seg.text}": número de día sin mes ("${l.day}"), se ignora`);
      }
      if (c.dates.length > 0) {
        if (c.times.length === 0) {
          warnings.push(`fecha sin hora publicada: "${seg.text}" (no se emite función)`);
          continue;
        }
        if (drop) continue;
        form = 'enumerated';
        for (const d of c.dates) for (const t of c.times) addTimed(d, t, seg.text, status);
      } else if (c.weekdays.length > 0 && !seg.openingHours) {
        if (c.times.length === 0) {
          warnings.push(`días de semana sin hora: "${seg.text}"`);
          continue;
        }
        weeklySeen = true;
        if (drop) continue;
        for (const wd of c.weekdays) {
          weekly.set(wd, [...(weekly.get(wd) ?? []), ...c.times.map((time) => ({ time, status }))]);
        }
      }
    }
  }

  // 2) Patrón semanal → días de la agenda dentro de la temporada publicada (inicio y fin).
  const bounds = seasonBounds(clauses, notes, now, warnings);
  if (weeklySeen) {
    if (form === 'none') form = 'weekly';
    const { start, end } = bounds;
    if (!start || !end) {
      warnings.push(
        `patrón semanal sin temporada publicada (inicio ${start ?? '…'}, fin ${end ?? '…'}): no se emiten funciones; la agenda del sitio sola no alcanza`,
      );
    } else if (start > end) {
      warnings.push(`temporada publicada incoherente (${start} – ${end}): no se emiten funciones`);
    } else if (weekly.size > 0) {
      const days = [...new Set(input.agendaDays ?? [])].sort();
      if (days.length === 0) {
        warnings.push(
          'patrón semanal sin días confirmados por la agenda del sitio: no se emiten funciones',
        );
      }
      const outOfRange: string[] = [];
      for (const day of days) {
        if (day < start || day > end) {
          outOfRange.push(day);
          continue;
        }
        const entries = weekly.get(weekdayOf(day));
        if (!entries) {
          warnings.push(
            `la agenda lista el ${day} pero el patrón no publica hora para ese día de semana`,
          );
          continue;
        }
        for (const e of entries) addTimed(day, e.time, condense(text), e.status);
      }
      if (outOfRange.length) {
        warnings.push(
          `la agenda lista ${outOfRange.length} día(s) fuera del rango publicado (${start} – ${end}): ${outOfRange.join(', ')}`,
        );
      }
    }
  }

  // 3) Grilla del ciclo de cine cuando "Funciones:" no dio horas (reemplaza a un rango).
  if (timed.size === 0 && !weeklySeen && input.gridLines && input.gridLines.length > 0) {
    const grid = parseGrid(
      input.gridLines,
      { dates: clauses.flatMap((c) => c.dates), start: bounds.start, end: bounds.end },
      now,
      (m) => warnings.push(m),
    );
    if (grid) {
      form = 'grid';
      for (const s of grid) addTimed(s.date, s.time, s.sourceText, null);
      warnings.push(`funciones tomadas de la grilla del ciclo (${grid.length})`);
    }
  }

  // 4) Rango puro (muestras, ciclos) cuando no hay funciones concretas.
  let rangeSpec: RangeSpec | null = null;
  if (timed.size === 0 && !weeklySeen) {
    const ranges = clauses.flatMap((c) => c.ranges);
    const first = ranges[0];
    if (first) {
      form = 'range';
      rangeSpec = {
        kind: 'range',
        start: first.start,
        end: first.end,
        scheduleText: condense(text),
        sourceText: condense(text),
      };
      if (ranges.length > 1) {
        warnings.push(`varios rangos en "${condense(text)}": se publica solo el primero`);
      }
    } else if (clauses.some((c) => c.start)) {
      warnings.push(`rango sin fin publicado: "${condense(text)}" (no se emite ocurrencia)`);
    } else if (clauses.some((c) => c.end)) {
      warnings.push(`rango sin inicio publicado: "${condense(text)}" (no se emite ocurrencia)`);
    } else if (text.length === 0) {
      warnings.push('sin texto de funciones');
    } else if (
      !clauses.some((c) => c.dates.length || c.weekdays.length || c.loose.length || c.rejected)
    ) {
      warnings.push(`texto de funciones no reconocido: "${condense(text)}"`);
    }
  }

  // 5) Avisos: exclusiones y estados sobre las funciones concretas.
  const sorted = [...timed.values()].sort((a, b) =>
    `${a.date}T${timeKey(a.time)}`.localeCompare(`${b.date}T${timeKey(b.time)}`),
  );
  const specs: OccurrenceSpec[] = applyNotes(sorted, notes, now, warnings);
  if (rangeSpec) {
    specs.push(rangeSpec);
    if (notes.some((n) => isCancellation(cleanText(n)))) {
      warnings.push('aviso de suspensión sobre un rango: no se puede representar en la ocurrencia');
    }
  }
  return { specs, form, warnings };
}
