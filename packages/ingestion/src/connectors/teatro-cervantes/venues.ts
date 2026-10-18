import { stripDiacriticsLower, type VenueRef } from '@culturaba/shared';

/**
 * Espacios del Teatro Nacional Cervantes → VenueRef.
 *
 *  · Salas del edificio de Libertad 815 (venue seed `teatro-cervantes`, dirección publicada en
 *    https://www.teatrocervantes.gob.ar/contacto/ y en el pie de cada página): `room`. Las tres
 *    salas están descriptas en /salas/: María Guerrero, Orestes Caviglia y Luisa Vehil (esta
 *    "también conocida como Salón Dorado").
 *  · Programación "En el teatro" (categoría del sitio) con otro espacio interno ("FOYER DEL
 *    TEATRO", "SALA PISO 11") o sin sala publicada (visitas guiadas): mismo edificio.
 *  · Cualquier otro espacio (programación en otras sedes): solo `name`, sin dirección: el evento
 *    queda candidato por venue hasta que se publique una dirección. Nunca se infiere.
 *
 * Fuente de la sala: `p.sala-single b` del detalle.
 */

export const TEATRO_CERVANTES_VENUE: VenueRef = {
  slug: 'teatro-cervantes',
  name: 'Teatro Nacional Cervantes',
};

/** Texto normalizado de la sala → nombre canónico (tal como lo publica /salas/). */
const ROOMS: Record<string, string> = {
  'sala maria guerrero': 'Sala María Guerrero',
  'maria guerrero': 'Sala María Guerrero',
  'sala orestes caviglia': 'Sala Orestes Caviglia',
  'orestes caviglia': 'Sala Orestes Caviglia',
  'sala luisa vehil': 'Sala Luisa Vehil',
  'luisa vehil': 'Sala Luisa Vehil',
  'salon dorado': 'Sala Luisa Vehil',
};

/** Nombres con los que el sitio se refiere al propio edificio. */
const BUILDING_KEYS = new Set(['teatro nacional cervantes', 'teatro cervantes', 'tnc']);

const LOWER_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al']);

export function placeKey(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "FOYER DEL TEATRO" → "Foyer del Teatro" (solo mayúsculas; el texto es el publicado). */
export function prettifyPlace(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-AR').split(' ');
  return words
    .map((w, i) =>
      i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toLocaleUpperCase('es-AR') + w.slice(1),
    )
    .join(' ');
}

export interface VenueResolution {
  venue: VenueRef | null;
  warning?: string;
}

/**
 * @param salaText texto de `p.sala-single b` ("SALA ORESTES CAVIGLIA", "" en visitas guiadas).
 * @param inBuilding la obra está en la programación "En el teatro" (categoría o etiqueta del detalle).
 */
export function venueFor(
  salaText: string | null | undefined,
  inBuilding: boolean,
): VenueResolution {
  const original = (salaText ?? '').replace(/\s+/g, ' ').trim();
  const key = placeKey(original);
  const room = ROOMS[key];
  if (room) return { venue: { ...TEATRO_CERVANTES_VENUE, room } };
  if (BUILDING_KEYS.has(key)) return { venue: { ...TEATRO_CERVANTES_VENUE } };
  if (inBuilding) {
    if (!key) return { venue: { ...TEATRO_CERVANTES_VENUE } };
    return { venue: { ...TEATRO_CERVANTES_VENUE, room: prettifyPlace(original) } };
  }
  if (!key) return { venue: null, warning: 'sin sala ni sede publicadas: candidato por venue' };
  return {
    venue: { name: prettifyPlace(original) },
    warning: `espacio "${original}" sin dirección publicada: candidato por venue`,
  };
}
