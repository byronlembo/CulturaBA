import {
  detectStatusEs,
  type LocalTimeParts,
  type ParsedOccurrenceStatus,
  stripDiacriticsLower,
} from '@culturaba/shared';
import { pad2, timeKey } from './dates';

/**
 * Avisos de estado en texto libre de la PRODUCCIÓN: título, subtítulo, `.data` y
 * categoría del detalle; título y `.data` de las filas del listado (que repiten el
 * texto de la producción en cada función). Regla: un aviso alcanza SOLO a las
 * funciones que nombra; nunca se supone que vale para todo el evento.
 *
 *  · Con fecha concreta ("17/10", "16 de octubre", "del 16 y 17", "del 16 al 18 de
 *    octubre", "el día 16", "viernes 16") → solo las funciones de esa fecha (y de esa
 *    hora, si el aviso la publica). Un día suelto vale solo si coincide con funciones
 *    de UNA fecha de la producción.
 *  · Sin fecha asignable (sin fecha, solo mes, solo día de semana, día que coincide
 *    con varios meses) → no cambia el estado de ninguna función. Si es grave
 *    (cancelada/suspendida/postergada), las funciones que podría alcanzar NO se emiten
 *    (si son todas, el evento queda candidato). Siempre queda un aviso literal.
 *  · Título y subtítulo nombran la obra ("El amor pospuesto"): el marcador cuenta solo
 *    separado del nombre (tras guion, entre paréntesis, en mayúsculas o solo) o con fecha.
 *  · `.data` y categoría se leen por oración / línea: "Funciones del 16 y 17 agotadas.
 *    Nueva función: 18/10" no alcanza a la del 18.
 */

export interface StatusClaim {
  status: ParsedOccurrenceStatus;
  /** Texto literal de la fuente que afirma el estado. */
  reason: string;
}

export const STATUS_RANK: Record<ParsedOccurrenceStatus, number> = {
  scheduled: 0,
  sold_out: 1,
  postponed: 2,
  cancelled: 3,
};

/** El estado más grave entre todas las marcas (cancelada > postergada > agotada). */
export function strongestClaim(
  claims: readonly (StatusClaim | null | undefined)[],
): StatusClaim | null {
  let best: StatusClaim | null = null;
  for (const c of claims) {
    if (c && (!best || STATUS_RANK[c.status] > STATUS_RANK[best.status])) best = c;
  }
  return best;
}

type NoticeStatus = 'cancelled' | 'postponed' | 'sold_out';

function noticeStatus(text: string): NoticeStatus | 'rescheduled' | null {
  return detectStatusEs(text);
}

export function claimFromText(text: string | null | undefined): StatusClaim | null {
  const t = clean(text);
  const status = t ? noticeStatus(t) : null;
  return status && status !== 'rescheduled' ? { status, reason: t } : null;
}

/** Una función ya fechada de la producción, candidata a recibir avisos. */
export interface NoticeSlot {
  id: number;
  year: number;
  month: number;
  day: number;
  /** ISO: 1 = lunes … 7 = domingo. */
  weekday: number;
  time: LocalTimeParts;
  /** dayTimeKey(mes, día, hora): cruza con las filas del listado. */
  key: string;
}

export interface NoticeSource {
  text: string;
  /** 'name' = título/subtítulo (nombre de la obra); 'free' = `.data`, categoría. */
  kind: 'name' | 'free';
  /** Dónde está el texto, para los avisos: "título", ".data del detalle", … */
  label: string;
  /**
   * Claves dayTimeKey de las filas del listado que llevan este texto cuando NO son
   * todas las de la producción: entonces el texto es de esas funciones.
   */
  rowKeys?: readonly string[];
}

export interface NoticeOutcome {
  /** Estados asignados a funciones concretas (por id de NoticeSlot). */
  claims: Map<number, StatusClaim[]>;
  /** Funciones que un aviso grave no asignable podría alcanzar: no se emiten. */
  blocked: Map<number, StatusClaim>;
  warnings: string[];
}

