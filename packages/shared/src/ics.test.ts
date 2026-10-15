import { buildIcs, type CalendarEntry, googleCalendarUrl } from './ics';

const base: CalendarEntry = {
  uid: 'occ-1',
  title: 'Les Contes d’Hoffmann',
  kind: 'timed',
  startsAt: '2026-10-16T20:00:00-03:00',
  endsAt: null,
  startDate: '2026-10-16',
  endDate: '2026-10-16',
  location: 'Teatro Colón · Sala principal, Cerrito 628',
  description: 'Ópera; en francés',
  url: 'https://culturaba.xn--lembodiseo-19a.com/event/hoffmann',
};
const stamp = new Date('2026-10-15T12:00:00Z');

describe('buildIcs', () => {
  it('función con hora: instante en UTC, dos avisos y texto escapado', () => {
    const ics = buildIcs(base, stamp);
    expect(ics).toContain('DTSTART:20261016T230000Z\r\n');
    expect(ics).not.toContain('DTEND');
    expect(ics).toContain('DTSTAMP:20261015T120000Z');
    expect(ics).toContain('LOCATION:Teatro Colón · Sala principal\\, Cerrito 628');
    expect(ics.replace(/\r\n /g, '')).toContain(
      String.raw`DESCRIPTION:Ópera\; en francés\n\nhttps://culturaba.xn--lembodiseo-19a.com/event/hoffmann`,
    );
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('muestra: días completos, el fin es exclusivo y sin avisos', () => {
    const ics = buildIcs(
      { ...base, kind: 'range', startDate: '2026-10-09', endDate: '2026-11-01' },
      stamp,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261009');
    expect(ics).toContain('DTEND;VALUE=DATE:20261102');
    expect(ics).not.toContain('VALARM');
  });

  it('pliega líneas largas a 75 octetos sin cortar caracteres', () => {
    const ics = buildIcs({ ...base, description: 'ñ'.repeat(200) }, stamp);
    for (const line of ics.split('\r\n')) {
      expect(encodeURIComponent(line).replace(/%[0-9A-F]{2}/g, 'x').length).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, '')).toContain('ñ'.repeat(200));
  });
});

describe('googleCalendarUrl', () => {
  it('arma el enlace con fechas UTC y datos codificados', () => {
    const url = googleCalendarUrl({ ...base, endsAt: '2026-10-16T23:00:00-03:00' });
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20261016T230000Z%2F20261017T020000Z');
    expect(url).toContain(`text=${encodeURIComponent('Les Contes d’Hoffmann')}`);
  });
});
