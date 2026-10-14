import { slugify } from '@culturaba/shared';

/**
 * Institución de cada evento de Linda (agregador multi-institución).
 *
 * Orden de decisión (ver resolvePlace en venues.ts):
 *  1. Enlace institucional en `botonesSidebar[].uri` cuyo host es el sitio de una
 *     institución del seed → su slug EXACTO (para que el dedup por
 *     `dedup_key = título | institución` cruce con el conector institucional).
 *  2. `ubicacion.titulo` = una sala conocida de una institución del seed (Teatro Colón,
 *     salas del Complejo Teatral, MNBA, Palacio Libertad) → ese slug.
 *  3. Espacio publicado con nombre propio → institución derivada:
 *     slug = slugify(nombre), name = nombre tal cual lo publica Linda y url SOLO si el
 *     propio evento publica un enlace al sitio del espacio (tabla SPACE_SITE_HOSTS).
 *  4. Sin espacio identificable ("Varias Sedes", un barrio, una dirección, sin
 *     ubicación) → institución genérica de la agenda (GENERIC_INSTITUTION).
 *
 * Nunca se devuelve un slug desconocido sin `name`: el pipeline crea la institución
 * (resolveInstitution) con name/url si todavía no existe.
 */

export type SeedInstitutionSlug = 'teatro-colon' | 'complejo-teatral' | 'mnba' | 'palacio-libertad';

/** Host (sin "www.") → institución del seed. */
export const SEED_INSTITUTION_HOSTS: Readonly<Record<string, SeedInstitutionSlug>> = {
  'teatrocolon.org.ar': 'teatro-colon',
  'complejoteatral.gob.ar': 'complejo-teatral',
  'bellasartes.gob.ar': 'mnba',
  'palaciolibertad.gob.ar': 'palacio-libertad',
};

/** Institución de respaldo: quien publica el evento cuando no hay un espacio con nombre propio. */
export const GENERIC_INSTITUTION = {
  slug: 'agenda-ba',
  name: 'Agenda oficial de la Ciudad (Linda)',
  url: 'https://linda.buenosaires.gob.ar/',
} as const;

/**
 * Sitio propio de espacios frecuentes, comprobado en los `botonesSidebar` del fixture
 * 2026-10-14 (p. ej. Alianza Francesa → www.alianzafrancesa.org.ar/cultura/…). La URL
 * institucional se toma del enlace PUBLICADO en el evento (su origen), nunca de esta
 * tabla sola: si el evento no trae un enlace a ese host, no hay institutionUrl.
 * Clave = placeKey(nombre del espacio).
 */
export const SPACE_SITE_HOSTS: Readonly<Record<string, string>> = {
  'alianza francesa': 'alianzafrancesa.org.ar',
  'movistar arena': 'movistararena.com.ar',
  'usina del arte': 'usinadelarte.ar',
  'museo moderno': 'museomoderno.org',
  'centro cultural 25 de mayo': 'cc25.org',
  'fundacion proa': 'proa.org',
  'jardin japones': 'jardinjapones.org.ar',
};

export interface InstitutionRef {
  slug: string;
  /** Solo para instituciones que pueden no existir todavía (derivadas o genérica). */
  name?: string;
  url?: string;
  via: 'link' | 'place' | 'derived' | 'generic';
}

/** Host en minúsculas y sin "www."; null si no es una URL http(s). */
export function hostOf(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Primera institución del seed enlazada por los botones del evento. */
export function seedInstitutionFromLinks(uris: readonly string[]): SeedInstitutionSlug | null {
  for (const uri of uris) {
    const host = hostOf(uri);
    const slug = host ? SEED_INSTITUTION_HOSTS[host] : undefined;
    if (slug) return slug;
  }
  return null;
}

/** Origen ("https://www.alianzafrancesa.org.ar/") del primer enlace publicado al sitio del espacio. */
export function institutionUrlFromLinks(
  spaceKey: string,
  uris: readonly string[],
): string | undefined {
  const expected = SPACE_SITE_HOSTS[spaceKey];
  if (!expected) return undefined;
  for (const uri of uris) {
    if (hostOf(uri) !== expected) continue;
    const u = new URL(uri.trim());
    return `${u.protocol}//${u.host}/`;
  }
  return undefined;
}

/** Institución derivada de un espacio con nombre propio. */
export function derivedInstitution(
  spaceName: string,
  spaceKey: string,
  uris: readonly string[],
): InstitutionRef {
  const url = institutionUrlFromLinks(spaceKey, uris);
  return {
    slug: slugify(spaceName),
    name: spaceName,
    ...(url ? { url } : {}),
    via: 'derived',
  };
}

export function genericInstitution(): InstitutionRef {
  return {
    slug: GENERIC_INSTITUTION.slug,
    name: GENERIC_INSTITUTION.name,
    url: GENERIC_INSTITUTION.url,
    via: 'generic',
  };
}
