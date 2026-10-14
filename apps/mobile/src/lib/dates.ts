import {
  BA_TZ,
  baNow,
  formatBaDateRange,
  formatBaDateShort,
  formatBaDateTimeShort,
  formatBaTime,
} from '@culturaba/shared';
import { DateTime } from 'luxon';

export { formatBaDateRange, formatBaDateShort, formatBaDateTimeShort, formatBaTime };

/** "hace 3 h", "hace 2 días", "recién". */
export function relativeTimeEs(iso: string | null | undefined, now: DateTime = baNow()): string {
  if (!iso) return '';
  const then = DateTime.fromISO(iso, { setZone: true });
  if (!then.isValid) return '';
  const minutes = Math.max(0, Math.round(now.diff(then, 'minutes').minutes));
  if (minutes < 2) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `hace ${months} mes${months === 1 ? '' : 'es'}`;
}

export interface OccurrenceLike {
  kind: 'timed' | 'all_day' | 'range';
  startsAt: string;
  endsAt: string | null;
  startDate: string;
  endDate: string;
  scheduleText: string | null;
}

/** Texto principal de cuándo: "dom 18 oct · 20:00", "lun 19 oct (todo el día)", "Del 16 oct al 13 dic". */
export function whenText(o: OccurrenceLike, reference: DateTime = baNow()): string {
  if (o.kind === 'range') return formatBaDateRange(o.startDate, o.endDate, reference);
  if (o.kind === 'all_day') return `${formatBaDateShort(o.startsAt, reference)} · todo el día`;
  return formatBaDateTimeShort(o.startsAt, reference);
}

/** Aviso cuando el dispositivo no está en hora de Buenos Aires. */
export function timezoneNote(deviceZone: string = DateTime.local().zoneName ?? ''): string | null {
  if (!deviceZone) return null;
  const now = DateTime.now();
  return now.setZone(deviceZone).offset === now.setZone(BA_TZ).offset
    ? null
    : 'Horarios en hora de Buenos Aires';
}

export function todayLocalDate(): string {
  return baNow().toISODate() ?? '';
}

export function plusDaysLocalDate(days: number): string {
  return baNow().plus({ days }).toISODate() ?? '';
}
