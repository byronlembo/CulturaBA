import { stripDiacriticsLower, type VenueRef } from '@culturaba/shared';

/**
 * Salas y teatros del Complejo Teatral de Buenos Aires → VenueRef.
 *
 * No hay venues del CTBA en el seed, así que cada teatro se referencia por nombre y
 * la dirección se toma ÚNICAMENTE de lo que publica la página de detalle
 * (`li.address span.bold`, p. ej. "Av. Corrientes 1530"), con `addressSourceUrl` =
 * URL del detalle. Un teatro sin dirección publicada (Casa de la Cultura) queda
 * como { name, room } y el evento es candidato por `missing:venue`: correcto.
 *
 * La tabla de nombres canónicos sirve para que todas las producciones de un mismo
 * teatro compartan exactamente el mismo `name` (el VenueResolver reutiliza venues por
 * institución + nombre), aunque el sitio varíe mayúsculas o acentos.
 */
export interface KnownTheatre {
  /** Nombre canónico tal como lo publica el sitio en "Dónde:". */
  name: string;
  /** Variantes aceptadas (comparación sin acentos ni mayúsculas). */
  aliases: readonly string[];
}

export const KNOWN_THEATRES: readonly KnownTheatre[] = [
  { name: 'Teatro San Martín', aliases: ['teatro san martin', 'tsm'] },
  { name: 'Teatro Presidente Alvear', aliases: ['teatro presidente alvear', 'teatro alvear'] },
  { name: 'Teatro Regio', aliases: ['teatro regio'] },
  { name: 'Teatro Sarmiento', aliases: ['teatro sarmiento'] },
  { name: 'Teatro de la Ribera', aliases: ['teatro de la ribera'] },
  { name: 'Cine Teatro El Plata', aliases: ['cine teatro el plata', 'teatro el plata'] },
  { name: 'Casa de la Cultura', aliases: ['casa de la cultura'] },
];

function key(text: string): string {
  return stripDiacriticsLower(text).replace(/\s+/g, ' ').trim();
}

/** Nombre canónico del teatro (o el texto limpio si no es uno de los conocidos). */
export function canonicalTheatreName(raw: string): string {
  const k = key(raw);
  const known = KNOWN_THEATRES.find((t) => t.aliases.includes(k) || key(t.name) === k);
  return known ? known.name : raw.replace(/\s+/g, ' ').trim();
}

export interface VenueParts {
  /** Teatro ("Teatro San Martín"). */
  theatre: string | null;
  /** Sala dentro del teatro ("Sala Cunill Cabanellas"); puede faltar. */
  room: string | null;
  /** Dirección tal como la publica el detalle; null si no la publica. */
  address: string | null;
  /** URL donde se leyó la dirección. */
  addressSourceUrl: string | null;
}

/**
 * "Sala Cunill Cabanellas / Teatro San Martín" → { room, theatre }.
 * "/ Teatro Regio" → { room: null, theatre: 'Teatro Regio' }.
 */
export function splitPlace(place: string | null | undefined): {
  room: string | null;
  theatre: string | null;
} {
  const text = (place ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { room: null, theatre: null };
  const idx = text.lastIndexOf('/');
  if (idx === -1) return { room: null, theatre: text };
  const room = text.slice(0, idx).trim();
  const theatre = text.slice(idx + 1).trim();
  return { room: room || null, theatre: theatre || null };
}

/** Construye el VenueRef sin inventar nada: sin teatro → null (candidato). */
export function buildVenueRef(parts: VenueParts): VenueRef | null {
  if (!parts.theatre) return null;
  const ref: VenueRef = { name: canonicalTheatreName(parts.theatre) };
  if (parts.room) ref.room = parts.room;
  if (parts.address) {
    ref.address = parts.address;
    if (parts.addressSourceUrl) ref.addressSourceUrl = parts.addressSourceUrl;
  }
  return ref;
}
