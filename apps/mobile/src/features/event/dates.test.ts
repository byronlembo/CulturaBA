import type { Occurrence } from '@/api/types';
import { groupDates, weekdaysText } from './dates';

const now = Date.parse('2026-10-17T12:00:00-03:00');
let n = 0;
const timed = (startsAt: string, o: Partial<Occurrence> = {}): Occurrence =>
  ({
    id: `o${n++}`,
    kind: 'timed',
    status: 'scheduled',
    startsAt,
    endsAt: null,
    startDate: startsAt.slice(0, 10),
    endDate: startsAt.slice(0, 10),
    scheduleText: null,
    priceText: null,
    priceVerified: false,
    room: null,
    venueName: 'ArtHaus',
    ...o,
  }) as Occurrence;
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

describe('groupDates', () => {
  it('junta funciones diarias a la misma hora en un grupo', () => {
    const occ = Array.from({ length: 10 }, (_, i) => timed(`${day(18 + i)}T13:00:00-03:00`));
    const items = groupDates(occ, now);
    expect(items).toHaveLength(1);
    const g = items[0];
    expect(g?.kind).toBe('group');
    if (g?.kind !== 'group') return;
    expect([g.startDate, g.endDate, g.time, g.items.length]).toEqual([
      day(18),
      day(27),
      '13:00',
      10,
    ]);
    expect(weekdaysText(g.weekdays)).toBe('todos los días');
  });

  it('separa por hora: jueves a sábado 20:00 y domingos 18:00', () => {
    // 22–24 y 29–31 oct son jue a sáb; 25 oct y 1 nov, domingos.
    const occ = [
      ...[22, 23, 24, 29, 30, 31].map((d) => timed(`${day(d)}T20:00:00-03:00`)),
      timed(`${day(25)}T18:00:00-03:00`),
      timed('2026-11-01T18:00:00-03:00'),
      timed('2026-11-08T18:00:00-03:00'),
    ];
    const groups = groupDates(occ, now).filter((i) => i.kind === 'group');
    expect(
      groups.map((g) => (g.kind === 'group' ? [g.time, weekdaysText(g.weekdays)] : null)),
    ).toEqual([
      ['20:00', 'jue a sáb'],
      ['18:00', 'dom'],
    ]);
  });

  it('deja sueltas las canceladas, las pocas y saca las pasadas', () => {
    const occ = [
      timed(`${day(10)}T20:00:00-03:00`), // pasada
      timed(`${day(18)}T20:00:00-03:00`),
      timed(`${day(19)}T20:00:00-03:00`, { status: 'cancelled' }),
      timed(`${day(20)}T20:00:00-03:00`),
    ];
    const items = groupDates(occ, now);
    expect(items.map((i) => i.kind)).toEqual(['single', 'single', 'single']);
    expect(items.map((i) => (i.kind === 'single' ? i.occurrence.startDate : ''))).toEqual([
      day(18),
      day(19),
      day(20),
    ]);
  });

  it('une los tramos de una muestra y cuenta sus días de la semana', () => {
    const range = (from: string, to: string) =>
      timed(`${from}T00:00:00-03:00`, {
        kind: 'range',
        startDate: from,
        endDate: to,
        endsAt: `${to}T23:59:59-03:00`,
      });
    // vie–sáb, lun–sáb, lun–mar
    const items = groupDates(
      [range(day(16), day(17)), range(day(19), day(24)), range('2026-11-09', '2026-11-10')],
      now,
    );
    const g = items[0];
    expect(items).toHaveLength(1);
    if (g?.kind !== 'group') throw new Error('se esperaba un grupo');
    expect([g.startDate, g.endDate, g.time]).toEqual([day(16), '2026-11-10', null]);
    expect(weekdaysText(g.weekdays)).toBe('lun a sáb');
  });
});

describe('weekdaysText', () => {
  it('nombra rachas y listas', () => {
    expect(weekdaysText([2, 3, 4, 5, 6, 7])).toBe('mar a dom');
    expect(weekdaysText([5, 6])).toBe('vie y sáb');
    expect(weekdaysText([4, 6, 7])).toBe('jue, sáb y dom');
    expect(weekdaysText([1, 3, 4, 5, 7])).toBe('lun, mié a vie y dom');
    expect(weekdaysText([7])).toBe('dom');
  });
});
