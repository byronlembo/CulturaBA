import { stripDiacriticsLower, type VenueRef } from '@culturaba/shared';

/**
 * Espacios del Teatro Colón → VenueRef.
 *
 *  · Salas dentro del edificio de Cerrito 628 (venue seed `teatro-colon`): room.
 *  · Espacios con OTRA dirección publicada por el sitio: {name, address, addressSourceUrl}
 *    con el texto literal de la página que la publica.
 *  · Cualquier otro texto: {name} sin dirección (queda candidato por venue).
 *
 * Fuente de la sala: `h4#the_place` del detalle; respaldo: clase `places-*` del CMS.
 */

export const TEATRO_COLON_VENUE: VenueRef = { slug: 'teatro-colon', name: 'Teatro Colón' };

/** "Dirección de ingreso para funciones del CETC: Viamonte 1168" (fixture 029-cetc.html). */
export const CETC_VENUE: VenueRef = {
  name: 'Centro de Experimentación del Teatro Colón (CETC)',
  address: 'Viamonte 1168',
  addressSourceUrl: 'https://teatrocolon.org.ar/centro-de-experimentacion-del-teatro-colon/',
};

/** "Av. Pedro de Mendoza 2163, La Boca." (fixture 028-colon-fabrica.html). */
export const COLON_FABRICA_VENUE: VenueRef = {
  name: 'Teatro Colón Fábrica',
  address: 'Av. Pedro de Mendoza 2163, La Boca',
  addressSourceUrl: 'https://teatrocolon.org.ar/colon-fabrica/',
};

/** Texto normalizado de `h4#the_place` → room del venue seed. */
const ROOMS_IN_THEATRE: Record<string, string> = {
  'sala principal': 'Sala principal',
  'salon dorado': 'Salón Dorado',
  'plaza vaticano y teatro colon': 'Plaza Vaticano y Teatro Colón',
};

/** Taxonomía `places-<slug>` del CMS → misma clave que el texto. */
const PLACE_SLUG_TO_KEY: Record<string, string> = {
  'sala-principal': 'sala principal',
  'salon-dorado': 'salon dorado',
  'teatro-colon': 'teatro colon',
  cetc: 'cetc',
  'teatro-colon-fabrica': 'teatro colon fabrica',
};

export interface VenueResolution {
  venue: VenueRef | null;
  warning?: string;
}

export interface VenueHints {
  /** Slug de la taxonomía `places-*` (respaldo cuando `h4#the_place` viene vacío). */
  placeSlug?: string | null;
  /** `[itemprop=location] [itemprop=name]` de la página (bloque fijo del tema). */
  locationName?: string | null;
}

export function normalizePlaceKey(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function venueForPlace(
  placeText: string | null | undefined,
  hints: VenueHints = {},
): VenueResolution {
  const original = (placeText ?? '').replace(/\s+/g, ' ').trim();
  const key = normalizePlaceKey(original);
  if (key) return fromKey(key, original);

  const slugKey = hints.placeSlug ? PLACE_SLUG_TO_KEY[hints.placeSlug] : undefined;
  if (slugKey) {
    const r = fromKey(slugKey, slugKey);
    return {
      venue: r.venue,
      warning: `sala tomada de la taxonomía places-${hints.placeSlug} (h4#the_place vacío)`,
    };
  }

  if (normalizePlaceKey(hints.locationName ?? '') === 'teatro colon') {
    return {
      venue: TEATRO_COLON_VENUE,
      warning: 'sala no publicada: sede Teatro Colón según el microdato location de la página',
    };
  }

  return { venue: null, warning: 'sin sala ni sede publicadas' };
}

function fromKey(key: string, original: string): VenueResolution {
  const room = ROOMS_IN_THEATRE[key];
  if (room) return { venue: { ...TEATRO_COLON_VENUE, room } };
  if (key === 'teatro colon') return { venue: TEATRO_COLON_VENUE };
  if (key === 'cetc' || key.startsWith('cetc ') || key.includes('centro de experimentacion')) {
    return { venue: CETC_VENUE };
  }
  if (key.includes('colon fabrica')) return { venue: COLON_FABRICA_VENUE };
  return {
    venue: { name: original },
    warning: `espacio '${original}' sin dirección publicada: queda candidato por venue`,
  };
}