// ── Texto ──────────────────────────────────────────────────────────────────

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function fold(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `.data` / categoría → oraciones y líneas (el punto de "20.30" no corta). */
function freeClauses(text: string): string[] {
  return text
    .split(/\n+|[.;!?]+(?=\s|$)|\s[·•|]\s/)
    .map(clean)
    .filter((c) => c.length > 0);
}

const STATUS_WORD_RE =
  /\b(cancelad[oa]s?|suspendid[oa]s?|postergad[oa]s?|pospuest[oa]s?|reprogramad[oa]s?|agotad[oa]s?|sold out)\b/i;
/** Palabras que acompañan a un marcador sin nombrar una obra: "FUNCIÓN SUSPENDIDA". */
const MARKER_FILLER_RE =
  /\b(funcion(es)?|localidades|entradas|espectaculos?|conciertos?|eventos?|show|esta|estan|fue|fueron|ha sido|han sido|se|la|las|el|los|temporalmente|momentaneamente)\b/g;

/** Marcador en mayúsculas dentro de un nombre que no está todo en mayúsculas. */
function isUppercaseMarker(line: string): boolean {
  const plain = line.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = STATUS_WORD_RE.exec(plain);
  return Boolean(m && m[0] === m[0].toUpperCase() && /[a-z]/.test(plain));
}

/** Línea que es SOLO un marcador: "Suspendido", "FUNCIÓN CANCELADA", "Localidades agotadas". */
function isBareMarker(line: string): boolean {
  const rest = fold(line)
    .replace(new RegExp(STATUS_WORD_RE.source, 'gi'), ' ')
    .replace(MARKER_FILLER_RE, ' ')
    .replace(/[^a-z0-9]+/g, '');
  return rest.length === 0;
}

interface NameClauses {
  notices: string[];
  /** Palabra de estado dentro del nombre de la obra: no es un aviso. */
  ignored: string[];
}

/** Segmento que EMPIEZA por el marcador: "Suspendido por lluvia", "Función cancelada por …". */
function startsWithMarker(segment: string): boolean {
  let t = fold(segment).replace(/^[^a-z0-9]+/, '');
  for (;;) {
    const next = t.replace(
      /^(funcion(es)?|localidades|entradas|espectaculos?|la|las|el|los)\s+/,
      '',
    );
    if (next === t) break;
    t = next;
  }
  return new RegExp(`^${STATUS_WORD_RE.source}`, 'i').test(t);
}

/**
 * Título / subtítulo: nombran la obra ("El amor pospuesto"). Cada línea se corta en
 * segmentos (guion con espacios, paréntesis o corchetes); un segmento con palabra de
 * estado es aviso solo si es el marcador solo, empieza por él, lo trae en mayúsculas
 * dentro de un texto en minúsculas o nombra una fecha concreta.
 */
function nameClauses(text: string): NameClauses {
  const notices: string[] = [];
  const ignored: string[] = [];
  for (const line of text.split(/\n+|\s·\s/).map(clean)) {
    if (!line) continue;
    const bracketed = [...line.matchAll(/[([]([^()[\]]*)[)\]]/g)].map((m) => clean(m[1]));
    const segments = line
      .replace(/[([][^()[\]]*[)\]]/g, ' ')
      .split(/\s+[-‒–—―]\s+/)
      .map(clean);
    for (const seg of [...segments, ...bracketed]) {
      if (!seg || !noticeStatus(seg)) continue;
      const marker =
        isBareMarker(seg) ||
        startsWithMarker(seg) ||
        isUppercaseMarker(seg) ||
        hasConcreteDate(seg);
      (marker ? notices : ignored).push(seg);
    }
  }
  return { notices, ignored };
}

// ── Fechas dentro del aviso ────────────────────────────────────────────────

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
const WEEKDAYS: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7,
};
const WEEKDAY_NAMES = [
  '',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];
const MONTH_NAMES = Object.keys(MONTHS);

const MONTH = `(${MONTH_NAMES.join('|')})`;
const WD = '(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';
const ORD = '(?:°|º|ro)?';
const DAY_LIST = `((?:\\s*(?:,|y|e)\\s*(?:${WD}\\s+)?\\d{1,2}${ORD})*)`;

