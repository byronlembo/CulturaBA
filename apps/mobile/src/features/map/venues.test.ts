import type { EventSummary } from '@/api/types';
import { distanceMeters, formatDistance, venuePins } from './venues';

const ev = (id: string, venueName: string, venueLat: number | null, venueLng: number | null) =>
  ({ id, venueName, venueLat, venueLng, institutionName: 'X' }) as EventSummary;

describe('venuePins', () => {
  const colon = { lat: -34.60106, lng: -58.38253 };
  const events = [
    ev('a', 'Teatro Colón', colon.lat, colon.lng),
    ev('b', 'Teatro Colón', colon.lat, colon.lng),
    ev('c', 'Usina del Arte', -34.62888, -58.35631),
    ev('d', 'Sin ubicación', null, null),
  ];

  it('agrupa por sala, omite las que no tienen coordenadas y ordena por cantidad', () => {
    const pins = venuePins(events, null);
    expect(pins.map((p) => [p.name, p.events.length, p.distance])).toEqual([
      ['Teatro Colón', 2, null],
      ['Usina del Arte', 1, null],
    ]);
  });

  it('con ubicación, ordena de la más cercana a la más lejana', () => {
    const pins = venuePins(events, { lat: -34.6285, lng: -58.3566 });
    expect(pins.map((p) => p.name)).toEqual(['Usina del Arte', 'Teatro Colón']);
    expect(pins[0]?.distance).toBeLessThan(100);
  });
});

it('mide y formatea distancias', () => {
  // Obelisco → Teatro Colón: unos 300 m.
  const d = distanceMeters({ lat: -34.60373, lng: -58.38157 }, { lat: -34.60106, lng: -58.38253 });
  expect(d).toBeGreaterThan(250);
  expect(d).toBeLessThan(350);
  expect(formatDistance(d)).toMatch(/^\d+0 m$/);
  expect(formatDistance(1234)).toBe('1,2 km');
});
