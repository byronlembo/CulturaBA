import { slugify, type VenueRef } from '@culturaba/shared';
import { insertVenue, listVenues, type VenueRow } from '../db/repo';
import type { Queryable } from '../db/sql';

/** Caché de venues por corrida: resuelve slugs conocidos y crea venues nuevos solo con dirección de la fuente. */
export class VenueResolver {
  private bySlug = new Map<string, VenueRow>();
  private byInstitutionName = new Map<string, VenueRow>();

  static async load(db: Queryable): Promise<VenueResolver> {
    const r = new VenueResolver();
    for (const v of await listVenues(db)) r.add(v);
    return r;
  }

  get knownSlugs(): ReadonlySet<string> {
    return new Set(this.bySlug.keys());
  }

  private add(v: VenueRow): void {
    this.bySlug.set(v.slug, v);
    this.byInstitutionName.set(nameKey(v.institution_id, v.name), v);
  }

  /** Devuelve el id del venue o null si no se puede resolver sin inventar datos. */
  async resolve(
    db: Queryable,
    ref: VenueRef | null,
    ctx: { institutionId: string; institutionSlug: string; sourceUrl: string },
  ): Promise<{ venueId: string | null; room: string | null }> {
    if (!ref) return { venueId: null, room: null };
    const room = ref.room ?? null;

    if (ref.slug) {
      const known = this.bySlug.get(ref.slug);
      return { venueId: known ? known.id : null, room };
    }

    const existing = this.byInstitutionName.get(nameKey(ctx.institutionId, ref.name));
    if (existing) return { venueId: existing.id, room };

    if (!ref.address) return { venueId: null, room };

    const base = `${ctx.institutionSlug}-${slugify(ref.name, 40)}`;
    let slug = base;
    let i = 2;
    while (this.bySlug.has(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    const created = await insertVenue(db, {
      slug,
      institutionId: ctx.institutionId,
      name: ref.name,
      address: ref.address,
      addressSourceUrl: ref.addressSourceUrl ?? ctx.sourceUrl,
    });
    this.add(created);
    return { venueId: created.id, room };
  }
}

function nameKey(institutionId: string | null, name: string): string {
  return `${institutionId ?? ''}|${name.trim().toLowerCase()}`;
}