/** 16/10 al 18/10 */
const NUM_RANGE_RE = new RegExp(
  `\\b(?:${WD}\\s+)?(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{4}|\\d{2}))?\\s*(?:al|hasta el|-)\\s*(?:${WD}\\s+)?(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{4}|\\d{2}))?(?![\\d/])`,
  'g',
);
/** 16 al 18 de octubre · 29 de noviembre al 6 de diciembre (de 2026) */
const TEXT_RANGE_RE = new RegExp(
  `\\b(?:${WD}\\s+)?(\\d{1,2})${ORD}(?:\\s+de\\s+${MONTH})?(?:\\s+de\\s+(\\d{4}))?\\s+(?:al|hasta el)\\s+(?:${WD}\\s+)?(\\d{1,2})${ORD}\\s+de\\s+${MONTH}(?:\\s+de\\s+(\\d{4}))?`,
  'g',
);
/** 17/10 · viernes 16/10/2026 */
const NUM_DATE_RE = new RegExp(
  `\\b(?:${WD}\\s+)?(\\d{1,2})\\s*\\/\\s*(\\d{1,2})(?:\\s*\\/\\s*(\\d{4}|\\d{2}))?(?![\\d/])`,
  'g',
);
/** 16 de octubre · 21, 22 y 23 de octubre de 2026 · viernes 16 y sábado 17 de octubre */
const DAYS_MONTH_RE = new RegExp(
  `\\b(?:${WD}\\s+)?(\\d{1,2})${ORD}${DAY_LIST}\\s+de\\s+${MONTH}(?:\\s+de\\s+(\\d{4}))?`,
  'g',
);
/** del 16 y 17 · el día 16 · viernes 16 (sin mes). No cuenta si es una hora o una edad. */
const DAYS_ONLY_RE = new RegExp(
  `\\b(?:del|el|dia|dias|${WD})\\s+(?:dia\\s+)?(\\d{1,2})${ORD}${DAY_LIST}(?![\\d°º%/:.a-z]|\\s*(?:hs?|horas?|anos?|min(?:utos)?|%)\\b)`,
  'g',
);
const MONTH_ONLY_RE = new RegExp(`\\b${MONTH}\\b`, 'g');
const WEEKDAY_ONLY_RE = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?\b/g;
const TIME_RE =
  /\b(\d{1,2})[:.](\d{2})\s*(?:hs?\b|horas?\b)?|\ba las? (\d{1,2})(?:[:.](\d{2}))?\b|\b(\d{1,2})\s*(?:hs|h|horas?)\b/g;

interface DayMonth {
  day: number;
  month: number;
}

type DateRef =
  | { kind: 'date'; day: number; month: number; year: number | null }
  | { kind: 'day'; day: number }
  | { kind: 'range'; from: DayMonth; to: DayMonth; year: number | null }
  | { kind: 'month'; month: number }
  | { kind: 'weekday'; weekday: number };

interface ClauseDates {
  refs: DateRef[];
  times: LocalTimeParts[];
}

function validDay(d: number): boolean {
  return Number.isInteger(d) && d >= 1 && d <= 31;
}

function validMonth(m: number): boolean {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}

function yearOf(text: string | undefined): number | null {
  if (!text) return null;
  const y = Number(text);
  return text.length === 2 ? 2000 + y : y;
}

function daysOf(first: string | undefined, list: string | undefined): number[] {
  return [Number(first), ...[...(list ?? '').matchAll(/\d{1,2}/g)].map((m) => Number(m[0]))].filter(
    validDay,
  );
}

