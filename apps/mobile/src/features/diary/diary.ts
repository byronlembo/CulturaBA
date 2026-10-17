import { toBa } from '@culturaba/shared';
import type { DiaryEntry, Occurrence } from '@/api/types';
import { POINTS_WINDOW_DAYS } from '@/features/points/points';
import { formatBaDateShort, formatBaDateTimeShort } from '@/lib/dates';

export interface DiaryDateOption {
  date: string;
  occurrenceId: string;
  label: string;
  /** Suma puntos al anotarla: empezó hace 7 días o menos (o es una muestra abierta hoy). */
  points: boolean;
}

/**
 * Fechas que se pueden anotar: funciones que ya empezaron y, para muestras en curso,
 * hoy. Una por fecha (el diario guarda una entrada por evento y día), las más recientes primero.
 */
export function diaryDateOptions(occurrences: Occurrence[], now = Date.now()): DiaryDateOption[] {
  const today = toBa(now).toISODate() ?? '';
  const options: DiaryDateOption[] = [];
  for (const o of occurrences) {
    if (o.status === 'cancelled') continue;
    if (o.kind === 'range') {
      if (o.startDate <= today && today <= o.endDate)
        options.push({ date: today, occurrenceId: o.id, label: 'Hoy', points: true });
    } else if (Date.parse(o.startsAt) <= now) {
      options.push({
        date: o.startDate,
        occurrenceId: o.id,
        label:
          o.kind === 'timed' ? formatBaDateTimeShort(o.startsAt) : formatBaDateShort(o.startsAt),
        points: Date.parse(o.startsAt) >= now - POINTS_WINDOW_DAYS * 86_400_000,
      });
    }
  }
  const seen = new Set<string>();
  return options
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((o) => !seen.has(o.date) && seen.add(o.date))
    .slice(0, 6);
}

export interface DiaryStats {
  total: number;
  thisYear: number;
  averageRating: number | null;
  topDisciplines: { slug: string; count: number }[];
}

export function diaryStats(entries: DiaryEntry[], year: number): DiaryStats {
  const rated = entries.filter((e) => e.rating !== null);
  const byDiscipline = new Map<string, number>();
  for (const e of entries)
    if (e.discipline) byDiscipline.set(e.discipline, (byDiscipline.get(e.discipline) ?? 0) + 1);
  return {
    total: entries.length,
    thisYear: entries.filter((e) => e.attendedOn.startsWith(`${year}-`)).length,
    averageRating: rated.length
      ? Math.round((rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length) * 10) / 10
      : null,
    topDisciplines: [...byDiscipline]
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
      .slice(0, 3),
  };
}
