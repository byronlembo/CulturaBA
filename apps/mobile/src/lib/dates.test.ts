import { DateTime } from 'luxon';
import { relativeTimeEs, whenText } from './dates';

const now = DateTime.fromISO('2026-10-14T15:00:00-03:00', { setZone: true });

describe('relativeTimeEs', () => {
  it('formats relative times in Spanish', () => {
    expect(relativeTimeEs('2026-10-14T14:59:30-03:00', now)).toBe('recién');
    expect(relativeTimeEs('2026-10-14T14:20:00-03:00', now)).toBe('hace 40 min');
    expect(relativeTimeEs('2026-10-14T12:00:00-03:00', now)).toBe('hace 3 h');
    expect(relativeTimeEs('2026-10-12T15:00:00-03:00', now)).toBe('hace 2 días');
    expect(relativeTimeEs('2026-10-13T15:00:00-03:00', now)).toBe('hace 1 día');
    expect(relativeTimeEs('2026-08-01T15:00:00-03:00', now)).toBe('hace 2 meses');
    expect(relativeTimeEs(null, now)).toBe('');
    expect(relativeTimeEs('garbage', now)).toBe('');
  });
});

describe('whenText', () => {
  const ref = DateTime.fromISO('2026-10-14T12:00:00-03:00', { setZone: true });
  it('describes timed, all-day and range occurrences', () => {
    expect(
      whenText(
        {
          kind: 'timed',
          startsAt: '2026-10-18T20:00:00-03:00',
          endsAt: null,
          startDate: '2026-10-18',
          endDate: '2026-10-18',
          scheduleText: null,
        },
        ref,
      ),
    ).toBe('dom 18 oct · 20:00');
    expect(
      whenText(
        {
          kind: 'all_day',
          startsAt: '2026-10-18T00:00:00-03:00',
          endsAt: '2026-10-18T23:59:59-03:00',
          startDate: '2026-10-18',
          endDate: '2026-10-18',
          scheduleText: null,
        },
        ref,
      ),
    ).toBe('dom 18 oct · todo el día');
    expect(
      whenText(
        {
          kind: 'range',
          startsAt: '2026-10-16T00:00:00-03:00',
          endsAt: '2026-12-13T23:59:59-03:00',
          startDate: '2026-10-16',
          endDate: '2026-12-13',
          scheduleText: 'Mar a dom 11–20',
        },
        ref,
      ),
    ).toBe('Del 16 oct al 13 dic');
  });
});
