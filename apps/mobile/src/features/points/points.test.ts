import type { Occurrence } from '@/api/types';
import { checkInCandidate, pointsErrorMessage } from './points';

const now = Date.parse('2026-10-15T20:30:00-03:00');
const occ = (o: Partial<Occurrence>): Occurrence =>
  ({ kind: 'timed', status: 'scheduled', endsAt: null, venueLat: -34.6, ...o }) as Occurrence;

describe('checkInCandidate', () => {
  it('acepta de 1 h antes a 30 min después del fin (3 h si no hay fin)', () => {
    const at = (startsAt: string) =>
      checkInCandidate([occ({ id: 'a', startsAt })], now)?.id ?? null;
    expect(at('2026-10-15T21:30:00-03:00')).toBe('a');
    expect(at('2026-10-15T21:31:00-03:00')).toBeNull();
    expect(at('2026-10-15T17:00:00-03:00')).toBe('a');
    expect(at('2026-10-15T16:59:00-03:00')).toBeNull();
  });

  it('muestras el día que están abiertas; nunca canceladas ni sin ubicación', () => {
    const range = occ({ id: 'm', kind: 'range', startDate: '2026-10-01', endDate: '2026-10-15' });
    expect(checkInCandidate([range], now)?.id).toBe('m');
    expect(checkInCandidate([{ ...range, endDate: '2026-10-14' }], now)).toBeNull();
    expect(
      checkInCandidate(
        [occ({ id: 'c', status: 'cancelled', startsAt: '2026-10-15T20:00:00-03:00' })],
        now,
      ),
    ).toBeNull();
    expect(
      checkInCandidate(
        [occ({ id: 'v', venueLat: null, startsAt: '2026-10-15T20:00:00-03:00' })],
        now,
      ),
    ).toBeNull();
  });
});

it('traduce los errores de la base', () => {
  expect(pointsErrorMessage('too_far')).toBe(
    'Parece que no estás en la sala: el check-in funciona a menos de 300 m.',
  );
  expect(pointsErrorMessage('otro')).toBe('No se pudo completar: otro');
});
