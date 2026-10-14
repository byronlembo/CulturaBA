import { stripDiacriticsLower, type VenueRef } from '@culturaba/shared';
import {
  derivedInstitution,
  genericInstitution,
  type InstitutionRef,
  type SeedInstitutionSlug,
  seedInstitutionFromLinks,
} from './institutions';

/**
 * `ubicacion` de Linda ({titulo, direccion, latitud, longitud}) → VenueRef + institución.
 *
 *  · Venue del seed (teatro-colon, mnba, palacio-libertad) → { slug, name } y NUNCA la
 *    dirección de Linda (el Colón figura con "Tucumán 1171", la boletería).
 *  · Salas del Complejo Teatral y CETC → nombre canónico idéntico al de los conectores
 *    institucionales (el VenueResolver reutiliza venues por institución + nombre) y la
 *    dirección tal como la publica Linda, con addressSourceUrl = página del evento.
 *  · Otro espacio con nombre → { name, address, addressSourceUrl } solo si Linda publica
 *    la dirección; si no, { name } y el evento queda candidato (missing:venue).
 *  · "Varias Sedes"/"Plazas de la Ciudad" → { name } sin dirección: la dirección que
 *    acompaña a esos títulos es la de UNA de las sedes y no se puede atribuir.
 *  · Barrio/zona ("Palermo", "Microcentro") o sin título → la dirección publicada hace de
 *    nombre ({ name: dirección, address: dirección }), así dos eventos del mismo barrio
 *    con distinta dirección no comparten venue por nombre.
 *  · Coordenadas: VenueRef no admite lat/lng; quedan en rawFragment.
 */

export interface KnownPlace {
  institution: SeedInstitutionSlug;
  /** Variantes aceptadas, ya normalizadas con placeKey. */
  aliases: readonly string[];
  /** slug presente solo para venues del seed. */
  venue: { slug?: string; name: string };
}

export const KNOWN_PLACES: readonly KnownPlace[] = [
  {
    institution: 'teatro-colon',
    aliases: ['teatro colon'],
    venue: { slug: 'teatro-colon', name: 'Teatro Colón' },
  },
  {
    // Mismo nombre que CETC_VENUE del conector teatro-colon (otra dirección: Viamonte 1168).
    institution: 'teatro-colon',
    aliases: [
      'centro de experimentacion del teatro colon',
      'centro de experimentacion del teatro colon cetc',
      'cetc',
    ],
    venue: { name: 'Centro de Experimentación del Teatro Colón (CETC)' },
  },
  {
    institution: 'mnba',
    aliases: ['museo nacional de bellas artes', 'mnba'],
    venue: { slug: 'mnba', name: 'Museo Nacional de Bellas Artes' },
  },
  {
    institution: 'palacio-libertad',
    aliases: [
      'palacio libertad',
      'palacio libertad domingo f sarmiento',
      'palacio libertad ex cck',
      'centro cultural kirchner',
      'cck',
    ],
    venue: { slug: 'palacio-libertad', name: 'Palacio Libertad' },
  },
  // Salas del Complejo Teatral de Buenos Aires: nombres de KNOWN_THEATRES (complejo-teatral).
  {
    institution: 'complejo-teatral',
    aliases: ['teatro san martin', 'teatro general san martin'],
    venue: { name: 'Teatro San Martín' },
  },
  {
    institution: 'complejo-teatral',
    aliases: ['teatro presidente alvear', 'teatro alvear'],
    venue: { name: 'Teatro Presidente Alvear' },
  },
  { institution: 'complejo-teatral', aliases: ['teatro regio'], venue: { name: 'Teatro Regio' } },
  {
    institution: 'complejo-teatral',
    aliases: ['teatro sarmiento'],
    venue: { name: 'Teatro Sarmiento' },
  },
  {
    institution: 'complejo-teatral',
    aliases: ['teatro de la ribera'],
    venue: { name: 'Teatro de la Ribera' },
  },
  {
    institution: 'complejo-teatral',
    aliases: ['cine teatro el plata', 'teatro el plata'],
    venue: { name: 'Cine Teatro El Plata' },
  },
];

/**
 * Variantes de escritura de un mismo espacio en Linda → la forma publicada más frecuente,
 * para que institución y venue no se dupliquen ("BAferial" / "BA Ferial"). Solo variantes
 * con la MISMA dirección publicada (Av. Costanera Rafael Obligado 1221; Av. Figueroa
 * Alcorta 2099). "Edificio Bencich" (Diagonal Norte 615) y "Edificio Miguel Bencich"
 * (Sáenz Peña 616) no se unen: distinta dirección.
 */