/** Fechas, rangos, meses, días de semana y horas que nombra una oración del aviso. */
function scanClause(clause: string): ClauseDates {
  let rest = fold(clause);
  const refs: DateRef[] = [];
  // Cada fecha reconocida se reemplaza por un separador para no contarla dos veces.
  const take = (re: RegExp, onMatch: (m: (string | undefined)[]) => void): void => {
    rest = rest.replace(re, (...args: unknown[]) => {
      onMatch(args.slice(0, -2) as (string | undefined)[]);
      return ' | ';
    });
  };

  take(NUM_RANGE_RE, (m) => {
    const from = { day: Number(m[1]), month: Number(m[2]) };
    const to = { day: Number(m[4]), month: Number(m[5]) };
    if (validDay(from.day) && validMonth(from.month) && validDay(to.day) && validMonth(to.month)) {
      refs.push({ kind: 'range', from, to, year: yearOf(m[6]) });
    }
  });
  take(TEXT_RANGE_RE, (m) => {
    const toMonth = MONTHS[m[5] ?? ''];
    const fromDay = Number(m[1]);
    const toDay = Number(m[4]);
    if (!toMonth || !validDay(fromDay) || !validDay(toDay)) return;
    const fromMonth = m[2] ? MONTHS[m[2]] : undefined;
    // "del 29 al 6 de diciembre": el mes de inicio no está escrito → no se adivina.
    if (fromMonth === undefined && fromDay > toDay) {
      refs.push({ kind: 'month', month: toMonth });
      return;
    }
    refs.push({
      kind: 'range',
      from: { day: fromDay, month: fromMonth ?? toMonth },
      to: { day: toDay, month: toMonth },
      year: yearOf(m[6]),
    });
  });
  take(NUM_DATE_RE, (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (validDay(day) && validMonth(month)) {
      refs.push({ kind: 'date', day, month, year: yearOf(m[3]) });
    }
  });
  take(DAYS_MONTH_RE, (m) => {
    const month = MONTHS[m[3] ?? ''];
    if (!month) return;
    for (const day of daysOf(m[1], m[2])) {
      refs.push({ kind: 'date', day, month, year: yearOf(m[4]) });
    }
  });
  const dayOnly: number[] = [];
  take(DAYS_ONLY_RE, (m) => {
    dayOnly.push(...daysOf(m[1], m[2]));
  });

  const months = [...new Set([...rest.matchAll(MONTH_ONLY_RE)].map((m) => MONTHS[m[1] ?? '']))];
  const weekdays = [
    ...new Set([...rest.matchAll(WEEKDAY_ONLY_RE)].map((m) => WEEKDAYS[m[1] ?? ''])),
  ];
  if (dayOnly.length > 0 && months.length === 1 && months[0] !== undefined) {
    // "Octubre: función del 16 suspendida" → 16/10.
    for (const day of dayOnly) refs.push({ kind: 'date', day, month: months[0], year: null });
  } else {
    for (const day of dayOnly) refs.push({ kind: 'day', day });
    if (refs.length === 0) {
      for (const month of months) if (month) refs.push({ kind: 'month', month });
      for (const weekday of weekdays) if (weekday) refs.push({ kind: 'weekday', weekday });
    }
  }

  const times: LocalTimeParts[] = [];
  for (const m of rest.matchAll(TIME_RE)) {
    const hour = Number(m[1] ?? m[3] ?? m[5]);
    const minute = Number(m[2] ?? m[4] ?? 0);
    if (hour <= 23 && minute <= 59) times.push({ hour, minute });
  }
  return { refs, times };
}

function hasConcreteDate(text: string): boolean {
  return scanClause(text).refs.some(
    (r) => r.kind === 'date' || r.kind === 'range' || r.kind === 'day',
  );
}

function refLabel(ref: DateRef): string {
  switch (ref.kind) {
    case 'date':
      return `${pad2(ref.day)}/${pad2(ref.month)}${ref.year ? `/${ref.year}` : ''}`;
    case 'day':
      return `día ${ref.day}`;
    case 'range':
      return `${pad2(ref.from.day)}/${pad2(ref.from.month)} al ${pad2(ref.to.day)}/${pad2(ref.to.month)}${ref.year ? `/${ref.year}` : ''}`;
    case 'month':
      return (
        MONTH_NAMES[MONTH_NAMES.findIndex((n) => MONTHS[n] === ref.month)] ?? String(ref.month)
      );
    case 'weekday':
      return WEEKDAY_NAMES[ref.weekday] ?? String(ref.weekday);
  }
}

function md(month: number, day: number): number {
  return month * 100 + day;
}

/** Funciones que el aviso nombra (assigned) o que podría alcanzar sin precisar (ambiguous). */
function matchRef(
  ref: DateRef,
  slots: readonly NoticeSlot[],
): { assigned: NoticeSlot[]; ambiguous: NoticeSlot[] } {
  switch (ref.kind) {
    case 'date':
      return {
        assigned: slots.filter(
          (s) =>
            s.month === ref.month &&
            s.day === ref.day &&
            (ref.year === null || s.year === ref.year),
        ),
        ambiguous: [],
      };
    case 'day': {
      const matching = slots.filter((s) => s.day === ref.day);
      const dates = new Set(matching.map((s) => `${s.year}-${s.month}`));
      return dates.size === 1
        ? { assigned: matching, ambiguous: [] }
        : { assigned: [], ambiguous: matching };
    }
    case 'range': {
      const from = md(ref.from.month, ref.from.day);
      const to = md(ref.to.month, ref.to.day);
      const inRange = (s: NoticeSlot): boolean => {
        if (ref.year !== null) {
          const fromYear = from > to ? ref.year - 1 : ref.year;
          const ord = s.year * 10_000 + md(s.month, s.day);
          return ord >= fromYear * 10_000 + from && ord <= ref.year * 10_000 + to;
        }
        const x = md(s.month, s.day);
        return from <= to ? x >= from && x <= to : x >= from || x <= to;
      };
      return { assigned: slots.filter(inRange), ambiguous: [] };
    }
    case 'month':
      return { assigned: [], ambiguous: slots.filter((s) => s.month === ref.month) };
    case 'weekday':
      return { assigned: [], ambiguous: slots.filter((s) => s.weekday === ref.weekday) };
  }
}

