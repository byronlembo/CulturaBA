import type { EventSummary } from '@/api/types';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Una sala en el mapa con sus eventos (mismas coordenadas = misma sala). */
export interface VenuePin extends LatLng {
  key: string;
  name: string;
  events: EventSummary[];
  /** Metros hasta el usuario, si compartió su ubicación. */
  distance: number | null;
}

export const BA_CENTER: LatLng = { lat: -34.6037, lng: -58.3816 };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Diámetro del punto de una sala: de 24 px (1 evento) a 40 px (13 o más); es su área táctil. */
// shortcut: en el Microcentro los puntos se pisan a zoom 12; si molesta, agrupar con leaflet.markercluster.
export function pinSize(count: number): number {
  return Math.round(24 + (Math.min(Math.max(count, 1) - 1, 12) * 4) / 3);
}

export function formatDistance(m: number): string {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Agrupa por sala; con ubicación, de la más cercana a la más lejana; sin ella, por cantidad. */
export function venuePins(events: EventSummary[], me: LatLng | null): VenuePin[] {
  const byKey = new Map<string, VenuePin>();
  for (const e of events) {
    if (e.venueLat === null || e.venueLng === null) continue;
    const key = `${e.venueLat.toFixed(5)},${e.venueLng.toFixed(5)}`;
    const pin = byKey.get(key) ?? {
      key,
      name: e.venueName ?? e.institutionName,
      lat: e.venueLat,
      lng: e.venueLng,
      events: [],
      distance: me ? distanceMeters(me, { lat: e.venueLat, lng: e.venueLng }) : null,
    };
    pin.events.push(e);
    byKey.set(key, pin);
  }
  return [...byKey.values()].sort((a, b) =>
    a.distance !== null && b.distance !== null
      ? a.distance - b.distance
      : b.events.length - a.events.length || a.name.localeCompare(b.name),
  );
}
