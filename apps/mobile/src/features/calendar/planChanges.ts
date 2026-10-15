import type { Occurrence } from '@/api/types';

/** Función próxima que cambió: se avisa en "Cambios en tus planes". */
export function isUpcomingChange(o: Occurrence, now = Date.now()): boolean {
  return (
    ['cancelled', 'postponed', 'rescheduled'].includes(o.status) &&
    Date.parse(o.endsAt ?? o.startsAt) >= now
  );
}
