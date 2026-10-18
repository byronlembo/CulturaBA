import { htmlToText, stripDiacriticsLower, type VenueRef } from '@culturaba/shared';

/**
 * Sede y salas de la Usina del Arte → VenueRef.
 *
 *  · Venue seed `usina-del-arte` (supabase/seed.sql) con la dirección PUBLICADA por el
 *    sitio: "Agustín R. Caffarena 1, C1157 Cdad. Autónoma de Buenos Aires" (cabecera de
 *    todas las páginas, /contacto/ y el bloque "Dirección" de cada actividad). El sitio no
 *    publica coordenadas (solo un enlace corto de Google Maps): no se geocodifica.
 *  · Sala = término de la taxonomía `sala` del REST (respaldo: bloque "Espacio" del detalle).
 *  · Si el detalle publica OTRA dirección, la actividad es fuera de la Usina:
 *    {name, address, addressSourceUrl} con el texto literal; sin nombre → sin venue.
 */

export const USINA_VENUE: VenueRef = { slug: 'usina-del-arte', name: 'Usina del Arte' };

/** Texto literal del sitio (bloque "Dirección" del detalle y /contacto/). */
export const USINA_PUBLISHED_ADDRESS =
  'Agustín R. Caffarena 1, C1157 Cdad. Autónoma de Buenos Aires';

/**
 * Términos `sala` (17 al 18-oct-2026; slug → nombre de sala en CulturaBA). `null` = el
 * término no nombra una sala sino todo el edificio. Un término nuevo se usa con su nombre
 * literal (es un espacio del sitio de la Usina) y deja un aviso para sumarlo acá.
 */
export const SALA_ROOMS: Readonly<Record<string, string | null>> = {
  auditorio: 'Auditorio',
  'sala-de-camara': 'Sala de Cámara',
  'salon-mayor': 'Salón Mayor',
  foyer: 'Foyer',
  'hall-central': 'Hall Central',
  'patio-central': 'Patio Central',
  'sala-laberinto': 'Sala Laberinto',
  'aula-visuales': 'Aula Visuales',
  'espacio-creativo-2do-piso': 'Espacio Creativo (2do. piso)',
  'ludo-espacio-2do-piso': 'Ludo-Espacio (2do. piso)',
  '2do-piso': '2do. piso',
  'sala-de-escape': 'Sala de escape',
  // Dos términos para el mismo espacio infantil (sin uso hoy).
  iupiiii: 'iUpiiiii',
  iupiiiii: 'iUpiiiii',
  // Dos términos para la plaza exterior del edificio.
  'plaza-usina': 'Plaza Usina',
  'la-plaza-de-la-usina': 'Plaza Usina',
  'todos-los-espacios': null,
};

export interface SalaTerm {
  slug: string;
  name: string;
}

export function placeKey(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Agustín R. Caffarena 1, C1157 …" (con o sin acentos/abreviaturas) → true. */
export function isUsinaAddress(text: string | null | undefined): boolean {
  return /\bcaffarena 1\b/.test(placeKey(text ?? ''));
}

/** Nombre de sala para el texto del bloque "Espacio" (respaldo cuando no hay término). */
const ROOM_BY_PLACE_KEY: ReadonlyMap<string, string | null> = new Map(
  Object.entries(SALA_ROOMS).map(([slug, room]) => [placeKey(slug.replace(/-/g, ' ')), room]),
);

export interface RoomResolution {
  /** Sala dentro de la Usina (undefined = todo el edificio o sin dato). */
  room?: string;
  /** Hay al menos una sala de la Usina (conocida o nueva) que respalda la sede. */
  inUsina: boolean;
  warnings: string[];
}

export function roomFor(salas: readonly SalaTerm[], espacioText: string | null): RoomResolution {
  const warnings: string[] = [];
  const rooms: string[] = [];
  let inUsina = false;
  for (const sala of salas) {
    inUsina = true;
    const name = htmlToText(sala.name).trim();
    if (!(sala.slug in SALA_ROOMS)) {
      warnings.push(`sala '${name}' (${sala.slug}) sin mapeo: se usa el nombre publicado`);
      if (name) rooms.push(name);
      continue;
    }
    const room = SALA_ROOMS[sala.slug];
    if (room) rooms.push(room);
  }
  if (salas.length === 0 && espacioText) {
    const key = placeKey(espacioText);
    const room = ROOM_BY_PLACE_KEY.get(key);
    inUsina = true;
    if (room === undefined) {
      warnings.push(
        `espacio '${espacioText}' sin término sala ni mapeo: se usa el texto publicado`,
      );
      rooms.push(espacioText);
    } else if (room) {
      rooms.push(room);
    }
  }
  const unique = [...new Set(rooms)];
  return unique.length > 0
    ? { room: unique.join(' / '), inUsina, warnings }
    : { inUsina, warnings };
}

export interface VenueInput {
  salas: readonly SalaTerm[];
  /** Bloque "Espacio" del detalle (texto). */
  espacioText: string | null;
  /** Bloque "Dirección" del detalle (texto). */
  addressText: string | null;
  /** URL del detalle (fuente de una dirección distinta de la de la Usina). */
  detailUrl: string;
}

export interface VenueResolution {
  venue: VenueRef | null;
  warnings: string[];
}

export function venueFor(input: VenueInput): VenueResolution {
  const r = roomFor(input.salas, input.espacioText);
  const warnings = [...r.warnings];
  const withRoom = (base: VenueRef): VenueRef => (r.room ? { ...base, room: r.room } : base);

  if (input.addressText) {
    if (isUsinaAddress(input.addressText)) return { venue: withRoom(USINA_VENUE), warnings };
    // Otra dirección publicada: actividad fuera del edificio.
    const name = input.espacioText ?? (input.salas[0] ? htmlToText(input.salas[0].name) : null);
    if (!name) {
      warnings.push(
        `dirección '${input.addressText}' sin nombre de espacio: sin venue (queda candidato)`,
      );
      return { venue: null, warnings };
    }
    warnings.push(`actividad fuera de la Usina: '${name}', ${input.addressText}`);
    return {
      venue: { name, address: input.addressText, addressSourceUrl: input.detailUrl },
      warnings,
    };
  }

  if (r.inUsina) {
    warnings.push('detalle sin bloque "Dirección": sede Usina del Arte por la sala publicada');
    return { venue: withRoom(USINA_VENUE), warnings };
  }
  warnings.push('sin dirección ni sala publicadas: sin venue (queda candidato)');
  return { venue: null, warnings };
}
