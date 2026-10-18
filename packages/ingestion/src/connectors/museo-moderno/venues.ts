import type { VenueRef } from '@culturaba/shared';
import { normalizeLine } from './dates';

/**
 * Lugares de museomoderno.org → VenueRef.
 *
 *  · Sede del museo: venue seed `museo-moderno` (Av. San Juan 350, publicada en el footer de todo
 *    el sitio y en /planea-tu-visita/; ver supabase/seed.sql). Mismo nombre que el espacio
 *    derivado de Linda ("Museo Moderno"), así el VenueResolver reutiliza el mismo venue.
 *    La sala va en `room`: "Auditorio – Av. San Juan 350 (CABA)" → room "Auditorio".
 *  · Otro lugar publicado por la actividad ("Punto de encuentro: CeSAC Nº 15, Balcarce 1170
 *    (CABA)") → { name, address } con el texto literal y addressSourceUrl = página del ítem,
 *    SOLO si el texto ubica el lugar en CABA/Buenos Aires; si no ("Venecia, Italia", "Av. Dorrego
 *    4019 (Servicio Meteorológico Nacional)"), { name } sin dirección: candidato por venue.
 *  · Exposiciones: "Ubicación: Segundo piso (Sala G)" → sede del museo con room literal; una
 *    ubicación que no nombra pisos ni salas ("Café Moderno") no se atribuye a la sede.
 */

export const MUSEUM_VENUE: VenueRef = { slug: 'museo-moderno', name: 'Museo Moderno' };

/** "Av. San Juan 350" (con variantes "Av San Juan 350", "Avenida San Juan 350"). */
const MUSEUM_ADDRESS_RE = /\bav(?:enida|\.)?\s*san\s+juan\s+350\b/i;

/** Nombres de la propia sede: no son una sala. */
const MUSEUM_NAMES = new Set([
  'museo moderno',
  'museo de arte moderno',
  'museo de arte moderno de buenos aires',
  'el moderno',
]);

/** Ubicaciones de exposiciones dentro de la sede ("Primer piso (Salas C, E y F)", "Hall"). */
const IN_MUSEUM_RE =
  /\b(?:piso|planta|subsuelo|salas?|hall|auditorio|biblioteca|terraza|espacios? de circulacion)\b/;

/** Marcas de que una dirección está en la Ciudad. */
const CITY_RE = /\b(?:caba|c\.a\.b\.a\.?|ciudad autonoma de buenos aires|buenos aires)\b/;

const PLACE_PREFIX_RE = /^(?:punto de encuentro|lugar|ubicaci[oó]n|d[oó]nde)\s*:\s*/i;

export interface PlaceResolution {
  venue: VenueRef;
  kind: 'museum' | 'offsite';
}