export const SPACE_ALIASES: Readonly<Record<string, string>> = {
  'ba ferial ex costa salguero': 'BA ferial (ex Costa Salguero)',
  'baferial ex costa salguero': 'BA ferial (ex Costa Salguero)',
  'ba ferial': 'BA ferial (ex Costa Salguero)',
  cec: 'Centro de Convenciones (CEC)',
  'centro de convenciones cec': 'Centro de Convenciones (CEC)',
};

/** Títulos que nombran varias sedes a la vez. */
const MULTI_SITE_KEYS = new Set([
  'varias sedes',
  'distintas sedes',
  'plazas de la ciudad',
  'comunas de la ciudad',
]);

/** Zonas que no son un espacio (además del barrio que Linda informa en `barrio`). */
const AREA_KEYS = new Set([
  'microcentro',
  'tribunales',
  'centro',
  'caba',
  'ciudad de buenos aires',
  'buenos aires',
]);

/** "Centro Cultural 25 de Mayo" → "centro cultural 25 de mayo" (sin acentos ni signos). */
export function placeKey(text: string | null | undefined): string {
  return stripDiacriticsLower(clean(text))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Espacios, colapsa blancos y quita caracteres de ancho cero (U+200B…). */
export function clean(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findKnownPlace(title: string | null | undefined): KnownPlace | null {
  const key = placeKey(title);
  if (!key) return null;
  return KNOWN_PLACES.find((p) => p.aliases.includes(key)) ?? null;
}

export type PlaceKind = 'known' | 'space' | 'address' | 'area' | 'multi_site' | 'none';

export function classifyPlace(
  title: string | null | undefined,
  address: string | null | undefined,
  barrio: string | null | undefined,
): PlaceKind {
  const key = placeKey(title);
  if (!key) return 'none';
  if (findKnownPlace(title)) return 'known';
  if (MULTI_SITE_KEYS.has(key)) return 'multi_site';
  if (AREA_KEYS.has(key)) return 'area';
  if (barrio && key === placeKey(barrio.replace(/_/g, ' '))) return 'area';
  // "Avenida de Mayo 575" con dirección "Avenida de Mayo 575, C1084AAA …": el título ES la dirección.
  const addressKey = placeKey(address);
  if (/\d/.test(key) && addressKey?.startsWith(key)) return 'address';
  return 'space';
}

/** Nombre con el que se crea la institución/venue derivados de un espacio. */
export function canonicalSpaceName(title: string): string {
  return SPACE_ALIASES[placeKey(title)] ?? clean(title);
}

export interface PlaceInput {
  /** ubicacion.titulo */
  title: string | null | undefined;
  /** ubicacion.direccion (o `direccion` del evento si falta). */
  address: string | null | undefined;
  /** `barrio` en snake_case ("san_nicolas"). */
  barrio: string | null | undefined;
  /** botonesSidebar[].uri */
  links: readonly string[];
  /** Página del evento en Linda: de ahí sale la dirección. */
  officialUrl: string;
}

export interface PlaceResolution {
  kind: PlaceKind;
  institution: InstitutionRef;
  venue: VenueRef | null;
  warnings: string[];
}

export function resolvePlace(input: PlaceInput): PlaceResolution {
  const warnings: string[] = [];
  const title = clean(input.title);
  const address = clean(input.address);
  const kind = classifyPlace(title, address, input.barrio);
  const known = kind === 'known' ? findKnownPlace(title) : null;
  const withAddress = (name: string): VenueRef =>
    address ? { name, address, addressSourceUrl: input.officialUrl } : { name };

  // ── Venue ────────────────────────────────────────────────────────────────
  let venue: VenueRef | null;
  switch (kind) {
    case 'known':
      venue = known?.venue.slug
        ? { slug: known.venue.slug, name: known.venue.name }
        : withAddress(known?.venue.name ?? title);
      break;
    case 'space':
      venue = withAddress(canonicalSpaceName(title));
      break;
    case 'address':
      venue = withAddress(title);
      break;
    case 'multi_site':
      venue = { name: title };
      warnings.push(`ubicación "${title}": varias sedes, la dirección no se atribuye a un venue`);
      break;
    case 'area':
      venue = address ? withAddress(address) : { name: title };
      break;
    case 'none':
      venue = address ? withAddress(address) : null;
      if (!venue) warnings.push('sin ubicación publicada');
      break;
  }
  if (venue && !venue.slug && !venue.address) warnings.push(`venue "${venue.name}" sin dirección`);

  // ── Institución ──────────────────────────────────────────────────────────
  const linked = seedInstitutionFromLinks(input.links);
  let institution: InstitutionRef;
  if (linked) {
    institution = { slug: linked, via: 'link' };
  } else if (known) {
    institution = { slug: known.institution, via: 'place' };
  } else if (kind === 'space') {
    const name = canonicalSpaceName(title);
    institution = derivedInstitution(name, placeKey(name), input.links);
  } else {
    institution = genericInstitution();
  }

  return { kind, institution, venue, warnings };
}
