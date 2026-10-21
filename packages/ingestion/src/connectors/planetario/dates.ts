import {
  BA_TZ,
  detectStatusEs,
  type LocalTimeParts,
  type ParsedOccurrenceStatus,
  partsToLocalDate,
  stripDiacriticsLower,
} from '@culturaba/shared';
import { DateTime } from 'luxon';

/**
 * Parser PURO de las fechas de planetario.buenosaires.gob.ar (ver docs/research/planetario.md).
 *
 * El sitio publica el "¿Cuándo?" de cada actividad como texto libre (campo Drupal
 * `field_evento_cuando`, el mismo en la tarjeta del listado y en la ficha), casi siempre SIN año:
 *   "Domingo 18 de octubre 18 h"                        → timed 18:00
 *   "Viernes 28 de noviembre 19:30h" · "Viernes 4 de julio 19.30 h" · "Viernes 9 de mayo , inicio 19 h"
 *   "Sábados 17, 24 y 31 de octubre de 2026" + "Horario: de 10 a 11:30 h" → 3 funciones 10:00–11:30
 *   "Las funciones serán el viernes 2, sábado 3, viernes 16 y sábado 17 de octubre, de 19 a 20.30 h."
 *   "Desde el sábado 18 de julio al domingo 2 de agosto"  → range con el texto literal
 *   "Inicio del curso: miércoles 2 de septiembre de 2026" + "Horario: miércoles 19 h a 21.45 h." +
 *   "Última clase: miércoles 18 de noviembre de 2026"     → range (temporada del curso)
 *   "12; 13 ; 14 ; 19 ; 20 y 21 de julio …" · "25 de marzo 19h" → sin año ni día de semana: ambigua
 *   "Funciones inmersivas en el domo sábados, domingos y lunes 12 de octubre" · "De martes a
 *   viernes 12.30 h" → patrón semanal: nunca se convierte en funciones (no hay temporada)
 *
 * AÑO (regla del proyecto):
 *  · con año → ese año (el día de semana, si viene, tiene que coincidir);
 *  · sin año, con día de semana → el único año en que ese día y mes caen en ese día de semana
 *    dentro de la ventana [hoy − 7 días, hoy + 12 meses];
 *  · sin año ni día de semana → ambigua: se omite con aviso.
 * Los listados acumulan años (Encuentros de Ciencia arranca en 2019) y el día de semana se repite
 * cada 5-6 años: "Jueves 18 de marzo" (2021) vuelve a ser jueves en 2027. Por eso, cuando se conoce
 * el mes de carga de la imagen del ítem (/sites/default/files/AAAA-MM/, ver uploadMonthOf), la
 * fecha inferida además tiene que caer en su ventana de publicación [mes − 3 meses, mes + 12
 * meses]. Ese mes NUNCA produce una fecha: solo descarta inferencias y clasifica lo archivado como
 * pasado. Una fecha anterior a hoy − 7 días no se emite.
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

/** Fechas anteriores a hoy − PAST_GRACE_DAYS no se emiten. */
export const PAST_GRACE_DAYS = 7;
/** Una fecha sin año se infiere como mucho hasta hoy + MAX_AHEAD_MONTHS. */
export const MAX_AHEAD_MONTHS = 12;
/** Ventana de publicación alrededor del mes de carga de la imagen del ítem. */
export const PUBLISHED_BEFORE_MONTHS = 3;
export const PUBLISHED_AHEAD_MONTHS = 12;

/** Minúsculas sin acentos, guiones tipográficos → '-', "⋅" → espacio, espacios colapsados. */
export function normalizeText(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[​-‍﻿]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/[⋅·•]/g, ' ')
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

export function todayOf(now: DateTime): string {
  return now.setZone(BA_TZ).toISODate() ?? '';
}

export interface DateWindow {
  /** Primer día que se emite (hoy − 7 días). */
  cutoff: string;
  /** Último día al que puede llegar una fecha inferida (hoy + 12 meses). */
  horizon: string;
}

export function windowOf(now: DateTime): DateWindow {
  const today = now.setZone(BA_TZ).startOf('day');
  return {
    cutoff: today.minus({ days: PAST_GRACE_DAYS }).toISODate() ?? '',
    horizon: today.plus({ months: MAX_AHEAD_MONTHS }).toISODate() ?? '',
  };
}

