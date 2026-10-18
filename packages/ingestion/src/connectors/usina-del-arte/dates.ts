import {
  type LocalDateParts,
  type LocalTimeParts,
  partsToLocalDate,
  stripDiacriticsLower,
} from '@culturaba/shared';

/**
 * Fechas y horas tal como las publica usinadelarte.ar (ver docs/research/usina-del-arte.md):
 *
 *  · Detalle /actividad/<slug>/ → `.function-items .function-item`, UNA fila por función con
 *    su fecha y su hora ya emparejadas: `.date` "25/10/2026", `.time` "18 h", "11.30 h",
 *    "12:45 h", "de 16 a 20 h" (franja), `.notes` ("Con reserva") y `a.button_entradas`.
 *  · REST /wp-json/wp/v2/actividad → términos `funcion-fecha` ("25/10/2026", "19/06" sin año,
 *    "05/4/2026") y `funcion-hora` ("18 h", "11:30", "14 a 18:30 h", "18", "undefined").
 *    Son CONJUNTOS por actividad: no dicen qué hora va con qué fecha.
 *
 * REGLA DE EMPAREJAMIENTO (fecha ↔ hora)
 *  1. Si el detalle trae filas `.function-item`, son la lista autoritativa: cada fila es una
 *     función con SU hora. Hora legible → `timed` (con `endsAt` si es franja "de 16 a 20 h").
 *     Fila sin hora o con un texto que no es una hora → fecha sin hora (ver 3).
 *     Las taxonomías solo se comparan (avisos si no coinciden); nunca agregan funciones.
 *  2. Sin filas en el detalle (respaldo, p. ej. cambio de plantilla): taxonomías, y se
 *     combinan SOLO cuando no hay ambigüedad:
 *       · una sola hora → esa hora para todas las fechas;
 *       · una sola fecha → una función por cada hora en esa fecha;
 *       · varias fechas y varias horas → no se emparejan: cada fecha queda sin hora (aviso).
 *  3. Fecha sin hora → ocurrencia `range` de un solo día (00:00–23:59:59, como las muestras),
 *     con `scheduleText` = texto literal de la hora si lo hubo. No se usa `all_day`: la app lo
 *     muestra como "todo el día", algo que el sitio no dice.
 */

export interface TimeSpec {
  start: LocalTimeParts;
  /** Fin de la franja ("de 16 a 20 h"); null si es una hora de inicio. */
  end: LocalTimeParts | null;
}