function slotLabel(s: NoticeSlot): string {
  return `${pad2(s.day)}/${pad2(s.month)} ${timeKey(s.time)}`;
}

function slotsLabel(slots: Iterable<NoticeSlot>): string {
  return [...slots].map(slotLabel).join(', ');
}

// ── Resolución ─────────────────────────────────────────────────────────────

/**
 * Aplica los avisos de la producción a sus funciones. Determinista y puro: el mismo
 * texto y las mismas funciones dan siempre los mismos estados y avisos.
 */
export function resolveNotices(
  sources: readonly NoticeSource[],
  slots: readonly NoticeSlot[],
): NoticeOutcome {
  const claims = new Map<number, StatusClaim[]>();
  const blocked = new Map<number, StatusClaim>();
  const warnings: string[] = [];
  const done = new Set<string>();

  for (const source of sources) {
    const scope = source.rowKeys ? [...source.rowKeys].sort().join(',') : '*';
    let clauses: string[];
    if (source.kind === 'name') {
      const { notices, ignored } = nameClauses(source.text);
      for (const name of ignored) {
        const id = `ignored|${name}`;
        if (done.has(id)) continue;
        done.add(id);
        warnings.push(
          `palabra de estado dentro del nombre (${source.label}), no se toma como aviso: '${name}'`,
        );
      }
      clauses = notices;
    } else {
      clauses = freeClauses(source.text);
    }

    for (const clause of clauses) {
      const status = noticeStatus(clause);
      if (!status) continue;
      const id = `${clause}|${scope}`;
      if (done.has(id)) continue;
      done.add(id);
      if (status === 'rescheduled') {
        warnings.push(
          `aviso de reprogramación (${source.label}), no cambia el estado: '${clause}'`,
        );
        continue;
      }

      const { refs, times } = scanClause(clause);
      const byTime = (list: readonly NoticeSlot[]): NoticeSlot[] =>
        times.length === 0
          ? [...list]
          : list.filter((s) => times.some((t) => timeKey(t) === timeKey(s.time)));
      const assigned = new Map<number, NoticeSlot>();
      const ambiguous = new Map<number, NoticeSlot>();
      const unmatched: string[] = [];

      if (refs.length === 0) {
        if (source.rowKeys) {
          const keys = new Set(source.rowKeys);
          const rows = byTime(slots.filter((s) => keys.has(s.key)));
          for (const s of rows) assigned.set(s.id, s);
          if (rows.length === 0) unmatched.push('fila del listado');
        } else {
          for (const s of byTime(slots)) ambiguous.set(s.id, s);
        }
      } else {
        for (const ref of refs) {
          const m = matchRef(ref, slots);
          const a = byTime(m.assigned);
          const amb = byTime(m.ambiguous);
          for (const s of a) assigned.set(s.id, s);
          for (const s of amb) ambiguous.set(s.id, s);
          if (a.length === 0 && amb.length === 0) unmatched.push(refLabel(ref));
        }
      }
      for (const id of assigned.keys()) ambiguous.delete(id);

      const claim: StatusClaim = { status, reason: clause };
      if (assigned.size > 0) {
        for (const id of assigned.keys()) claims.set(id, [...(claims.get(id) ?? []), claim]);
        warnings.push(
          `aviso '${status}' (${source.label}) asignado a ${slotsLabel(assigned.values())}: '${clause}'`,
        );
      }
      if (ambiguous.size > 0 || (refs.length === 0 && !source.rowKeys)) {
        if (status === 'sold_out') {
          warnings.push(
            `aviso '${status}' (${source.label}) sin fecha asignable, no se aplica a ninguna función: '${clause}'`,
          );
        } else {
          for (const id of ambiguous.keys()) {
            blocked.set(id, strongestClaim([blocked.get(id), claim]) ?? claim);
          }
          warnings.push(
            ambiguous.size > 0
              ? `aviso '${status}' (${source.label}) sin fecha asignable: no se emiten las funciones que podría alcanzar (${slotsLabel(ambiguous.values())}): '${clause}'`
              : `aviso '${status}' (${source.label}) sin fecha asignable y sin funciones que pueda alcanzar: '${clause}'`,
          );
        }
      }
      if (unmatched.length > 0) {
        warnings.push(
          `aviso '${status}' (${source.label}) nombra fechas sin función publicada (${unmatched.join(', ')}): '${clause}'`,
        );
      }
    }
  }
  return { claims, blocked, warnings };
}
