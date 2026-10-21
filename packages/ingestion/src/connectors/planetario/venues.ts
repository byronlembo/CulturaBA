import type { VenueRef } from '@culturaba/shared';
import { normalizeText } from './dates';

/**
 * Lugar de cada actividad del Planetario → VenueRef.
 *
 *  · Sede: venue seed `planetario-galileo-galilei` (supabase/seed.sql). Dirección TAL CUAL la
 *    publica el sitio en el pie de todas las páginas y en /encontranos: "Av. Sarmiento s/n, 1425
 *    CABA" ("en la intersección de Avenida Sarmiento y Avenida Figueroa Alcorta, Parque Tres de
 *    Febrero, en el barrio de Palermo"). El sitio no publica coordenadas (solo un enlace corto de
 *    Google Maps): no se geocodifica. Mismo nombre que el espacio de Linda ("Planetario Galileo
 *    Galilei"), así el VenueResolver reutiliza el mismo venue.
 *  · Sala: campo "Lugar" de la ficha (`field_evento_lugar`): "Sala de espectáculos del
 *    Planetario Bs. As." → room "Sala de Espectáculos"; "Domo del Planetario de Buenos Aires" →
 *    "Domo"; "Sala de espectáculos/ Domo" → "Sala de Espectáculos / Domo". Solo el edificio
 *    ("Planetario Galileo Galilei", "Planetario de Buenos Aires") → sin room.
 *  · Otro lugar ("Centro Cultural 25 de Mayo") → { name } con el texto literal y SIN dirección:
 *    queda candidato por venue (no se adivina la dirección de otra institución).
 *  · Sin "Lugar" publicado → sin venue (candidato). No se asume la sede.
 */

export const PLANETARIO_ADDRESS = 'Av. Sarmiento s/n, 1425 CABA';
export const PLANETARIO_ADDRESS_URL = 'https://planetario.buenosaires.gob.ar/encontranos';

export const PLANETARIO_VENUE: VenueRef = {
  slug: 'planetario-galileo-galilei',
  name: 'Planetario Galileo Galilei',
  address: PLANETARIO_ADDRESS,
  addressSourceUrl: PLANETARIO_ADDRESS_URL,
};

/** Espacios del edificio, en el orden en que se nombran. */
const ROOMS: ReadonlyArray<{ re: RegExp; room: string }> = [
  { re: /\bsalas? de espectaculos\b/, room: 'Sala de Espectáculos' },
  { re: /\bdomo\b/, room: 'Domo' },
  { re: /\bmuseo\b/, room: 'Museo' },
  { re: /\bexplanada de acceso\b/, room: 'Explanada de acceso' },
  { re: /\bexplanada\b(?! de acceso)/, room: 'Explanada' },
  { re: /\bplaza astronomica\b/, room: 'Plaza Astronómica' },
];

const PLANETARIO_RE = /\bplanetario\b/;
const VIRTUAL_PLACE_RE = /\b(?:youtube|virtual|online|en linea|streaming|zoom)\b/;

/** ¿Es la dirección publicada de la sede (con variantes de espacios y mayúsculas)? */
export function isPlanetarioAddress(text: string | null | undefined): boolean {
  return /\bav(?:enida|\.)?\s*sarmiento\s+s\/n\b/.test(normalizeText(text ?? ''));
}

export interface PlaceResolution {
  venue: VenueRef | null;
  /** El "Lugar" es una transmisión, no un espacio físico. */
  virtual: boolean;
  warnings: string[];
}

export function venueFromPlace(place: string | null | undefined): PlaceResolution {
  const literal = (place ?? '').replace(/\s+/g, ' ').trim();
  if (!literal) {
    return {
      venue: null,
      virtual: false,
      warnings: ['sin "Lugar" publicado: candidato por venue'],
    };
  }
  const key = normalizeText(literal);
  if (VIRTUAL_PLACE_RE.test(key)) {
    return { venue: null, virtual: true, warnings: [`lugar virtual ("${literal}")`] };
  }
  const found: Array<{ index: number; room: string }> = [];
  for (const { re, room } of ROOMS) {
    const m = re.exec(key);
    if (m && !found.some((f) => f.room === room)) found.push({ index: m.index, room });
  }
  if (found.length > 0 || PLANETARIO_RE.test(key)) {
    const room = found
      .sort((a, b) => a.index - b.index)
      .map((f) => f.room)
      .join(' / ');
    return {
      venue: room ? { ...PLANETARIO_VENUE, room } : { ...PLANETARIO_VENUE },
      virtual: false,
      warnings: [],
    };
  }
  return {
    venue: { name: literal },
    virtual: false,
    warnings: [
      `lugar fuera de la sede sin dirección publicada ("${literal}"): candidato por venue`,
    ],
  };
}
