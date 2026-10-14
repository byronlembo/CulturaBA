import type { CalendarOccurrence } from '@/api/types';
import { dayTitle, groupByDate } from './groupByDate';

function occ(partial: Partial<CalendarOccurrence>): CalendarOccurrence {
  return {
    id: 'o',
    eventId: 'e',
    kind: 'timed',
    startsAt: '2026-10-18T20:00:00-03:00',
    endsAt: null,
    startDate: '2026-10-18',
    endDate: '2026-10-18',
    isAllDay: false,
    scheduleText: null,
    status: 'scheduled',
    previousStartsAt: null,
    statusReason: null,
    ticketsUrl: null,
    priceText: null,
    priceVerified: false,
    isFree: null,
    room: null,
    venueName: null,
    venueAddress: null,
    eventSlug: 's',
    eventTitle: 'T',
    primaryDiscipline: 'cine',
    disciplines: ['cine'],
    imageUrl: null,
    imageSource: 'fallback',
    institutionName: 'I',
    ...partial,
  };
}

describe('groupByDate', () => {
  it('groups timed occurrences by local day in order and keeps ranges after timed items', () => {
    const items = [
      occ({ id: 'late', startsAt: '2026-10-18T22:00:00-03:00' }),
      occ({ id: 'early', startsAt: '2026-10-18T11:00:00-03:00' }),
      occ({
        id: 'expo',
        kind: 'range',
        startsAt: '2026-10-16T00:00:00-03:00',
        endsAt: '2026-10-19T23:59:59-03:00',
        startDate: '2026-10-16',
        endDate: '2026-10-19',
      }),
      occ({
        id: 'next',
        startsAt: '2026-10-19T20:00:00-03:00',
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      }),
    ];
    const groups = groupByDate(items, '2026-10-17', '2026-10-19');
    expect(groups.map((g) => g.date)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['expo']);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['early', 'late', 'expo']);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(['next', 'expo']);
  });

  it('ignores days outside the window', () => {
    const groups = groupByDate(
      [occ({ startDate: '2026-12-01', endDate: '2026-12-01' })],
      '2026-10-01',
      '2026-10-31',
    );
    expect(groups).toEqual([]);
  });

  it('formats day titles', () => {
    expect(dayTitle('2026-10-18')).toBe('dom 18 oct');
    expect(dayTitle('2026-10-18', '2026-10-18')).toBe('Hoy · dom 18 oct');
  });
});