// ── Mes de carga de la imagen ──────────────────────────────────────────────

/**
 * "AAAA-MM" de una imagen de Drupal: /sites/default/files/2026-10/x.png (también en estilos,
 * /sites/default/files/styles/<estilo>/public/2026-10/x.png). Null si la ruta no tiene mes.
 */
export function uploadMonthOf(url: string | null | undefined): string | null {
  const m =
    /\/sites\/default\/files\/(?:styles\/[^/]+\/public\/)?((?:19|20)\d{2})-(0[1-9]|1[0-2])\//.exec(
      url ?? '',
    );
  return m ? `${m[1]}-${m[2]}` : null;
}

interface Span {
  start: string;
  end: string;
}

function publicationWindow(uploadMonth: string): Span | null {
  const month = DateTime.fromISO(`${uploadMonth}-01`, { zone: BA_TZ });
  if (!month.isValid) return null;
  return {
    start: month.minus({ months: PUBLISHED_BEFORE_MONTHS }).toISODate() ?? '',
    end: month.plus({ months: PUBLISHED_AHEAD_MONTHS }).endOf('month').toISODate() ?? '',
  };
}

// ── Horas ──────────────────────────────────────────────────────────────────

export interface TimeSlot {
  start: LocalTimeParts;
  /** Solo si el texto publica la franja ("de 19 a 20.30 h"). */
  end: LocalTimeParts | null;
}

