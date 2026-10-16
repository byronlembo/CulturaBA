import { render, screen } from '@testing-library/react-native';
import type { EventSummary } from '@/api/types';
import { EventCard, eventWhen } from './EventCard';

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
    expect(eventWhen(base)).toMatch(/^dom 18 oct(?: 2026)? · 20:00 · \+1 fechas$/);
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

describe('<EventCard />', () => {
  it('renders title, discipline, venue and social counts', async () => {
    await render(<EventCard event={base} />);
    expect(screen.getByText('La Traviata')).toBeTruthy();
    expect(screen.getByText('Ópera y música clásica')).toBeTruthy();
    expect(screen.getByText('Teatro Colón')).toBeTruthy();
    expect(screen.getByText('3 van')).toBeTruthy();
    expect(screen.queryByText('Gratis')).toBeNull();
  });

  it('marks free events', async () => {
    await render(<EventCard event={{ ...base, isFree: true }} />);
    expect(screen.getByText('Gratis')).toBeTruthy();
  });
});
