import { DateTime } from 'luxon';
import { BA_TZ } from '../constants/tz';
import {
  allDayBounds,
  baDateTime,
  deviceZoneDiffersFromBa,
  formatBaDateLong,
  formatBaDateRange,
  formatBaDateShort,
  formatBaDateTimeShort,
  formatBaTime,
  localDateOf,
  rangeBounds,
  toIsoInstant,
} from './ba';

const ref = DateTime.fromISO('2026-10-14T12:00:00', { zone: BA_TZ });

describe('baDateTime / toIsoInstant', () => {
  it('builds a Buenos Aires instant (UTC-3, no DST)', () => {
    const dt = baDateTime({ year: 2026, month: 10, day: 18 }, { hour: 20, minute: 0 });
    expect(toIsoInstant(dt)).toBe('2026-10-18T20:00:00-03:00');
    expect(dt.toUTC().toISO()).toBe('2026-10-18T23:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(() => baDateTime({ year: 2026, month: 2, day: 30 })).toThrow();
  });
});

describe('localDateOf', () => {
  it('keeps the local date for a 22:00 show even though UTC is the next day', () => {
    // 22:00 -03:00 = 01:00Z next day
    expect(localDateOf('2026-10-18T22:00:00-03:00')).toBe('2026-10-18');
    expect(localDateOf('2026-10-19T01:00:00Z')).toBe('2026-10-18');
  });

  it('accepts Date, millis and DateTime', () => {
    const d = new Date('2026-10-19T01:00:00Z');
    expect(localDateOf(d)).toBe('2026-10-18');
    expect(localDateOf(d.getTime())).toBe('2026-10-18');
    expect(localDateOf(DateTime.fromJSDate(d))).toBe('2026-10-18');
  });
});

describe('allDayBounds / rangeBounds', () => {
  it('spans the whole local day', () => {
    expect(allDayBounds('2026-10-18')).toEqual({
      startsAt: '2026-10-18T00:00:00-03:00',
      endsAt: '2026-10-18T23:59:59-03:00',
    });
  });

  it('spans an exhibition range', () => {
    expect(rangeBounds('2026-10-16', '2026-12-13')).toEqual({
      startsAt: '2026-10-16T00:00:00-03:00',
      endsAt: '2026-12-13T23:59:59-03:00',
    });
  });

  it('rejects inverted ranges', () => {
    expect(() => rangeBounds('2026-12-13', '2026-10-16')).toThrow();
  });
});

describe('formatting (no Intl)', () => {
  const show = '2026-10-18T20:00:00-03:00'; // domingo 18 de octubre de 2026

  it('formats time, short and long dates', () => {
    expect(formatBaTime(show)).toBe('20:00');
    expect(formatBaDateShort(show, ref)).toBe('dom 18 oct');
    expect(formatBaDateLong(show)).toBe('domingo 18 de octubre de 2026');
    expect(formatBaDateTimeShort(show, ref)).toBe('dom 18 oct · 20:00');
  });

  it('adds the year when it differs from the reference year', () => {
    expect(formatBaDateShort('2027-02-01T20:00:00-03:00', ref)).toBe('lun 1 feb 2027');
  });

  it('formats ranges', () => {
    expect(formatBaDateRange('2026-10-16', '2026-12-13', ref)).toBe('Del 16 oct al 13 dic');
    expect(formatBaDateRange('2026-10-09', '2027-02-01', ref)).toBe('Del 9 oct 2026 al 1 feb 2027');
    expect(formatBaDateRange('2026-10-16', '2026-10-16', ref)).toBe('16 oct');
  });

  it('formats a UTC instant in Buenos Aires time', () => {
    expect(formatBaTime('2026-10-18T23:00:00Z')).toBe('20:00');
  });
});

describe('deviceZoneDiffersFromBa', () => {
  it('detects other zones and tolerates undefined', () => {
    expect(deviceZoneDiffersFromBa(undefined)).toBe(false);
    expect(deviceZoneDiffersFromBa(BA_TZ)).toBe(false);
    expect(deviceZoneDiffersFromBa('Europe/Madrid')).toBe(true);
  });
});
