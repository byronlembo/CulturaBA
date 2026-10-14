import type { NormalizedEvent, NormalizedOccurrence } from './normalized';

/**
 * Motivos por los que un registro queda como `candidate` en lugar de `published`.
 * Se guardan en events.candidate_reasons para que el revisor sepa qué falta.
 */
export type CandidateReason =
  | 'missing:title'
  | 'missing:occurrences'
  | 'missing:future_occurrence'
  | 'missing:venue'
  | 'missing:discipline'
  | 'missing:official_url';

export interface PublishabilityOptions {
  /** Instante de referencia (ISO o epoch ms). */
  now: string | number | Date;
  /** Slugs de venues existentes en la base; un venue se resuelve por slug o por nombre+dirección. */
  knownVenueSlugs?: ReadonlySet<string>;
}

export interface PublishabilityResult {
  publishable: boolean;
  reasons: CandidateReason[];
}

const MIN_TITLE_LENGTH = 3;

function toEpochMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

/** Último instante en el que la ocurrencia todavía "vale": fin si lo hay, si no el inicio. */
export function occurrenceEndsAtMs(o: NormalizedOccurrence): number {
  return Date.parse(o.endsAt ?? o.startsAt);
}

export function isFutureOccurrence(o: NormalizedOccurrence, nowMs: number): boolean {
  return occurrenceEndsAtMs(o) >= nowMs;
}

export function isVenueResolvable(
  venue: NormalizedOccurrence['venue'],
  knownVenueSlugs?: ReadonlySet<string>,
): boolean {
  if (!venue) return false;
  if (venue.slug && (knownVenueSlugs === undefined || knownVenueSlugs.has(venue.slug))) return true;
  return Boolean(venue.name && venue.address);
}

/**
 * Decide si un evento normalizado tiene lo mínimo para publicarse. No completa
 * nada: si falta un dato obligatorio, el registro espera revisión.
 *
 * Obligatorio: título ≥ 3 caracteres, al menos una ocurrencia vigente con fecha
 * parseable y venue resoluble, al menos una disciplina y la URL oficial.
 * Opcional (nunca bloquea, nunca se inventa): descripción, imagen, precio.
 */
export function assessPublishability(
  event: NormalizedEvent,
  options: PublishabilityOptions,
): PublishabilityResult {
  const nowMs = toEpochMs(options.now);
  const reasons: CandidateReason[] = [];

  if (event.title.trim().length < MIN_TITLE_LENGTH) reasons.push('missing:title');

  if (event.occurrences.length === 0) {
    reasons.push('missing:occurrences');
  } else {
    const future = event.occurrences.filter((o) => isFutureOccurrence(o, nowMs));
    if (future.length === 0) {
      reasons.push('missing:future_occurrence');
    } else if (!future.some((o) => isVenueResolvable(o.venue, options.knownVenueSlugs))) {
      reasons.push('missing:venue');
    }
  }

  if (event.disciplines.length === 0) reasons.push('missing:discipline');
  if (!event.officialUrl) reasons.push('missing:official_url');

  return { publishable: reasons.length === 0, reasons };
}