const T = '(\\d{1,2})(?:[:.,](\\d{2}))?';
const UNIT = '(?:hs|hrs|h|horas?)\\b';
/** "de 19 a 20.30 h" · "19 a 21 h" · "17 a 21h" · "de 10 a 11:30 h" · "19 h a 21.45 h". */
const TIME_RANGE_RE = new RegExp(
  `(?:^|[^\\d.:,])(?:de\\s+)?${T}\\s*(?:${UNIT}\\.?)?\\s*(?:a|-)\\s*${T}\\s*${UNIT}`,
);
const T_LIST = '\\d{1,2}(?:[:.,]\\d{2})?(?:\\s*(?:,|y)\\s*(?:las\\s+)?\\d{1,2}(?:[:.,]\\d{2})?)*';
/** "18 h" · "19h" · "19:30h" · "19.30 h" · "19 hs" · "a las 17 y 19 h". */
const TIME_LIST_RE = new RegExp(`(?:^|[^\\d.:,])(${T_LIST})\\s*${UNIT}`);
/** "⋅19:00" (sin unidad, pero con dos puntos). */
const TIME_COLON_RE = /(?:^|[^\d.:,])(\d{1,2}):(\d{2})(?!\d)/;
/** "a las 19.30" · "a la 13 y 17" (sin unidad). */
const TIME_ALAS_RE = new RegExp(`\\b(?:a|desde) las?\\s+(${T_LIST})`);
/** Línea que es solo un horario: "Horario: de 10 a 11:30 h", "19 h", "de 19 a 21 h". */
const TIME_LINE_RE = new RegExp(
  `^(?:horarios?\\s*:?\\s*)?(?:de\\s+|a las\\s+|desde las\\s+)?\\d{1,2}(?:[:.,]\\d{2})?\\s*(?:${UNIT}|(?:a|-)\\s*\\d)`,
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

/** Horas publicadas en un texto ya normalizado. Una franja da inicio y fin; una lista, una función por hora. */
export function parseTimes(cleaned: string, warn: Warn = () => {}): TimeSlot[] {
  const range = TIME_RANGE_RE.exec(cleaned);
  if (range) {
    const start = timeOf(range[1], range[2]);
    const end = timeOf(range[3], range[4]);
    if (!start) return [];
    if (!end || minutesOf(end) <= minutesOf(start)) {
      warn(`franja horaria que no termina el mismo día ("${range[0].trim()}"): se omite el fin`);
      return [{ start, end: null }];
    }
    return [{ start, end }];
  }
  const list = TIME_LIST_RE.exec(cleaned) ?? TIME_ALAS_RE.exec(cleaned);
  if (list?.[1]) {
    const slots: TimeSlot[] = [];
    for (const m of list[1].matchAll(/(\d{1,2})(?:[:.,](\d{2}))?/g)) {
      const t = timeOf(m[1], m[2]);
      if (!t) {
        warn(`hora inválida "${m[0]}", se ignora`);
        continue;
      }
      if (!slots.some((s) => minutesOf(s.start) === minutesOf(t))) {
        slots.push({ start: t, end: null });
      }
    }
    return slots;
  }
  const colon = TIME_COLON_RE.exec(cleaned);
  const t = colon ? timeOf(colon[1], colon[2]) : null;
  return t ? [{ start: t, end: null }] : [];
}

// ── Expresiones de fecha ───────────────────────────────────────────────────

type Tok =
  | { t: 'wd'; v: number; s: number; e: number }
  | { t: 'mon'; v: number; s: number; e: number }
  | { t: 'year'; v: number; s: number; e: number }
  | { t: 'num'; v: number; s: number; e: number }
  | { t: 'numdate'; d: number; m: number; y: number | null; s: number; e: number }
  | { t: 'time' | 'sep' | 'range' | 'filler' | 'word' | 'punct'; s: number; e: number };

const TOKEN_RE = new RegExp(
  [
    // "a las 13 y 14 h", "a la 13", "desde las 15": horas, no un rango de días ("al 13")
    `(?<alas>(?:a|desde) las?\\s+${T_LIST}(?:\\s*${UNIT}\\.?)?)`,
    // franja horaria completa ("de 19 a 20.30 h"): no confundir el 19 con un día
    `(?<trange>(?:de\\s+)?\\d{1,2}(?:[:.,]\\d{2})?\\s*(?:${UNIT}\\.?)?\\s*(?:a|-)\\s*\\d{1,2}(?:[:.,]\\d{2})?\\s*${UNIT}\\.?)`,
    // 26/8 · 25 /11 · 12/8/2022
    '(?<nd>\\d{1,2})\\s*\\/\\s*(?<nm>\\d{1,2})(?:\\s*\\/\\s*(?<ny>\\d{4}|\\d{2}))?(?!\\d)',
    `(?<time>\\d{1,2}(?:[:.,]\\d{2})?\\s*${UNIT}\\.?|\\d{1,2}:\\d{2}(?!\\d))`,
    '(?<year>(?:19|20)\\d{2})(?!\\d)',
    '(?<num>\\d{1,2})(?!\\d)',
    '(?<big>\\d+)',
    '(?<word>[a-z]+)',
    '(?<punct>\\S)',
  ].join('|'),
  'y',
);

const SEP_WORDS = new Set(['y', 'e']);
const RANGE_WORDS = new Set(['al', 'hasta', 'a']);
const FILLER_WORDS = new Set(['de', 'del', 'el', 'la', 'los', 'las']);

function tokenize(cleaned: string): Tok[] {
  const toks: Tok[] = [];
  let pos = 0;
  while (pos < cleaned.length) {
    while (pos < cleaned.length && cleaned[pos] === ' ') pos += 1;
    if (pos >= cleaned.length) break;
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(cleaned);
    if (!m?.groups) break;
    const s = pos;
    const e = pos + m[0].length;
    pos = e;
    const g = m.groups;
    if (g.alas !== undefined || g.trange !== undefined || g.time !== undefined) {
      toks.push({ t: 'time', s, e });
    } else if (g.nd !== undefined && g.nm !== undefined) {
      const yy = g.ny !== undefined ? Number(g.ny) : null;
      toks.push({
        t: 'numdate',
        d: Number(g.nd),
        m: Number(g.nm),
        y: yy === null ? null : yy < 100 ? 2000 + yy : yy,
        s,
        e,
      });
    } else if (g.year !== undefined) toks.push({ t: 'year', v: Number(g.year), s, e });
    else if (g.num !== undefined) toks.push({ t: 'num', v: Number(g.num), s, e });
    else if (g.word !== undefined) {
      const w = g.word;
      if (w in WEEKDAYS) toks.push({ t: 'wd', v: WEEKDAYS[w] ?? 0, s, e });
      else if (w in MONTHS) toks.push({ t: 'mon', v: MONTHS[w] ?? 0, s, e });
      else if (SEP_WORDS.has(w)) toks.push({ t: 'sep', s, e });
      else if (RANGE_WORDS.has(w)) toks.push({ t: 'range', s, e });
      else if (FILLER_WORDS.has(w)) toks.push({ t: 'filler', s, e });
      else toks.push({ t: 'word', s, e });
    } else if (g.punct === ',' || g.punct === ';') toks.push({ t: 'sep', s, e });
    else if (g.punct === '-') toks.push({ t: 'range', s, e });
    else toks.push({ t: g.big !== undefined ? 'word' : 'punct', s, e });
  }
  return toks;
}

export interface DayRef {
  day: number;
  month: number;
  year: number | null;
  weekday: number | null;
}

export interface DateExpr {
  items: DayRef[];
  /** Hubo un conector de rango ("al", "hasta", "-") antes de items[rangeAt]. */
  rangeAt: number | null;
  /** Días de semana sin número antes de la fecha ("sábados, domingos y lunes 12 de octubre"). */
  pattern: boolean;
  /** Números de día sin mes al final (se descartan). */
  loose: number;
  /** Posiciones en el texto normalizado. */
  start: number;
  end: number;
}

function isDayNum(tok: Tok | undefined): boolean {
  return tok?.t === 'num' && tok.v >= 1 && tok.v <= 31;
}

function startsItem(toks: readonly Tok[], i: number): boolean {
  const tok = toks[i];
  if (!tok) return false;
  if (tok.t === 'numdate' || isDayNum(tok)) return true;
  return tok.t === 'wd' && (isDayNum(toks[i + 1]) || toks[i + 1]?.t === 'numdate');
}

/** Índice del próximo token que no es separador, relleno ni conector de rango. */
function nextMeaningful(toks: readonly Tok[], i: number): number {
  let j = i;
  while (j < toks.length) {
    const t = toks[j]?.t;
    if (t !== 'sep' && t !== 'filler' && t !== 'range') break;
    j += 1;
  }
  return j;
}

/** [día de semana] día [, [día de semana] día]* [de] mes [[de] año] [(al|y) …]. */
function parseExprAt(toks: readonly Tok[], i0: number): { expr: DateExpr; next: number } | null {
  const items: DayRef[] = [];
  let pending: Array<{ day: number; weekday: number | null }> = [];
  let weekday: number | null = null;
  let rangeAt: number | null = null;
  let end = -1;
  let next = i0;
  let i = i0;
  while (i < toks.length) {
    const tok = toks[i];
    if (!tok) break;
    if (tok.t === 'wd') {
      if (!startsItem(toks, i)) break;
      weekday = tok.v;
      i += 1;
      continue;
    }
    if (tok.t === 'num' && isDayNum(tok)) {
      pending.push({ day: tok.v, weekday });
      i += 1;
      continue;
    }
    if (tok.t === 'numdate') {
      if (pending.length > 0) break;
      const item: DayRef = { day: tok.d, month: tok.m, year: tok.y, weekday };
      items.push(item);
      end = tok.e;
      i += 1;
      // "Desde el 30/10 al 13/11 2020"
      const a = toks[i];
      const b = toks[i + 1];
      const yearTok = a?.t === 'year' ? a : a?.t === 'filler' && b?.t === 'year' ? b : null;
      if (yearTok && yearTok.t === 'year') {
        for (const it of items) if (it.year === null) it.year = yearTok.v;
        end = yearTok.e;
        i = toks.indexOf(yearTok) + 1;
      }
      next = i;
      continue;
    }
    if (tok.t === 'mon') {
      if (pending.length === 0) break;
      for (const p of pending) items.push({ ...p, month: tok.v, year: null });
      pending = [];
      end = tok.e;
      i += 1;
      // "… de octubre de 2026" / "… de abril 2024"
      const a = toks[i];
      const b = toks[i + 1];
      const yearTok = a?.t === 'year' ? a : a?.t === 'filler' && b?.t === 'year' ? b : null;
      if (yearTok && yearTok.t === 'year') {
        for (const item of items) if (item.year === null) item.year = yearTok.v;
        end = yearTok.e;
        i = toks.indexOf(yearTok) + 1;
      }
      next = i;
      continue;
    }
    if (tok.t === 'sep' || tok.t === 'filler' || tok.t === 'range') {
      // Solo se sigue si lo que viene es otro día (o el mes de los días pendientes).
      const j = nextMeaningful(toks, i);
      const ahead = toks[j];
      const continues =
        startsItem(toks, j) || (ahead?.t === 'mon' && pending.length > 0 && tok.t !== 'range');
      if (!continues) break;
      const hasRange = toks.slice(i, j).some((t) => t.t === 'range');
      if (hasRange) {
        if (rangeAt !== null || (items.length === 0 && pending.length === 0)) break;
        rangeAt = items.length + pending.length;
      }
      i = j;
      continue;
    }
    break;
  }
  if (items.length === 0) return null;
  const first = toks[i0];
  return {
    expr: {
      items,
      rangeAt,
      pattern: false,
      loose: pending.length,
      start: first?.s ?? 0,
      end,
    },
    next: Math.max(next, i0 + 1),
  };
}

export interface LineDates {
  exprs: DateExpr[];
  /** Hay días de semana sin número ("Martes a viernes", "sábados, domingos y lunes …"). */
  weekly: boolean;
}

/** Todas las expresiones de fecha de una línea (ya normalizada). */
export function extractDates(cleaned: string): LineDates {
  const toks = tokenize(cleaned);
  const exprs: DateExpr[] = [];
  let weekly = false;
  let patternRun = false;
  let i = 0;
  while (i < toks.length) {
    const tok = toks[i];
    if (!tok) break;
    if (tok.t === 'wd' && !startsItem(toks, i)) {
      weekly = true;
      patternRun = true;
      i += 1;
      continue;
    }
    if (startsItem(toks, i)) {
      const parsed = parseExprAt(toks, i);
      if (parsed) {
        parsed.expr.pattern = patternRun;
        exprs.push(parsed.expr);
        i = parsed.next;
        patternRun = false;
        continue;
      }
    }
    if (tok.t !== 'sep' && tok.t !== 'filler' && tok.t !== 'range') patternRun = false;
    i += 1;
  }
  return { exprs, weekly };
}

// ── Año ────────────────────────────────────────────────────────────────────

export interface YearContext {
  now: DateTime;
  /** Mes de carga de la imagen del ítem ("2026-10"); null si no se conoce. */
  uploadMonth: string | null;
}

export type DayResolution =
  | { kind: 'date'; date: string }
  | { kind: 'past' }
  | { kind: 'unresolved'; reason: string };

function label(ref: DayRef): string {
  return `${ref.day}/${ref.month}${ref.year !== null ? `/${ref.year}` : ''}`;
}

/** Día publicado → fecha (de hoy − 7 días en adelante), pasado, o sin resolver con el motivo. */
export function resolveDay(ref: DayRef, ctx: YearContext): DayResolution {
  const { cutoff, horizon } = windowOf(ctx.now);
  if (ref.year !== null) {
    const local = toLocal(ref.year, ref.month, ref.day);
    if (!local) return { kind: 'unresolved', reason: `fecha inexistente ${label(ref)}` };
    if (ref.weekday !== null && weekdayOf(local) !== ref.weekday) {
      return { kind: 'unresolved', reason: `el día de semana publicado no coincide con ${local}` };
    }
    return local < cutoff ? { kind: 'past' } : { kind: 'date', date: local };
  }

  const todayYear = ctx.now.setZone(BA_TZ).year;
  const published = ctx.uploadMonth ? publicationWindow(ctx.uploadMonth) : null;
  const fromYear = published ? Number(published.start.slice(0, 4)) : todayYear - 1;
  const candidates: string[] = [];
  for (let y = fromYear; y <= todayYear + 1; y += 1) {
    const d = toLocal(y, ref.month, ref.day);
    if (d && (ref.weekday === null || weekdayOf(d) === ref.weekday)) candidates.push(d);
  }
  const plausible = published
    ? candidates.filter((d) => d >= published.start && d <= published.end)
    : candidates;
  const current = plausible.filter((d) => d >= cutoff && d <= horizon);

  if (ref.weekday === null) {
    // Sin año ni día de semana solo se puede afirmar que ya pasó (todas las opciones, viejas).
    if (published && plausible.length > 0 && plausible.every((d) => d < cutoff)) {
      return { kind: 'past' };
    }
    return {
      kind: 'unresolved',
      reason: `fecha sin año ni día de semana (${label(ref)}): ambigua`,
    };
  }
  if (current.length === 1 && current[0]) return { kind: 'date', date: current[0] };
  if (current.length > 1) {
    return { kind: 'unresolved', reason: `${label(ref)} cae en ese día de semana en varios años` };
  }
  if (plausible.some((d) => d < cutoff)) return { kind: 'past' };
  const inWindow = candidates.find((d) => d >= cutoff && d <= horizon);
  if (published && inWindow) {
    return {
      kind: 'unresolved',
      reason: `el día de semana ubica ${label(ref)} el ${inWindow}, lejos de la publicación del ítem (imagen de ${ctx.uploadMonth}): ambigua`,
    };
  }
  return {
    kind: 'unresolved',
    reason: `ningún año entre ${cutoff} y ${horizon} hace coincidir ${label(ref)} con el día de semana publicado`,
  };
}

export type RangeResolution =
  | { kind: 'range'; start: string; end: string }
  | { kind: 'past' }
  | { kind: 'unresolved'; reason: string };

/**
 * "Desde el sábado 18 de julio al domingo 2 de agosto" / "del jueves 27 al viernes 28 de agosto".
 * El fin decide el año; el inicio toma ese año (o el anterior si el rango cruza el año nuevo).
 * Un rango que ya empezó y sigue vigente se publica tal cual (inicio en el pasado).
 */
export function resolveRange(from: DayRef, to: DayRef, ctx: YearContext): RangeResolution {
  const { cutoff } = windowOf(ctx.now);
  let end: string;
  if (to.year !== null || to.weekday !== null) {
    const r = resolveDay(to, ctx);
    if (r.kind !== 'date') return r;
    end = r.date;
  } else {
    return { kind: 'unresolved', reason: `rango sin año ni día de semana (${label(to)}): ambiguo` };
  }
  const endYear = Number(end.slice(0, 4));
  const ordered = from.month < to.month || (from.month === to.month && from.day <= to.day);
  const fromYear = from.year ?? (ordered ? endYear : endYear - 1);
  const start = toLocal(fromYear, from.month, from.day);
  if (!start) return { kind: 'unresolved', reason: `fecha inexistente ${label(from)}` };
  if (from.weekday !== null && weekdayOf(start) !== from.weekday) {
    return { kind: 'unresolved', reason: `el día de semana publicado no coincide con ${start}` };
  }
  if (start > end) return { kind: 'unresolved', reason: `rango invertido ${start} – ${end}` };
  return end < cutoff ? { kind: 'past' } : { kind: 'range', start, end };
}

// ── "¿Cuándo?" completo ────────────────────────────────────────────────────

interface SpecBase {
  /** Línea(s) literal(es) de donde sale. */
  sourceText: string;
  status: ParsedOccurrenceStatus;
}

export interface TimedSpec extends SpecBase {
  kind: 'timed';
  date: string;
  start: LocalTimeParts;
  end: LocalTimeParts | null;
}

/** Fecha sin hora: se publica como range de un día con el texto literal (nunca all_day). */
export interface DaySpec extends SpecBase {
  kind: 'day';
  date: string;
}

export interface RangeSpec extends SpecBase {
  kind: 'range';
  start: string;
  end: string;
  /** Texto literal del horario ("Horario: miércoles 19 h a 21.45 h.") o la línea del rango. */
  scheduleText: string | null;
}

export type ScheduleSpec = TimedSpec | DaySpec | RangeSpec;

export interface Schedule {
  /** Solo lo vigente (desde hoy − 7 días), ordenado. */
  specs: ScheduleSpec[];
  /** Fechas resueltas pero anteriores a hoy − 7 días (no se emiten). */
  past: number;
  /** Fechas que no se pudieron ubicar (cada una deja un aviso). */
  unresolved: number;
  /** Líneas con patrón semanal sin fechas ("De martes a viernes 12.30 h"). */
  weekly: string[];
  warnings: string[];
}

export interface ScheduleInput {
  /** Líneas del "¿Cuándo?" en orden. */
  lines: readonly string[];
  now: DateTime;
  uploadMonth: string | null;
}

const SEASON_START_RE = /^inicio\b/;
const SEASON_END_RE = /^(?:ultima clase|fin|finaliza|cierre)\b/;
const SCHEDULE_LABEL_RE = /^horarios?\b/;
/** "Reservá tu vacante a partir del miércoles 7 de octubre": fecha de inscripción, no función. */
const NOT_A_SHOW_DATE_RE = /(?:a partir del?|inscripci\w*|reserv\w*|venta\w*)\s*(?:el\s+)?$/;
const VIRTUAL_RE =
  /\b(?:youtube|transmision en vivo|streaming|zoom|actividad virtual|modalidad virtual|en linea|online)\b/;

/** Estado que afirma una línea; "Cupo completo" = sin lugar (sold_out). */
export function lineStatus(cleaned: string): ParsedOccurrenceStatus | 'rescheduled' | null {
  if (/\bcupo completo\b/.test(cleaned)) return 'sold_out';
  return detectStatusEs(cleaned);
}

function specKey(s: ScheduleSpec): string {
  if (s.kind === 'timed') return `${s.date}T${formatTime(s.start)}`;
  if (s.kind === 'day') return `${s.date}T`;
  return `${s.start}R${s.end}`;
}

/** "¿Cuándo?" → funciones vigentes. Pura: el año sale de `now` y del mes de carga de la imagen. */
export function parseSchedule(input: ScheduleInput): Schedule {
  const warnings: string[] = [];
  const ctx: YearContext = { now: input.now, uploadMonth: input.uploadMonth };
  const { cutoff } = windowOf(input.now);
  const lines = input.lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 0);
  const cleanedLines = lines.map(normalizeText);
  const parsed = cleanedLines.map(extractDates);

  // Estado sin fecha propia ("Cupo completo", "ACTIVIDAD SUSPENDIDA") vale para todo el ítem.
  let globalStatus: ParsedOccurrenceStatus | null = null;
  for (const [i, cleaned] of cleanedLines.entries()) {
    const s = lineStatus(cleaned);
    if ((parsed[i]?.exprs.length ?? 0) === 0 && s && s !== 'rescheduled') {
      globalStatus = globalStatus ?? s;
    }
  }

  const specs = new Map<string, ScheduleSpec>();
  let past = 0;
  let unresolved = 0;
  const weekly: string[] = [];
  const consumed = new Set<number>();

  // Temporada de un curso: "Inicio…" + "Última clase…" (+ "Horario: …").
  const startIdx = cleanedLines.findIndex(
    (l, i) => SEASON_START_RE.test(l) && (parsed[i]?.exprs.length ?? 0) > 0,
  );
  if (startIdx !== -1) {
    consumed.add(startIdx);
    const endIdx = cleanedLines.findIndex(
      (l, i) => SEASON_END_RE.test(l) && (parsed[i]?.exprs.length ?? 0) > 0,
    );
    const scheduleIdx = cleanedLines.findIndex((l) => SCHEDULE_LABEL_RE.test(l));
    const startRef = parsed[startIdx]?.exprs[0]?.items[0];
    const endRef = endIdx === -1 ? undefined : parsed[endIdx]?.exprs[0]?.items[0];
    if (endIdx !== -1) consumed.add(endIdx);
    if (scheduleIdx !== -1) consumed.add(scheduleIdx);
    if (!startRef || !endRef) {
      warnings.push(`"${lines[startIdx]}": temporada sin fecha de fin publicada, no se emite`);
    } else {
      const r = resolveRange({ ...startRef, year: startRef.year ?? endRef.year }, endRef, ctx);
      const sourceText = `${lines[startIdx]} · ${lines[endIdx] ?? ''}`;
      if (r.kind === 'range') {
        const status = globalStatus ?? 'scheduled';
        const spec: RangeSpec = {
          kind: 'range',
          start: r.start,
          end: r.end,
          scheduleText: scheduleIdx !== -1 ? (lines[scheduleIdx] ?? null) : null,
          sourceText,
          status,
        };
        specs.set(specKey(spec), spec);
      } else if (r.kind === 'past') past += 1;
      else {
        unresolved += 1;
        warnings.push(`"${sourceText}": ${r.reason}, se omite`);
      }
    }
  }

  for (const [i, cleaned] of cleanedLines.entries()) {
    if (consumed.has(i)) continue;
    const raw = lines[i] ?? '';
    const line = parsed[i];
    if (!line) continue;
    const warn: Warn = (m) => warnings.push(`"${raw}": ${m}`);
    if (line.exprs.length === 0) {
      if (line.weekly && parseTimes(cleaned).length > 0) weekly.push(raw);
      continue;
    }
    const status = lineStatus(cleaned);
    if (VIRTUAL_RE.test(cleaned)) {
      warn('actividad virtual: no se emite como función en un lugar');
      continue;
    }
    for (const [k, expr] of line.exprs.entries()) {
      if (NOT_A_SHOW_DATE_RE.test(cleaned.slice(0, expr.start))) continue;
      if (expr.pattern) {
        weekly.push(raw);
        continue;
      }
      if (expr.loose > 0) warn(`${expr.loose} número(s) de día sin mes, se ignoran`);
      const occStatus: ParsedOccurrenceStatus =
        status && status !== 'rescheduled' ? status : (globalStatus ?? 'scheduled');
      if (status === 'rescheduled') warn('aviso de reprogramación: se publica la fecha indicada');

      if (expr.rangeAt !== null) {
        const [from, to] = expr.items;
        if (expr.items.length !== 2 || expr.rangeAt !== 1 || !from || !to) {
          unresolved += 1;
          warn('rango de fechas ilegible, se omite');
          continue;
        }
        const r = resolveRange(from, to, ctx);
        if (r.kind === 'range') {
          const spec: RangeSpec = {
            kind: 'range',
            start: r.start,
            end: r.end,
            scheduleText: raw,
            sourceText: raw,
            status: occStatus,
          };
          specs.set(specKey(spec), spec);
        } else if (r.kind === 'past') past += 1;
        else {
          unresolved += 1;
          warn(`${r.reason}, se omite`);
        }
        continue;
      }

      const dates: string[] = [];
      for (const ref of expr.items) {
        const r = resolveDay(ref, ctx);
        if (r.kind === 'date') dates.push(r.date);
        else if (r.kind === 'past') past += 1;
        else {
          unresolved += 1;
          warn(`${r.reason}, se omite`);
        }
      }
      if (dates.length === 0) continue;

      // Horas: entre esta fecha y la siguiente de la línea; si no hay, la línea siguiente
      // cuando es solo un horario ("Horario: de 10 a 11:30 h").
      const rest = cleaned.slice(expr.end, line.exprs[k + 1]?.start ?? cleaned.length);
      let slots = parseTimes(rest, warn);
      let sourceText = raw;
      const nextCleaned = cleanedLines[i + 1];
      if (
        slots.length === 0 &&
        k === line.exprs.length - 1 &&
        nextCleaned !== undefined &&
        (parsed[i + 1]?.exprs.length ?? 0) === 0 &&
        TIME_LINE_RE.test(nextCleaned)
      ) {
        slots = parseTimes(nextCleaned, warn);
        if (slots.length > 0) {
          sourceText = `${raw} · ${lines[i + 1] ?? ''}`;
          consumed.add(i + 1);
        }
      }
      for (const date of dates) {
        if (slots.length === 0) {
          const spec: DaySpec = { kind: 'day', date, sourceText, status: occStatus };
          if (!specs.has(specKey(spec))) specs.set(specKey(spec), spec);
          continue;
        }
        for (const slot of slots) {
          const spec: TimedSpec = {
            kind: 'timed',
            date,
            start: slot.start,
            end: slot.end,
            sourceText,
            status: occStatus,
          };
          if (!specs.has(specKey(spec))) specs.set(specKey(spec), spec);
        }
      }
    }
  }

  // Un día con función con hora no lleva además el "día sin hora".
  const timedDays = new Set(
    [...specs.values()].flatMap((s) => (s.kind === 'timed' ? [s.date] : [])),
  );
  const all = [...specs.values()].filter((s) => !(s.kind === 'day' && timedDays.has(s.date)));
  const current = all
    .filter((s) => (s.kind === 'range' ? s.end : s.date) >= cutoff)
    .sort((a, b) => specKey(a).localeCompare(specKey(b)));
  if (current.length === 0 && weekly.length > 0) {
    warnings.push(
      `patrón semanal sin temporada publicada ("${weekly[0]}"): no se emiten funciones`,
    );
  }
  return { specs: current, past, unresolved, weekly, warnings };
}

/** Primer día vigente de una función (para ordenar el descubrimiento). */
export function specStart(spec: ScheduleSpec): string {
  return spec.kind === 'range' ? spec.start : spec.date;
}
