import type { Occurrence } from '@/api/types';
import { isUpcomingChange } from './planChanges';

const now = Date.parse('2026-10-15T12:00:00-03:00');
const occ = (status: Occurrence['status'], startsAt: string): Occurrence =>
  ({ status, startsAt, endsAt: null }) as Occurrence;

describe('isUpcomingChange', () => {
  it('avisa cancelaciones, postergaciones y reprogramaciones futuras', () => {
    expect(isUpcomingChange(occ('cancelled', '2026-10-16T20:00:00-03:00'), now)).toBe(true);
    expect(isUpcomingChange(occ('postponed', '2026-10-16T20:00:00-03:00'), now)).toBe(true);
    expect(isUpcomingChange(occ('rescheduled', '2026-10-16T20:00:00-03:00'), now)).toBe(true);
  });

  it('no avisa funciones normales, agotadas ni pasadas', () => {
    expect(isUpcomingChange(occ('scheduled', '2026-10-16T20:00:00-03:00'), now)).toBe(false);
    expect(isUpcomingChange(occ('sold_out', '2026-10-16T20:00:00-03:00'), now)).toBe(false);
    expect(isUpcomingChange(occ('cancelled', '2026-10-14T20:00:00-03:00'), now)).toBe(false);
  });
});
