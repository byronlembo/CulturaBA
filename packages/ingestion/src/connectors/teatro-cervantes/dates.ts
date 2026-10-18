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
 * Parser PURO de las funciones del Teatro Nacional Cervantes (docs/research/teatro-cervantes.md §5).
 *
 * El sitio publica las funciones de tres maneras:
 *
 *  1. Calendario mensual (`/calendario/?mes=MM&a=AAAA`): una fila por función con día y hora
 *     ("18:00hs."). Es la forma más explícita y la que manda: si el calendario lista la obra,
 *     las funciones salen SOLO de ahí (respeta feriados: la visita guiada del lunes 12/10 no
 *     está). Fuera del rango publicado (estreno … última función) no se emite nada.
 *  2. Texto del bloque lateral del detalle (`.sidebar-block > b`), cuando el calendario no lista
 *     la obra (p. ej. una obra que estrena y todavía no se cargó):
 *       · Fechas enumeradas con hora: "Miércoles 17 y 24 de junio a las 20 h",
 *         "Sábado 25 y domingo 26 de abril y sábado 2 y domingo 3 de mayo a las 15 h"
 *         → una función por fecha con la hora que la sigue.
 *       · Patrón semanal: "De jueves a domingo a las 21 h", "Viernes 20:30 h y sábados 20 h"
 *         → SOLO dentro de una temporada publicada (fecha de estreno Y última función del sitio,
 *         o un "del 16 de julio al 2 de agosto" del propio texto) y solo los días y horas que el
 *         texto afirma. Sin temporada o sin hora para ese día ⇒ no se emite la función.
 *       · Cualquier frase con datos de funciones que no se puede leer con certeza ("Excepto…",
 *         "luego de…", "de 10 a 22 h", un día sin mes) anula TODO el texto: no se publica
 *         ninguna función derivada de él (nunca una a medias).
 *  3. Solo temporada (estreno … última función) sin texto utilizable → una ocurrencia `range`
 *     con `scheduleText` literal: honesta, sin horarios inventados.
 *
 * Estados ("suspendida", "cancelada", "agotado", "reprogramada") solo por texto explícito del
 * bloque lateral: con fechas se aplican a esas funciones (una reprogramada se retira); sin fecha
 * atribuible, una suspensión/reprogramación retira todas las funciones y un "agotado" se ignora.
 * Las frases de boletería/entradas/reservas no son funciones ("a partir de las 10 h").
 */

