import { DateTime } from 'luxon';
import { BA_TZ } from '../constants/tz';
import {
  detectFreeEs,
  detectStatusEs,
  inferYear,
  parseDateEs,
  parseDateRangeEs,
  parseDateTimeEs,
  parseTimeEs,
} from './es';

// Referencia: miércoles 14 de octubre de 2026, mediodía en Buenos Aires.
const now = DateTime.fromISO('2026-10-14T12:00:00', { zone: BA_TZ });
const opts = { now };

describe('parseTimeEs', () => {
  it.each([
    ['20:00', { hour: 20, minute: 0 }],
    ['20.30', { hour: 20, minute: 30 }],
    ['20:30 h', { hour: 20, minute: 30 }],
    ['20 hs', { hour: 20, minute: 0 }],
    ['20hs', { hour: 20, minute: 0 }],
    ['a las 20', { hour: 20, minute: 0 }],
    ['a las 19.30', { hour: 19, minute: 30 }],
    ['Horario: 14:00', { hour: 14, minute: 0 }],
    ['mediodía', { hour: 12, minute: 0 }],
    ['Al mediodia', { hour: 12, minute: 0 }],
    ['medianoche', { hour: 0, minute: 0 }],
    ['Sala Principal, 20 h', { hour: 20, minute: 0 }],
  ])('%s', (text, expected) => {
    expect(parseTimeEs(text)).toEqual(expected);
  });

  it('ignores bare numbers that are not times', () => {
    expect(parseTimeEs('Sala 2')).toBeNull();
    expect(parseTimeEs('Función 18')).toBeNull();
    expect(parseTimeEs('')).toBeNull();
  });

  it('rejects impossible times', () => {
    expect(parseTimeEs('25:00')).toBeNull();
    expect(parseTimeEs('20:75')).toBeNull();
  });
});

describe('inferYear', () => {
  it('uses the current year for upcoming dates', () => {
    expect(inferYear(10, 18, opts)).toBe(2026);
    expect(inferYear(12, 31, opts)).toBe(2026);
  });

  it('uses the current year for dates up to 60 days back', () => {
    expect(inferYear(9, 1, opts)).toBe(2026);
  });

  it('rolls over to next year for dates further in the past', () => {
    expect(inferYear(2, 1, opts)).toBe(2027);
    expect(inferYear(7, 1, opts)).toBe(2027);
  });

  it('returns null for impossible dates', () => {
    expect(inferYear(2, 30, opts)).toBeNull();
  });
});

describe('parseDateEs', () => {
  it.each([
    ['Sábado 18 de octubre de 2026', { year: 2026, month: 10, day: 18 }],
    ['sáb 18 oct', { year: 2026, month: 10, day: 18 }],
    ['sáb. 18 oct.', { year: 2026, month: 10, day: 18 }],
    ['18 de octubre', { year: 2026, month: 10, day: 18 }],
    ['Dom 5 oct', { year: 2026, month: 10, day: 5 }],
    ['18/10/2026', { year: 2026, month: 10, day: 18 }],
    ['18/10/26', { year: 2026, month: 10, day: 18 }],
    ['18-10-2026', { year: 2026, month: 10, day: 18 }],
    ['18/10', { year: 2026, month: 10, day: 18 }],
    ['1 de febrero', { year: 2027, month: 2, day: 1 }],
    ['Miércoles 14 de octubre de 2026, 20:00', { year: 2026, month: 10, day: 14 }],
    ['23 oct. 2026, 18:00', { year: 2026, month: 10, day: 23 }],
    ['5 de setiembre', { year: 2026, month: 9, day: 5 }],
  ])('%s', (text, expected) => {
    expect(parseDateEs(text, opts)).toEqual(expected);
  });

  it('returns null when there is no date', () => {
    expect(parseDateEs('Sala Principal', opts)).toBeNull();
    expect(parseDateEs('a las 20 hs', opts)).toBeNull();
  });

  it('returns null for impossible dates', () => {
    expect(parseDateEs('30 de febrero', opts)).toBeNull();
    expect(parseDateEs('32/10/2026', opts)).toBeNull();
  });
});

