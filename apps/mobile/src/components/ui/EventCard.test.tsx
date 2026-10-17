import { render, screen } from '@testing-library/react-native';
import type { EventSummary } from '@/api/types';
import { EventCard, eventWhen, ticketDate, ticketDetail } from './EventCard';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const base: EventSummary = {
  id: '1',
  slug: 'la-traviata-abc123',
  title: 'La Traviata',
  subtitle: null,
  primaryDiscipline: 'opera_clasica',
  disciplines: ['opera_clasica'],
  imageUrl: null,
  imageSource: 'fallback',
  institutionName: 'Teatro Colón',
  venueName: 'Teatro Colón',
  venueLat: null,
  venueLng: null,
  nextStartsAt: '2026-10-18T20:00:00-03:00',
  nextKind: 'timed',
  nextEndsAt: null,
  lastEndsAt: '2026-10-21T20:00:00-03:00',
  upcomingCount: 2,
  isOngoing: false,
  attendingCount: 3,
  recommendCount: 0,
  saveCount: 0,
  isFree: null,
  priceText: null,
  priceVerified: false,
};

describe('eventWhen', () => {
  it('shows next date plus remaining count', () => {
    expect(eventWhen(base)).toMatch(/^dom 18 oct(?: 2026)? · 20:00 · \+1 fecha$/);
    expect(eventWhen({ ...base, upcomingCount: 3 })).toMatch(/· \+2 fechas$/);
  });
  it('describes ongoing exhibitions', () => {
    expect(
      eventWhen({
        ...base,
        isOngoing: true,
        nextStartsAt: '2026-10-14T15:00:00-03:00',
        lastEndsAt: '2026-12-13T23:59:59-03:00',
        upcomingCount: 1,
      }),
    ).toMatch(/^En curso · hasta 13 dic/);
  });
  it('handles missing dates', () => {
    expect(eventWhen({ ...base, nextStartsAt: null })).toBe('Sin fechas próximas');
  });
  it('uses Buenos Aires local dates even when instants arrive in UTC', () => {
    // 2026-12-13 23:59:59 -03:00 == 2026-12-14T02:59:59Z: must still read "13 dic".
    expect(
      eventWhen({
        ...base,
        nextKind: 'range',
        nextStartsAt: '2026-10-16T03:00:00.000Z',
        nextEndsAt: '2026-12-14T02:59:59.000Z',
        upcomingCount: 1,
      }),
    ).toMatch(/^Del 16 oct(?: 2026)? al 13 dic(?: 2026)?$/);
  });
  it('shows a date range for an upcoming exhibition', () => {
    expect(
      eventWhen({
        ...base,
        nextKind: 'range',
        nextStartsAt: '2026-10-16T00:00:00-03:00',
        nextEndsAt: '2026-12-13T23:59:59-03:00',
        upcomingCount: 1,
      }),
    ).toMatch(/^Del 16 oct(?: 2026)? al 13 dic(?: 2026)?$/);
  });
});

describe('ticket stub', () => {
  it('shows the Buenos Aires weekday, day and month of the next performance', () => {
    // 23:30 en BA es 02:30Z del día siguiente: debe seguir siendo "dom 18 oct".
    const e = { ...base, nextStartsAt: '2026-10-19T02:30:00.000Z' };
    expect(ticketDate(e)).toEqual({ top: 'dom', day: '18', bottom: 'oct' });
    expect(ticketDetail(e)).toEqual({ time: '23:30', note: '+1 fecha' });
  });
  it('uses the closing date for ongoing exhibitions', () => {
    const e = {
      ...base,
      isOngoing: true,
      nextKind: 'range' as const,
      nextStartsAt: '2026-10-14T15:00:00-03:00',
      lastEndsAt: '2026-12-14T02:59:59.000Z',
    };
    expect(ticketDate(e)).toEqual({ top: 'hasta', day: '13', bottom: 'dic' });
    expect(ticketDetail(e)).toEqual({ time: null, note: 'En curso' });
  });
  it('shows the range of an upcoming exhibition without a time', () => {
    const e = {
      ...base,
      nextKind: 'range' as const,
      nextStartsAt: '2026-10-16T00:00:00-03:00',
      nextEndsAt: '2026-12-13T23:59:59-03:00',
      upcomingCount: 1,
    };
    expect(ticketDetail(e).time).toBeNull();
    expect(ticketDetail(e).note).toMatch(/^Del 16 oct/);
  });
  it('has no date column without upcoming dates', () => {
    const e = { ...base, nextStartsAt: null };
    expect(ticketDate(e)).toBeNull();
    expect(ticketDetail(e)).toEqual({ time: null, note: 'Sin fechas próximas' });
  });
});

describe('<EventCard />', () => {
  it('renders title, discipline, venue and social counts', async () => {
    await render(<EventCard event={base} />);
    expect(screen.getByText('La Traviata')).toBeTruthy();
    expect(screen.getByText('Ópera y música clásica · Teatro Colón')).toBeTruthy();
    expect(screen.getByText('3 van')).toBeTruthy();
    expect(screen.getByText('20:00')).toBeTruthy();
    expect(screen.queryByText('Gratis')).toBeNull();
  });

  it('uses the singular for one person', async () => {
    await render(<EventCard event={{ ...base, attendingCount: 1, recommendCount: 1 }} />);
    expect(screen.getByText('1 va · 1 recomienda')).toBeTruthy();
  });

  it('marks free events', async () => {
    await render(<EventCard event={{ ...base, isFree: true }} />);
    expect(screen.getByText('Gratis')).toBeTruthy();
  });
});