export interface Season {
  /** Fecha de estreno publicada (YYYY-MM-DD). */
  start: string | null;
  /** Última función publicada (YYYY-MM-DD). */
  end: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface CalendarFunction {
  /** YYYY-MM-DD */
  date: string;
  time: LocalTimeParts;
  /** Texto literal de la fila ("2026-10-18 · 18:00hs."). */
  sourceText: string;
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

/** Minúsculas sin acentos, ordinales (1°, 1º) → 1, guiones tipográficos → '-', espacios simples. */
export function cleanText(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[‒–—―]/g, '-')
    .replace(/(\d{1,2})\s*[°º]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function condense(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join(' · ');
}

export function formatTime(t: LocalTimeParts): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

// ── Fechas ─────────────────────────────────────────────────────────────────

function toLocal(year: number, month: number, day: number): string | null {
  try {
    return partsToLocalDate({ year, month, day });
  } catch {
    return null;
  }
}

/** "29/10/2026" (campos `fecha_estreno` / `ultima_funcion` del REST y del detalle) → YYYY-MM-DD. */
export function parseDmy(text: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text ?? '');
  if (!m) return null;
  return toLocal(Number(m[3]), Number(m[2]), Number(m[1]));
}

function weekdayOf(local: string): number {
  return DateTime.fromISO(local, { zone: BA_TZ }).weekday;
}

function addDays(local: string, days: number): string {
  return DateTime.fromISO(local, { zone: BA_TZ }).plus({ days }).toISODate() ?? local;
}

function maxDate(...dates: Array<string | null | undefined>): string | null {
  const ds = dates.filter((d): d is string => Boolean(d)).sort();
  return ds.at(-1) ?? null;
}

function minDate(...dates: Array<string | null | undefined>): string | null {
  const ds = dates.filter((d): d is string => Boolean(d)).sort();
  return ds[0] ?? null;
}

interface DateRef {
  day: number;
  month: number;
  year: number | null;
  weekday: number | null;
}

/**
 * Fecha sin año: el texto del sitio casi nunca lo trae. Se resuelve contra la temporada publicada
 * (el año en que la fecha cae entre estreno y última función); sin temporada, con la inferencia
 * estándar de @culturaba/shared (hasta 60 días atrás, 12 meses adelante). El día de semana
 * publicado tiene que coincidir.
 */
export function resolveDate(
  ref: DateRef,
  ctx: { season: Season; now: DateTime },
  warn: Warn = () => {},
): string | null {
  const label = `${ref.day}/${ref.month}`;
  let local: string | null = null;
  if (ref.year !== null) {
    local = toLocal(ref.year, ref.month, ref.day);
  } else if (ctx.season.start || ctx.season.end) {
    const years = [
      ...new Set(
        [ctx.season.start, ctx.season.end]
          .filter((d): d is string => Boolean(d))
          .map((d) => Number(d.slice(0, 4))),
      ),
    ];
    const inSeason = years
      .map((y) => toLocal(y, ref.month, ref.day))
      .filter(
        (d): d is string =>
          d !== null &&
          (!ctx.season.start || d >= ctx.season.start) &&
          (!ctx.season.end || d <= ctx.season.end),
      );
    if (inSeason.length !== 1) {
      warn(`fecha ${label} fuera de la temporada publicada (o ambigua), se ignora`);
      return null;
    }
    local = inSeason[0] ?? null;
  } else {
    const year = inferYear(ref.month, ref.day, { now: ctx.now.setZone(BA_TZ) });
    local = year === null ? null : toLocal(year, ref.month, ref.day);
  }
  if (!local) {
    warn(`fecha inexistente o sin año deducible ${label}, se ignora`);
    return null;
  }
  if (ref.weekday !== null && weekdayOf(local) !== ref.weekday) {
    warn(`el día de semana publicado no coincide con ${local}, se ignora`);
    return null;
  }
  return local;
}

function yearToken(token: string | undefined): number | null {
  if (token === undefined) return null;
  const year = Number(token);
  return year < 100 ? 2000 + year : year;
}

function weekdayNumber(token: string | undefined): number | null {
  return token !== undefined ? (WEEKDAYS[token] ?? null) : null;
}

/** [wd, día, mes numérico, año numérico, mes, año]. */
const DATE_ITEM_RE = new RegExp(
  `(?:\\b${WEEKDAY_SRC}\\s+)?\\b(\\d{1,2})(?:\\/(\\d{1,2})(?:\\/(\\d{2,4}))?)?\\b(?:\\s*(?:de\\s+)?\\b(${MONTH_SRC})\\b(?:\\s+(?:de\\s+|del\\s+)?(20\\d{2})\\b)?)?`,
  'g',
);
const CONNECTOR_RE = /^\s*(?:,\s*y|,|y)?\s*$/;

interface ScannedDates {
  dates: string[];
  /** Números de día sin mes, o fechas que no se pudieron afirmar. */
  unresolved: number;
  /** Números de día encontrados (con o sin mes). */
  items: number;
}

/**
 * "sabado 25 y domingo 26 de abril y sabado 2 y domingo 3 de mayo" → 25/4, 26/4, 2/5, 3/5.
 * Un número sin mes solo toma el mes de un número posterior encadenado por ", " / " y ".
 */
export function scanDates(
  cleaned: string,
  ctx: { season: Season; now: DateTime },
  warn: Warn = () => {},
): ScannedDates {
  const items: Array<{
    day: number;
    month: number | null;
    year: number | null;
    weekday: number | null;
    start: number;
    end: number;
  }> = [];
  for (const m of cleaned.matchAll(DATE_ITEM_RE)) {
    const day = Number(m[2]);
    const month =
      m[5] !== undefined ? (MONTHS[m[5]] ?? null) : m[3] !== undefined ? Number(m[3]) : null;
    items.push({
      day,
      month,
      year: yearToken(m[6] ?? m[4]),
      weekday: weekdayNumber(m[1]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  for (let i = items.length - 2; i >= 0; i -= 1) {
    const current = items[i];
    const next = items[i + 1];
    if (!current || !next || current.month !== null || next.month === null) continue;
    if (CONNECTOR_RE.test(cleaned.slice(current.end, next.start))) {
      current.month = next.month;
      current.year = current.year ?? next.year;
    }
  }
  const out: ScannedDates = { dates: [], unresolved: 0, items: items.length };
  for (const it of items) {
    if (it.month === null || it.day < 1 || it.day > 31) {
      warn(`número de día sin mes ("${it.day}"), se ignora`);
      out.unresolved += 1;
      continue;
    }
    const local = resolveDate(
      { day: it.day, month: it.month, year: it.year, weekday: it.weekday },
      ctx,
      warn,
    );
    if (local) out.dates.push(local);
    else out.unresolved += 1;
  }
  return out;
}

const TEXT_DATE = `(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_SRC})(?:\\s+(?:de\\s+|del\\s+)?(20\\d{2})\\b)?`;
const NUMERIC_DATE = `(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?`;
const WD = `(?:${WEEKDAY_SRC}\\s+)?`;
const RANGE_FROM = '(?:del|desde el|desde)\\s+';
const RANGE_TO = '\\s+(?:al|hasta el|hasta)\\s+';
/** "del jueves 16 de julio al 2 de agosto" → [wd, d, mes, a, wd, d, mes, a]. */
const TEXT_RANGE_RE = new RegExp(`\\b${RANGE_FROM}${WD}${TEXT_DATE}${RANGE_TO}${WD}${TEXT_DATE}`);
/** "del 16/7 al 2/8" → [wd, d, m, a, wd, d, m, a]. */
const NUMERIC_RANGE_RE = new RegExp(
  `\\b${RANGE_FROM}${WD}${NUMERIC_DATE}${RANGE_TO}${WD}${NUMERIC_DATE}`,
);
/** "del 1 al 15 de noviembre" → [wd, d, wd, d, mes, a]. */
const SAME_MONTH_RANGE_RE = new RegExp(
  `\\b${RANGE_FROM}${WD}(\\d{1,2})${RANGE_TO}${WD}${TEXT_DATE}`,
);

/** Subrango explícito dentro de una frase; `value` null si tiene la forma pero no se puede afirmar. */
export function detectRange(
  cleaned: string,
  ctx: { season: Season; now: DateTime },
  warn: Warn = () => {},
): { value: DateRange | null; match: string } | null {
  const build = (match: string, from: DateRef | null, to: DateRef | null) => {
    if (!from || !to) return { value: null, match };
    // El año del fin se resuelve como cualquier fecha; el inicio, en ese año o el anterior.
    const end = resolveDate(to, ctx, warn);
    let start = resolveDate(from, ctx, warn);
    if (start && end && start > end) start = null;
    if (!start || !end) return { value: null, match };
    return { value: { start, end }, match };
  };
  const t = TEXT_RANGE_RE.exec(cleaned);
  if (t) {
    return build(
      t[0],
      ref(t[1], t[2], MONTHS[t[3] ?? ''], t[4]),
      ref(t[5], t[6], MONTHS[t[7] ?? ''], t[8]),
    );
  }
  const n = NUMERIC_RANGE_RE.exec(cleaned);
  if (n)
    return build(n[0], ref(n[1], n[2], Number(n[3]), n[4]), ref(n[5], n[6], Number(n[7]), n[8]));
  const s = SAME_MONTH_RANGE_RE.exec(cleaned);
  if (s) {
    const month = MONTHS[s[5] ?? ''];
    return build(s[0], ref(s[1], s[2], month, s[6]), ref(s[3], s[4], month, s[6]));
  }
  return null;
}

function ref(
  weekday: string | undefined,
  day: string | undefined,
  month: number | undefined,
  year: string | undefined,
): DateRef | null {
  if (day === undefined || month === undefined || Number.isNaN(month)) return null;
  return { day: Number(day), month, year: yearToken(year), weekday: weekdayNumber(weekday) };
}

// ── Días de semana ─────────────────────────────────────────────────────────

const WEEKDAY_TOKEN_RE = new RegExp(`\\b${WEEKDAY_SRC}\\b`, 'g');

/** "de jueves a domingo" → [4,5,6,7]; "viernes y sabados" → [5,6]; "lunes" → [1]. */
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
    if (next && next.weekday !== 0 && /^\s+a\s+$/.test(cleaned.slice(t.end, next.start))) {
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

const TIME_SRC = '\\d{1,2}(?:[.:]\\d{2})?';
const TIME_UNIT = '(?:horas?|hs\\.?|h)\\b';
/**
 * "a las 21 h" · "20:30 h" · "a las 20" · "21hs" · "16.30 y 20.30 h". Un número suelto sin
 * "a las" ni unidad no es una hora ("a partir de los 16 años", "Sala Piso 11").
 */
const TIME_LIST_RE = new RegExp(
  `\\ba las\\s+(${TIME_SRC}(?:\\s+y\\s+(?:las\\s+)?${TIME_SRC})*)(?:\\s*${TIME_UNIT})?|\\b(${TIME_SRC}(?:\\s+y\\s+${TIME_SRC})*)\\s*${TIME_UNIT}`,
  'g',
);
/** "de 10 a 22 h", "11 h a 20 h": horario de apertura (boletería, muestras), no funciones. */
const OPENING_HOURS_RE = new RegExp(
  `\\bde\\s+${TIME_SRC}\\s*(?:${TIME_UNIT})?\\s+a\\s+${TIME_SRC}\\s*${TIME_UNIT}|\\b${TIME_SRC}\\s*${TIME_UNIT}\\s+a\\s+${TIME_SRC}\\s*${TIME_UNIT}`,
);

interface TimeList {
  index: number;
  end: number;
  times: LocalTimeParts[];
}

function findTimeLists(cleaned: string): TimeList[] | null {
  const lists: TimeList[] = [];
  for (const m of cleaned.matchAll(TIME_LIST_RE)) {
    // "25/10 h": el número es un mes.
    if (m[2] !== undefined && cleaned.slice(0, m.index).endsWith('/')) return null;
    const times: LocalTimeParts[] = [];
    for (const t of (m[1] ?? m[2] ?? '').matchAll(/(\d{1,2})(?:[.:](\d{2}))?/g)) {
      times.push({ hour: Number(t[1]), minute: t[2] !== undefined ? Number(t[2]) : 0 });
    }
    if (times.some((t) => t.hour > 23 || t.minute > 59)) return null;
    lists.push({ index: m.index, end: m.index + m[0].length, times });
  }
  return lists;
}

// ── Texto del bloque lateral ───────────────────────────────────────────────

export interface WeeklyRule {
  weekdays: number[];
  times: LocalTimeParts[];
  /** Subrango publicado en la misma frase ("del 16 de julio al 2 de agosto"). */
  range: DateRange | null;
  /** Meses de un encabezado "Funciones en octubre" (vacío = sin restricción). */
  months: number[];
  sourceText: string;
}

export interface DatedFunction {
  date: string;
  time: LocalTimeParts;
  sourceText: string;
}

export interface StatusNote {
  status: 'cancelled' | 'postponed' | 'sold_out' | 'rescheduled';
  /** Fechas que nombra la frase (vacío = no atribuible a una función). */
  dates: string[];
  text: string;
}

export interface TextSchedule {
  enumerated: DatedFunction[];
  weekly: WeeklyRule[];
  statusNotes: StatusNote[];
  /** Frases con datos de funciones que no se pueden leer con certeza. */
  unsupported: string[];
  /** Fechas publicadas sin hora (no se emiten). */
  untimedDates: string[];
  warnings: string[];
}

/** Información de entradas/boletería: sus horas no son funciones ("a partir de las 10 h"). */
const TICKETS_RE =
  /\b(entradas?|boleteria|reserv\w*|localidades|venta|capacidad|precio|retir\w*|descuentos?|alternativa)\b|\$/;
/** Funciones para grupos con inscripción: no son funciones al público general. */
const GROUPS_RE = /\b(grupos|instituciones educativas|escuelas|inscripcion previa)\b/;
/** Palabras que cambian el alcance de un horario de formas que este parser no modela. */
const UNSUPPORTED_RE =
  /\b(excepto|salvo|menos|luego|despues|a partir|hasta|desde|no habra|sin funcion|cada|alternad\w*|consultar|aproximadamente|feriados?)\b/;
/** "Funciones en octubre", "Funciones de octubre y noviembre". */
const MONTH_HEADER_RE = new RegExp(
  `^funciones (?:en|de|durante)(?: el mes de)? ((?:${MONTH_SRC})(?:\\s*(?:,|y)\\s*(?:${MONTH_SRC}))*)\\s*:?$`,
);

/** Líneas (<br>) y frases (". " + letra) del texto lateral. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[^\s\d])/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

/** Texto lateral → fechas enumeradas, reglas semanales, avisos de estado y frases no legibles. */
export function parseScheduleText(
  text: string,
  ctx: { season: Season; now: DateTime },
): TextSchedule {
  const out: TextSchedule = {
    enumerated: [],
    weekly: [],
    statusNotes: [],
    unsupported: [],
    untimedDates: [],
    warnings: [],
  };
  let monthScope: number[] = [];

  for (const sentence of splitSentences(text)) {
    const c = cleanText(sentence);
    const warn: Warn = (m) => out.warnings.push(`"${sentence}": ${m}`);
    const unsupported = (why: string) => {
      out.unsupported.push(sentence);
      warn(why);
    };

    const header = MONTH_HEADER_RE.exec(c.replace(/[.:]$/, ''));
    if (header) {
      monthScope = [...(header[1] ?? '').matchAll(new RegExp(MONTH_SRC, 'g'))]
        .map((m) => MONTHS[m[0]] ?? 0)
        .filter((m) => m > 0);
      continue;
    }

    const status = detectStatusEs(c);
    if (status) {
      // Un aviso de estado nunca crea una regla semanal ("se suspende la función del sábado").
      const scanned = scanDates(c, ctx, () => {});
      out.statusNotes.push({ status, dates: scanned.dates, text: sentence });
    }
    if (TICKETS_RE.test(c)) continue;
    if (GROUPS_RE.test(c)) {
      warn('función para grupos con inscripción: no se publica');
      continue;
    }

    let rest = c;
    let range: DateRange | null = null;
    const found = detectRange(rest, ctx, warn);
    if (found) {
      if (!found.value) {
        unsupported('rango de fechas que no se puede afirmar');
        continue;
      }
      range = found.value;
      rest = rest.replace(found.match, ' ');
    }

    const lists = findTimeLists(rest);
    const hasDays = scanWeekdays(rest).length > 0 || /\d/.test(rest.replace(TIME_LIST_RE, ' '));
    if (lists === null) {
      if (!status) unsupported('hora ilegible');
      continue;
    }
    if (lists.length === 0) {
      // Un aviso sin hora ("función del sábado 25 suspendida") ya quedó registrado como estado.
      if (status) continue;
      const scanned = scanDates(rest, ctx, () => {});
      if (scanned.dates.length > 0) {
        out.untimedDates.push(...scanned.dates);
        warn('fecha sin hora publicada: no se emite función');
      } else if (scanWeekdays(rest).length > 0) {
        unsupported('días de semana sin hora');
      } else if (range) {
        unsupported('rango sin días ni horas');
      }
      continue;
    }
    if (OPENING_HOURS_RE.test(rest)) {
      unsupported('horario de apertura ("de … a … h"), no funciones');
      continue;
    }
    if (UNSUPPORTED_RE.test(rest) && !status) {
      unsupported('alcance del horario no legible con certeza');
      continue;
    }
    if (!hasDays) {
      unsupported('hora sin días');
      continue;
    }

    // Cláusulas: el texto que precede a cada lista de horas ("viernes " 20:30 h, " y sabados " 20 h).
    let from = 0;
    let readable = true;
    const clauses: Array<{ text: string; times: LocalTimeParts[] }> = [];
    for (const list of lists) {
      clauses.push({ text: rest.slice(from, list.index), times: list.times });
      from = list.end;
    }
    const tail = rest.slice(from);
    if (scanWeekdays(tail).length > 0 || /\d/.test(tail)) readable = false;

    const enumerated: DatedFunction[] = [];
    const weekly: WeeklyRule[] = [];
    for (const clause of clauses) {
      const scanned = scanDates(clause.text, ctx, warn);
      if (scanned.items > 0) {
        if (scanned.unresolved > 0) readable = false;
        for (const date of scanned.dates) {
          for (const time of clause.times) enumerated.push({ date, time, sourceText: sentence });
        }
        continue;
      }
      const weekdays = scanWeekdays(clause.text);
      if (weekdays.length === 0) {
        readable = false;
        continue;
      }
      if (status) continue; // un aviso con días de semana no crea funciones
      weekly.push({
        weekdays,
        times: clause.times,
        range,
        months: monthScope,
        sourceText: sentence,
      });
    }
    if (!readable) {
      unsupported('días u horas que no se pueden emparejar con certeza');
      continue;
    }
    if (range && enumerated.length > 0) {
      for (const f of enumerated) {
        if (f.date < range.start || f.date > range.end) {
          unsupported(`fecha ${f.date} fuera del rango de la misma frase`);
          readable = false;
          break;
        }
      }
      if (!readable) continue;
    }
    out.enumerated.push(...enumerated);
    out.weekly.push(...weekly);
  }
  return out;
}

/** Días de una regla semanal dentro de [desde, hasta] (y de su subrango y meses). */
export function expandWeekly(rule: WeeklyRule, bounds: DateRange): DatedFunction[] {
  const start = maxDate(bounds.start, rule.range?.start);
  const end = minDate(bounds.end, rule.range?.end);
  const out: DatedFunction[] = [];
  if (!start || !end || start > end) return out;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (!rule.weekdays.includes(weekdayOf(day))) continue;
    if (rule.months.length > 0 && !rule.months.includes(Number(day.slice(5, 7)))) continue;
    for (const time of rule.times) out.push({ date: day, time, sourceText: rule.sourceText });
  }
  return out;
}

// ── Plan de ocurrencias ────────────────────────────────────────────────────

export interface PlanInput {
  /** Funciones que el calendario del sitio lista para esta obra. */
  calendar: CalendarFunction[];
  /** Ventana del calendario leída en esta corrida (null = no se leyó). */
  calendarWindow: DateRange | null;
  /** Texto del bloque lateral del detalle (líneas separadas por \n). */
  scheduleText: string;
  season: Season;
  /** Textos literales de estreno/última función, para el scheduleText de un rango. */
  seasonText?: string | null;
  now: DateTime;
}

export type PlanForm = 'calendar' | 'text' | 'range' | 'none';

/** Un patrón semanal se expande como mucho un año hacia adelante (temporadas largas). */
export const MAX_EXPANSION_DAYS = 366;

export interface Plan {
  specs: OccurrenceSpec[];
  form: PlanForm;
  warnings: string[];
}

/** Plan PURO: calendario (si lista la obra) → texto lateral → temporada como rango → nada. */
export function planOccurrences(input: PlanInput): Plan {
  const warnings: string[] = [];
  const now = input.now.setZone(BA_TZ);
  const today = now.toISODate() ?? '';
  const { season } = input;
  const seasonOk = !(season.start && season.end && season.start > season.end);
  if (!seasonOk) {
    warnings.push(`temporada publicada incoherente (${season.start} > ${season.end})`);
  }
  const text = parseScheduleText(input.scheduleText, { season, now });
  warnings.push(...text.warnings);

  const undated = text.statusNotes.filter((n) => n.dates.length === 0);
  if (undated.some((n) => n.status !== 'sold_out')) {
    const notes = undated.map((n) => `"${n.text}"`).join(', ');
    warnings.push(`aviso de estado sin fecha atribuible (${notes}): no se publica ninguna función`);
    return { specs: [], form: 'none', warnings };
  }
  for (const n of undated) {
    warnings.push(`"agotado" sin fecha atribuible ("${n.text}"): se ignora`);
  }

  // Con una temporada incoherente no se filtra por ella (pero tampoco se expanden patrones).
  const inSeason = (d: string) =>
    !seasonOk || ((!season.start || d >= season.start) && (!season.end || d <= season.end));

  let timed: TimedSpec[] = [];
  let form: PlanForm = 'none';
  const upcoming = input.calendar.filter((f) => f.date >= today);

  if (upcoming.length > 0) {
    form = 'calendar';
    for (const f of upcoming) {
      if (!inSeason(f.date)) {
        warnings.push(
          `el calendario lista ${f.date} ${formatTime(f.time)} fuera de la temporada publicada (${season.start ?? '…'} – ${season.end ?? '…'}): no se emite`,
        );
        continue;
      }
      timed.push({
        kind: 'timed',
        date: f.date,
        time: f.time,
        sourceText: f.sourceText,
        status: 'scheduled',
      });
    }
    // Control cruzado (solo aviso): hora del calendario que el patrón del texto no menciona.
    for (const f of timed) {
      const rules = text.weekly.filter((r) => r.weekdays.includes(weekdayOf(f.date)));
      if (rules.length > 0 && !rules.some((r) => r.times.some((t) => same(t, f.time)))) {
        warnings.push(
          `el calendario publica ${f.date} ${formatTime(f.time)} y el texto otra hora para ese día`,
        );
      }
    }
  } else {
    if (input.calendarWindow) {
      warnings.push(
        `el calendario del sitio (${input.calendarWindow.start} – ${input.calendarWindow.end}) no lista la obra: se usa el texto publicado`,
      );
    }
    if (text.unsupported.length > 0) {
      warnings.push(
        `texto de funciones no legible con certeza (${text.unsupported.map((s) => `"${s}"`).join(', ')}): no se derivan funciones`,
      );
    } else {
      for (const f of text.enumerated) {
        if (f.date < today) continue;
        if (!inSeason(f.date)) {
          warnings.push(`fecha ${f.date} fuera de la temporada publicada: no se emite`);
          continue;
        }
        timed.push({ kind: 'timed', ...f, status: 'scheduled' });
      }
      for (const rule of text.weekly) {
        const start = maxDate(season.start, rule.range?.start);
        const end = minDate(season.end, rule.range?.end);
        if (!seasonOk || !start || !end) {
          warnings.push(
            `patrón semanal sin temporada publicada ("${rule.sourceText}"; estreno ${season.start ?? '…'}, última función ${season.end ?? '…'}): no se emiten funciones`,
          );
          continue;
        }
        const horizon = addDays(today, MAX_EXPANSION_DAYS);
        if (end > horizon) {
          warnings.push(
            `temporada hasta ${end}: el patrón semanal se expande solo hasta ${horizon} (${MAX_EXPANSION_DAYS} días)`,
          );
        }
        const window = { start: maxDate(start, today) ?? start, end: minDate(end, horizon) ?? end };
        for (const f of expandWeekly(rule, window)) {
          timed.push({ kind: 'timed', ...f, status: 'scheduled' });
        }
      }
      if (timed.length > 0) form = 'text';
    }
  }

  // Avisos con fecha: estado explícito sobre esas funciones; una reprogramada se retira.
  for (const note of text.statusNotes.filter((n) => n.dates.length > 0)) {
    const hit = timed.filter((s) => note.dates.includes(s.date));
    if (hit.length === 0) {
      warnings.push(`aviso "${note.text}" no coincide con ninguna función publicada`);
      continue;
    }
    if (note.status === 'rescheduled') {
      timed = timed.filter((s) => !note.dates.includes(s.date));
      warnings.push(`aviso de reprogramación "${note.text}": se retiran ${hit.length} función(es)`);
      continue;
    }
    for (const s of hit) {
      s.status = note.status;
      s.statusReason = note.text;
    }
  }

  // Dedupe y orden.
  const byKey = new Map<string, TimedSpec>();
  for (const s of timed) {
    const key = `${s.date}|${formatTime(s.time)}`;
    if (!byKey.has(key)) byKey.set(key, s);
  }
  const specs: OccurrenceSpec[] = [...byKey.values()].sort((a, b) =>
    `${a.date}T${formatTime(a.time)}`.localeCompare(`${b.date}T${formatTime(b.time)}`),
  );

  if (specs.length === 0) {
    if (seasonOk && season.start && season.end && season.end >= today) {
      const scheduleText = condense(input.scheduleText) || (input.seasonText ?? '');
      specs.push({
        kind: 'range',
        start: season.start,
        end: season.end,
        scheduleText,
        sourceText: input.seasonText ?? `${season.start} – ${season.end}`,
      });
      form = 'range';
      warnings.push('sin funciones con hora: se publica la temporada como rango');
    } else {
      form = 'none';
      warnings.push('sin funciones ni temporada completa publicada: el evento queda candidato');
    }
  }
  return { specs, form, warnings };
}

function same(a: LocalTimeParts, b: LocalTimeParts): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}