describe('parseDateRangeEs', () => {
  it('parses same-month ranges', () => {
    expect(parseDateRangeEs('del 12 al 30 de octubre', opts)).toEqual({
      start: { year: 2026, month: 10, day: 12 },
      end: { year: 2026, month: 10, day: 30 },
    });
    expect(parseDateRangeEs('16–18 oct. 2026', opts)).toEqual({
      start: { year: 2026, month: 10, day: 16 },
      end: { year: 2026, month: 10, day: 18 },
    });
    expect(parseDateRangeEs('16 al 18 de octubre de 2026', opts)).toEqual({
      start: { year: 2026, month: 10, day: 16 },
      end: { year: 2026, month: 10, day: 18 },
    });
  });

  it('parses cross-month ranges and infers year rollover', () => {
    expect(parseDateRangeEs('del 9 de octubre al 1 de febrero', opts)).toEqual({
      start: { year: 2026, month: 10, day: 9 },
      end: { year: 2027, month: 2, day: 1 },
    });
    expect(parseDateRangeEs('16 oct – 13 dic 2026', opts)).toEqual({
      start: { year: 2026, month: 10, day: 16 },
      end: { year: 2026, month: 12, day: 13 },
    });
    expect(parseDateRangeEs('Del 16 de octubre al 13 de diciembre de 2026', opts)).toEqual({
      start: { year: 2026, month: 10, day: 16 },
      end: { year: 2026, month: 12, day: 13 },
    });
  });

  it('parses "hasta el" as today → date', () => {
    expect(parseDateRangeEs('Hasta el 13 de diciembre', opts)).toEqual({
      start: { year: 2026, month: 10, day: 14 },
      end: { year: 2026, month: 12, day: 13 },
    });
  });

  it('returns null without a range', () => {
    expect(parseDateRangeEs('18 de octubre', opts)).toBeNull();
    expect(parseDateRangeEs('Martes a domingos de 11 a 20 h', opts)).toBeNull();
  });
});

describe('parseDateTimeEs', () => {
  it('extracts date and time together', () => {
    expect(parseDateTimeEs('Sábado 18 de octubre de 2026, 20:00', opts)).toEqual({
      date: { year: 2026, month: 10, day: 18 },
      time: { hour: 20, minute: 0 },
    });
    expect(parseDateTimeEs('Vie 16 oct · 20 hs', opts)).toEqual({
      date: { year: 2026, month: 10, day: 16 },
      time: { hour: 20, minute: 0 },
    });
  });

  it('does not confuse the day number with a time', () => {
    expect(parseDateTimeEs('18 de octubre', opts)).toEqual({
      date: { year: 2026, month: 10, day: 18 },
      time: null,
    });
  });
});

describe('detectStatusEs / detectFreeEs', () => {
  it('detects status words', () => {
    expect(detectStatusEs('Función CANCELADA')).toBe('cancelled');
    expect(detectStatusEs('Suspendido por lluvia')).toBe('cancelled');
    expect(detectStatusEs('Postergada hasta nuevo aviso')).toBe('postponed');
    expect(detectStatusEs('Reprogramado para el 20')).toBe('rescheduled');
    expect(detectStatusEs('Localidades agotadas')).toBe('sold_out');
    expect(detectStatusEs('SOLD OUT')).toBe('sold_out');
    expect(detectStatusEs('Concierto de gala')).toBeNull();
  });

  it('detects explicit free admission only', () => {
    expect(detectFreeEs('Entrada libre y gratuita')).toBe(true);
    expect(detectFreeEs('Actividad gratuita')).toBe(true);
    expect(detectFreeEs('Sin cargo')).toBe(true);
    expect(detectFreeEs('Entradas desde $12.000')).toBeUndefined();
    expect(detectFreeEs('')).toBeUndefined();
  });
});