function cleanup(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const PART = '(\\d{1,2})(?:[:.](\\d{2}))?';
const UNIT = '(?:\\s*(?:h|hs|horas?)\\.?)?';
/** "18 h", "11.30 h", "12:45 h", "18", "a las 20 hs" (texto completo de la celda). */
const SINGLE_RE = new RegExp(`^(?:a las\\s+)?${PART}${UNIT}$`);
/** "de 16 a 20 h", "14 a 18:30 h", "de 14 h a 19 h", "16-20 h". */
const WINDOW_RE = new RegExp(`^(?:de\\s+)?${PART}${UNIT}\\s*(?:a|-)\\s*${PART}${UNIT}$`);

function timeOf(h: string | undefined, m: string | undefined): LocalTimeParts | null {
  const hour = Number(h);
  const minute = m === undefined ? 0 : Number(m);
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Celda `.time` (o término `funcion-hora`) → hora de inicio y, si es franja, fin.
 * La celda es un campo de HORA: un número suelto ("18") es la hora 18:00. Cualquier
 * otro texto ("a confirmar", "14:00:30", "undefined") → null: no se adivina.
 */
export function parseTimeCell(text: string | null | undefined): TimeSpec | null {
  const t = cleanup(text ?? '');
  if (!t) return null;
  const w = WINDOW_RE.exec(t);
  if (w) {
    const start = timeOf(w[1], w[2]);
    const end = timeOf(w[3], w[4]);
    // Franja que cruza la medianoche o al revés: no se interpreta.
    if (!start || !end || end.hour * 60 + end.minute <= start.hour * 60 + start.minute) return null;
    return { start, end };
  }
  const s = SINGLE_RE.exec(t);
  if (s) {
    const start = timeOf(s[1], s[2]);
    return start ? { start, end: null } : null;
  }
  return null;
}

/**
 * Celda `.date` (o término `funcion-fecha`) → fecha. "25/10/2026" y "05/4/2026"; con año
 * de dos cifras ("25/10/26") se usa 2000 + aa, igual que el propio script del sitio que
 * reescribe la fecha en el navegador. Sin año ("19/06") o inválida → null.
 */
export function parseDateCell(text: string | null | undefined): LocalDateParts | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec((text ?? '').replace(/\s+/g, ''));
  if (!m) return null;
  const yy = Number(m[3]);
  const parts = { year: yy < 100 ? 2000 + yy : yy, month: Number(m[2]), day: Number(m[1]) };
  try {
    partsToLocalDate(parts);
  } catch {
    return null;
  }
  return parts;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "18:00" */
export function timeKey(time: LocalTimeParts): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

/** Una función tal como aparece en el detalle. */
export interface FunctionRow {
  /** `.date` literal. */
  dateText: string;
  /** `.time` literal (puede venir vacío). */
  timeText: string;
  /** `.notes` literal (p. ej. "Con reserva"). */
  notes: string;
  ticketsUrl: string | null;
}

export interface ScheduleSpec {
  /** YYYY-MM-DD local. */
  date: string;
  time: TimeSpec | null;
  /** Texto literal de la hora ("de 16 a 20 h", "a confirmar"); null si no hubo. */
  timeText: string | null;
  sourceText: string;
  notes: string;
  ticketsUrl: string | null;
}

export interface ScheduleResult {
  specs: ScheduleSpec[];
  /** De dónde salieron las funciones. */
  basis: 'detail' | 'taxonomy' | 'none';
  warnings: string[];
}

export interface ScheduleInput {
  rows: readonly FunctionRow[];
  /** Nombres de los términos `funcion-fecha` de la actividad. */
  fechaTerms: readonly string[];
  /** Nombres de los términos `funcion-hora` de la actividad. */
  horaTerms: readonly string[];
}

function localDate(parts: LocalDateParts): string {
  return partsToLocalDate(parts);
}

/** Aplica la regla de emparejamiento descrita arriba. Pura y determinista. */
export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const warnings: string[] = [];

  const termDates = new Map<string, string>();
  for (const name of input.fechaTerms) {
    const parts = parseDateCell(name);
    if (parts) termDates.set(localDate(parts), name);
    else warnings.push(`término funcion-fecha ilegible (sin año o inválido): '${name}'`);
  }
  const termHours = new Map<string, { name: string; time: TimeSpec }>();
  for (const name of input.horaTerms) {
    const time = parseTimeCell(name);
    if (time) termHours.set(timeKey(time.start), { name, time });
    else warnings.push(`término funcion-hora ilegible: '${name}'`);
  }

  // 1. Detalle: filas fecha+hora ya emparejadas por el sitio.
  if (input.rows.length > 0) {
    const specs: ScheduleSpec[] = [];
    for (const row of input.rows) {
      const parts = parseDateCell(row.dateText);
      if (!parts) {
        warnings.push(`función con fecha ilegible, se omite: '${row.dateText}'`);
        continue;
      }
      const time = parseTimeCell(row.timeText);
      const timeText = row.timeText.trim();
      if (!time) {
        warnings.push(
          timeText
            ? `función sin hora legible ('${timeText}'): se publica solo la fecha ${row.dateText}`
            : `función sin hora publicada: se publica solo la fecha ${row.dateText}`,
        );
      }
      specs.push({
        date: localDate(parts),
        time,
        timeText: timeText || null,
        sourceText: [row.dateText.trim(), timeText].filter(Boolean).join(' '),
        notes: row.notes.trim(),
        ticketsUrl: row.ticketsUrl,
      });
    }
    const detailDates = new Set(specs.map((s) => s.date));
    const notInDetail = [...termDates.keys()].filter((d) => !detailDates.has(d));
    if (termDates.size > 0 && notInDetail.length > 0) {
      warnings.push(
        `fechas de la taxonomía que el detalle no lista (no se emiten): ${notInDetail.join(', ')}`,
      );
    }
    const notInTaxonomy = [...detailDates].filter((d) => !termDates.has(d));
    if (termDates.size > 0 && notInTaxonomy.length > 0) {
      warnings.push(`fechas del detalle sin término funcion-fecha: ${notInTaxonomy.join(', ')}`);
    }
    const detailHours = new Set(specs.flatMap((s) => (s.time ? [timeKey(s.time.start)] : [])));
    const hoursNotInDetail = [...termHours.values()].filter(
      (h) => !detailHours.has(timeKey(h.time.start)),
    );
    if (hoursNotInDetail.length > 0) {
      warnings.push(
        `horas de la taxonomía que el detalle no lista: ${hoursNotInDetail.map((h) => `'${h.name}'`).join(', ')}`,
      );
    }
    return { specs, basis: 'detail', warnings };
  }

  // 2. Respaldo: taxonomías, solo si el emparejamiento no es ambiguo.
  if (termDates.size === 0) {
    warnings.push('sin funciones en el detalle ni fechas legibles en la taxonomía');
    return { specs: [], basis: 'none', warnings };
  }
  warnings.push('detalle sin filas .function-item: funciones tomadas de la taxonomía');
  const dates = [...termDates.entries()].sort(([a], [b]) => a.localeCompare(b));
  const hours = [...termHours.values()].sort((a, b) =>
    timeKey(a.time.start).localeCompare(timeKey(b.time.start)),
  );
  const spec = (date: string, dateName: string, hour: { name: string; time: TimeSpec } | null) => ({
    date,
    time: hour?.time ?? null,
    timeText: hour?.name ?? null,
    sourceText: hour ? `${dateName} ${hour.name}` : dateName,
    notes: '',
    ticketsUrl: null,
  });
  const [onlyHour] = hours;
  const [onlyDate] = dates;
  if (hours.length === 1 && onlyHour) {
    return {
      specs: dates.map(([d, name]) => spec(d, name, onlyHour)),
      basis: 'taxonomy',
      warnings,
    };
  }
  if (dates.length === 1 && onlyDate && hours.length > 1) {
    const [d, name] = onlyDate;
    return { specs: hours.map((h) => spec(d, name, h)), basis: 'taxonomy', warnings };
  }
  if (hours.length > 1) {
    warnings.push(
      `${dates.length} fechas y ${hours.length} horas en la taxonomía sin emparejar: se publican solo las fechas`,
    );
  }
  return { specs: dates.map(([d, name]) => spec(d, name, null)), basis: 'taxonomy', warnings };
}
