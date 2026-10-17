import type { DiaryEntry, Occurrence } from '@/api/types';
import { diaryDateOptions, diaryStats } from './diary';

const now = Date.parse('2026-10-15T12:00:00-03:00');
const occ = (o: Partial<Occurrence>): Occurrence =>
  ({ kind: 'timed', status: 'scheduled', endsAt: null, ...o }) as Occurrence;

describe('diaryDateOptions', () => {
  it('ofrece funciones ya empezadas y hoy para muestras en curso, sin repetir fecha', () => {
    const options = diaryDateOptions(
      [
        occ({ id: 'a', startsAt: '2026-10-11T20:00:00-03:00', startDate: '2026-10-11' }),
        occ({ id: 'b', startsAt: '2026-10-11T22:30:00-03:00', startDate: '2026-10-11' }),
        occ({ id: 'c', startsAt: '2026-10-14T20:00:00-03:00', startDate: '2026-10-14' }),
        occ({ id: 'd', startsAt: '2026-10-18T20:00:00-03:00', startDate: '2026-10-18' }),
        occ({
          id: 'x',
          status: 'cancelled',
          startsAt: '2026-10-13T20:00:00-03:00',
          startDate: '2026-10-13',
        }),
        occ({
          id: 'm',
          kind: 'range',
          startsAt: '2026-09-01T11:00:00-03:00',
          startDate: '2026-09-01',
          endDate: '2026-11-30',
        }),
      ],
      now,
    );
    expect(options.map((o) => [o.date, o.occurrenceId])).toEqual([
      ['2026-10-15', 'm'],
      ['2026-10-14', 'c'],
      ['2026-10-11', 'a'],
    ]);
    expect(options[1]?.label).toBe('mié 14 oct · 20:00');
    expect(options.map((o) => o.points)).toEqual([true, true, true]);
  });

  it('suma puntos solo hasta 7 días después de la función', () => {
    const options = diaryDateOptions(
      [
        occ({ id: 'a', startsAt: '2026-10-08T12:30:00-03:00', startDate: '2026-10-08' }),
        occ({ id: 'b', startsAt: '2026-10-08T11:30:00-03:00', startDate: '2026-10-07' }),
      ],
      now,
    );
    expect(options.map((o) => [o.occurrenceId, o.points])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('no ofrece nada para un evento que todavía no empezó', () => {
    expect(
      diaryDateOptions(
        [occ({ id: 'd', startsAt: '2026-10-18T20:00:00-03:00', startDate: '2026-10-18' })],
        now,
      ),
    ).toEqual([]);
  });
});

describe('diaryStats', () => {
  const entry = (attendedOn: string, rating: number | null, discipline: string | null) =>
    ({ attendedOn, rating, discipline }) as DiaryEntry;

  it('cuenta el año, promedia solo puntajes dados y ordena disciplinas', () => {
    expect(
      diaryStats(
        [
          entry('2026-10-11', 5, 'opera_clasica'),
          entry('2026-09-02', null, 'opera_clasica'),
          entry('2026-03-02', 4, 'danza'),
          entry('2025-12-30', 2, 'cine'),
        ],
        2026,
      ),
    ).toEqual({
      total: 4,
      thisYear: 3,
      averageRating: 3.7,
      topDisciplines: [
        { slug: 'opera_clasica', count: 2 },
        { slug: 'cine', count: 1 },
        { slug: 'danza', count: 1 },
      ],
    });
    expect(diaryStats([], 2026).averageRating).toBeNull();
  });
});
