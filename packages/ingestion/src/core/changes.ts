import { cleanDescription, type NormalizedEvent } from '@culturaba/shared';
import type { ChangeInput, EventFields, EventRow } from '../db/repo';

/** Campos editoriales que se comparan y la severidad del cambio. */
const EDITORIAL_FIELDS: { key: keyof EventFields; severity: 'major' | 'minor' | 'silent' }[] = [
  { key: 'title', severity: 'major' },
  { key: 'subtitle', severity: 'silent' },
  { key: 'description', severity: 'minor' },
  { key: 'description_html', severity: 'silent' },
  { key: 'description_attribution', severity: 'silent' },
  { key: 'primary_discipline', severity: 'silent' },
  { key: 'image_url', severity: 'minor' },
  { key: 'image_source', severity: 'silent' },
  { key: 'image_credit', severity: 'silent' },
  { key: 'official_url', severity: 'minor' },
  { key: 'tickets_url', severity: 'minor' },
  { key: 'price_text', severity: 'minor' },
  { key: 'price_verified', severity: 'silent' },
  { key: 'is_free', severity: 'minor' },
  { key: 'language', severity: 'silent' },
  { key: 'duration_minutes', severity: 'silent' },
  { key: 'age_rating', severity: 'silent' },
  { key: 'tags', severity: 'silent' },
];

export function eventFieldsFromNormalized(n: NormalizedEvent, dedupKeyValue: string): EventFields {
  return {
    title: n.title,
    subtitle: n.subtitle ?? null,
    // Sin la entrada repetida ni el título repetido (ver cleanDescription).
    description: n.description
      ? cleanDescription(n.description, [n.title, n.subtitle]) || null
      : null,
    description_html: n.descriptionHtml ?? null,
    description_attribution: n.attribution,
    primary_discipline: n.disciplines[0] ?? null,
    image_url: n.imageUrl ?? null,
    image_source: n.imageUrl ? 'source' : 'fallback',
    image_credit: n.imageCredit ?? null,
    official_url: n.officialUrl,
    tickets_url: n.ticketsUrl ?? null,
    price_text: n.priceText ?? null,
    price_verified: n.priceVerified,
    is_free: n.isFree ?? null,
    language: n.language ?? null,
    duration_minutes: n.durationMinutes ?? null,
    age_rating: n.ageRating ?? null,
    tags: n.tags,
    dedup_key: dedupKeyValue,
  };
}

function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * Calcula el patch a aplicar sobre un evento existente y los cambios a registrar.
 * Fuente primaria (o de mayor prioridad): sobrescribe. Secundaria: solo rellena nulos.
 * En eventos con varias fuentes, la primaria no borra con vacíos lo que aportó otra.
 */
export function diffEventFields(
  existing: EventRow,
  incoming: EventFields,
  isPrimary: boolean,
  opts: {
    /**
     * El evento también lo describen otras fuentes: un campo vacío en la primaria significa
     * "esta fuente no lo dice" y no borra lo que aportó otra (si no, se pisan en cada corrida).
     */
    keepOthersWhenEmpty?: boolean;
  } = {},
): { patch: Partial<EventFields>; changes: ChangeInput[] } {
  const patch: Partial<EventFields> = {};
  const changes: ChangeInput[] = [];

  for (const { key, severity } of EDITORIAL_FIELDS) {
    const before = existing[key as keyof EventRow] as unknown;
    const after = incoming[key] as unknown;
    if (equal(before, after)) continue;
    const isEmpty =
      before === null || before === undefined || (Array.isArray(before) && before.length === 0);
    if (!isPrimary && !isEmpty) continue;
    const afterEmpty =
      after === null || after === undefined || (Array.isArray(after) && after.length === 0);
    if (!isPrimary && afterEmpty) continue;
    if (isPrimary && afterEmpty && opts.keepOthersWhenEmpty) continue;
    if (isPrimary && after === null && key === 'image_url') {
      // La fuente dejó de publicar imagen: pasamos a fallback.
      (patch as Record<string, unknown>)[key] = null;
      patch.image_source = 'fallback';
    } else {
      (patch as Record<string, unknown>)[key] = after;
    }
    if (severity !== 'silent' && !isEmpty) {
      changes.push({
        eventId: existing.id,
        type: 'field_changed',
        severity,
        field: key,
        oldValue: before,
        newValue: after,
      });
    }
  }

  if (patch.title !== undefined) patch.dedup_key = incoming.dedup_key;
  return { patch, changes };
}