function clean(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function museumVenue(room: string | null): VenueRef {
  return room ? { ...MUSEUM_VENUE, room } : { ...MUSEUM_VENUE };
}

/** Texto antes de "Av. San Juan 350" como sala: "Sala Yapeyú – Av. San Juan 350 (CABA)" → "Sala Yapeyú". */
function roomBefore(text: string, index: number): string | null {
  const room = clean(text.slice(0, index))
    .replace(PLACE_PREFIX_RE, '')
    .replace(/[\s–—\-.,:;(]+$/, '')
    .trim();
  if (!room || MUSEUM_NAMES.has(normalizeLine(room))) return null;
  return room;
}

/** Segmento que es una calle con número ("Balcarce 1170 (CABA)", "Av. Costanera Rafael Obligado 6745"). */
const STREET_RE = /^\p{L}[\p{L}. ]*\s\d{2,5}\b/u;
/** "CeSAC Nº 15" no es una calle. */
const NUMBERED_NAME_RE = /\bn[º°o.]\s*\d/i;
const SEGMENT_SEP_RE = /,\s+|\s+[–—-]\s+/g;

/**
 * Lugar fuera de la sede, con el texto tal cual se publica. Si un segmento (separado por ", " o
 * " – ") es una calle con número, de ahí en adelante es la dirección y lo anterior el nombre:
 *   "CeSAC Nº 15, Balcarce 1170 (CABA)" → "CeSAC Nº 15" + "Balcarce 1170 (CABA)"
 *   "Sala PAyS, Parque de la Memoria – … – Av. Costanera Rafael Obligado 6745 (CABA)"
 * Si no ("Esquina de Av. Caseros y Defensa, Parque Lezama (CABA)"), nombre = dirección = literal.
 */
function offsiteVenue(text: string, sourceUrl: string): VenueRef {
  const literal = clean(text).replace(/\.$/, '');
  if (!CITY_RE.test(normalizeLine(literal))) return { name: literal };
  for (const sep of literal.matchAll(SEGMENT_SEP_RE)) {
    const rest = literal.slice(sep.index + sep[0].length);
    const segment = rest.split(/,\s+|\s+[–—-]\s+/)[0] ?? '';
    if (STREET_RE.test(segment) && !NUMBERED_NAME_RE.test(segment)) {
      return {
        name: literal.slice(0, sep.index).trim(),
        address: rest.trim(),
        addressSourceUrl: sourceUrl,
      };
    }
  }
  return { name: literal, address: literal, addressSourceUrl: sourceUrl };
}

const NOT_A_PLACE_RE =
  /^(?:actividad|entrada|entradas|orientad[oa]s?|inscrip|modalidad|plataforma)\b/;
const PLACE_LINE_MAX = 160;

/**
 * Línea de lugar de la agenda, o null si la línea no es un lugar:
 *   "Auditorio – Av. San Juan 350 (CABA)"            → sede, room "Auditorio"
 *   "Av. San Juan 350 (CABA)"                         → sede
 *   "Punto de encuentro: CeSAC Nº 15, Balcarce 1170 (CABA)" → { name: "CeSAC Nº 15", address }
 *   "Acceso Sur – Camino de los Plumerillos (CABA)"   → { name = address = literal }
 */
export function placeFromLine(line: string, sourceUrl: string): PlaceResolution | null {
  const text = clean(line);
  // Un párrafo que menciona la dirección al pasar no es la línea de lugar.
  if (!text || text.length > PLACE_LINE_MAX) return null;
  const museum = MUSEUM_ADDRESS_RE.exec(text);
  if (museum) return { venue: museumVenue(roomBefore(text, museum.index)), kind: 'museum' };

  const cleaned = normalizeLine(text);
  if (PLACE_PREFIX_RE.test(text)) {
    const rest = text.replace(PLACE_PREFIX_RE, '');
    return rest ? { venue: offsiteVenue(rest, sourceUrl), kind: 'offsite' } : null;
  }
  if (!NOT_A_PLACE_RE.test(cleaned) && /(?:\(caba\)|,\s*caba)\.?$/.test(cleaned)) {
    return { venue: offsiteVenue(text, sourceUrl), kind: 'offsite' };
  }
  return null;
}

/**
 * "Ubicación:" de una exposición → venue. Dentro de la sede: room literal. Fuera: como
 * offsiteVenue (dirección solo si el texto la ubica en la Ciudad).
 */
export function placeFromLocation(
  location: string | null,
  sourceUrl: string,
): PlaceResolution | null {
  const text = clean(location ?? '');
  if (!text) return null;
  const museum = MUSEUM_ADDRESS_RE.exec(text);
  if (museum) return { venue: museumVenue(roomBefore(text, museum.index)), kind: 'museum' };
  const cleaned = normalizeLine(text);
  // Una dirección (número de calle) o una ciudad indican otro lugar aunque nombre "salas".
  const elsewhere = /\d{3,}/.test(cleaned) || CITY_RE.test(cleaned);
  if (IN_MUSEUM_RE.test(cleaned) && !elsewhere) return { venue: museumVenue(text), kind: 'museum' };
  return { venue: offsiteVenue(text, sourceUrl), kind: 'offsite' };
}
