import { BA_TZ, toBa, WEEKDAYS_ES_SHORT } from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { Occurrence } from '@/api/types';
import { formatBaTime } from '@/lib/dates';

/** Una fecha suelta o varias del mismo tipo (misma sala, hora, horario y precio) juntas. */
export type DateItem =
  | { kind: 'single'; occurrence: Occurrence }
  | {
      kind: 'group';
      items: Occurrence[];
      startDate: string;
      endDate: string;
      /** Hora local común ("20:00") si son funciones con hora. */
      time: string | null;
      /** Días de la semana que cubren (1 = lun … 7 = dom), ordenados. */
      weekdays: number[];
    };

/** Desde cuántas fechas iguales se muestran como un grupo. */
export const MIN_GROUP = 3;

function weekdaysOf(o: Occurrence): number[] {
  if (o.kind !== 'range') return [toBa(o.startsAt).weekday];
  const days = new Set<number>();
  const end = DateTime.fromISO(o.endDate, { zone: BA_TZ });
  let d = DateTime.fromISO(o.startDate, { zone: BA_TZ });
  for (let i = 0; i < 7 && d <= end; i++, d = d.plus({ days: 1 })) days.add(d.weekday);
  return [...days];
}

// Las que tienen marca (cancelada, reprogramada…) nunca se agrupan: se tienen que ver.
function groupKey(o: Occurrence): string | null {
  if (o.status !== 'scheduled') return null;
  return [
    o.kind,
    o.venueName ?? '',
    o.room ?? '',
    o.kind === 'timed' ? formatBaTime(o.startsAt) : '',
    o.scheduleText ?? '',
    o.priceVerified ? (o.priceText ?? '') : '',
  ].join('|');
}

/**
 * Fechas próximas de un evento, con las repetidas juntas: 75 funciones diarias a las 13:00
 * son un grupo; las 20:00 de jueves a sábado y las 18:00 del domingo, dos. Las pasadas no
 * se listan (para anotarlas está "Fui").
 */
export function groupDates(occurrences: Occurrence[], now = Date.now()): DateItem[] {
  const upcoming = occurrences
    .filter((o) => Date.parse(o.endsAt ?? o.startsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const items: DateItem[] = [];
  const byKey = new Map<string, Occurrence[]>();
  for (const o of upcoming) {
    const key = groupKey(o);
    if (key === null) items.push({ kind: 'single', occurrence: o });
    else byKey.set(key, [...(byKey.get(key) ?? []), o]);
  }
  for (const list of byKey.values()) {
    if (list.length < MIN_GROUP) {
      for (const o of list) items.push({ kind: 'single', occurrence: o });
      continue;
    }
    const first = list[0] as Occurrence;
    items.push({
      kind: 'group',
      items: list,
      startDate: first.startDate,
      endDate: list.reduce((max, o) => (o.endDate > max ? o.endDate : max), first.endDate),
      time: first.kind === 'timed' ? formatBaTime(first.startsAt) : null,
      weekdays: [...new Set(list.flatMap(weekdaysOf))].sort((a, b) => a - b),
    });
  }
  const start = (i: DateItem) =>
    Date.parse(i.kind === 'single' ? i.occurrence.startsAt : (i.items[0]?.startsAt ?? ''));
  return items.sort((a, b) => start(a) - start(b));
}

/** "todos los días", "mar a dom", "vie y sáb", "lun, mié a vie y dom". */
export function weekdaysText(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'todos los días';
  const name = (d: number) => WEEKDAYS_ES_SHORT[d - 1] ?? '';
  const runs: number[][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d === (last[last.length - 1] ?? 0) + 1) last.push(d);
    else runs.push([d]);
  }
  const parts = runs.flatMap((r) =>
    r.length >= 3 ? [`${name(r[0] ?? 0)} a ${name(r[r.length - 1] ?? 0)}`] : r.map(name),
  );
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}
