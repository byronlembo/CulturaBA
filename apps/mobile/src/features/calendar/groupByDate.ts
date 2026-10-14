import {
  formatBaDateLong,
  localDateToParts,
  MONTHS_ES_SHORT,
  WEEKDAYS_ES_SHORT,
} from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { CalendarOccurrence } from '@/api/types';

export interface DayGroup {
  date: string;
  title: string;
  items: CalendarOccurrence[];
}

/**
 * Agrupa ocurrencias por día local dentro de [from, to]. Las de tipo `range`
 * (exposiciones) aparecen en cada día del rango dentro de la ventana, al final
 * del día, para no tapar los eventos con horario.
 */
export function groupByDate(
  items: CalendarOccurrence[],
  from: string,
  to: string,
  maxRangeDays = 31,
): DayGroup[] {
  const byDay = new Map<string, CalendarOccurrence[]>();
  const push = (date: string, o: CalendarOccurrence) => {
    if (date < from || date > to) return;
    const list = byDay.get(date) ?? [];
    list.push(o);
    byDay.set(date, list);
  };

  for (const o of items) {
    if (o.kind === 'range') {
      let d = DateTime.fromISO(o.startDate < from ? from : o.startDate);
      const end = DateTime.fromISO(o.endDate > to ? to : o.endDate);
      let n = 0;
      while (d <= end && n < maxRangeDays) {
        push(d.toISODate() ?? '', o);
        d = d.plus({ days: 1 });
        n += 1;
      }
    } else {
      push(o.startDate, o);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({
      date,
      title: dayTitle(date),
      items: list.sort((a, b) => {
        if (a.kind === 'range' && b.kind !== 'range') return 1;
        if (a.kind !== 'range' && b.kind === 'range') return -1;
        return a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0;
      }),
    }));
}

export function dayTitle(localDate: string, today?: string): string {
  const p = localDateToParts(localDate);
  const dt = DateTime.fromObject(p);
  const base = `${WEEKDAYS_ES_SHORT[dt.weekday - 1]} ${p.day} ${MONTHS_ES_SHORT[p.month - 1]}`;
  if (today && localDate === today) return `Hoy · ${base}`;
  return base;
}

export { formatBaDateLong };
