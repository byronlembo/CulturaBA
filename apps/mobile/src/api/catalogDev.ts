import {
  type CatalogApi,
  type EventPublicRow,
  type EventSourcePublicRow,
  mapEventDetail,
  mapEventSource,
  mapEventSummary,
  mapOccurrence,
  type OccurrencePublicRow,
} from './types';

/** Implementación contra packages/devapi (Postgres local). Mismas filas, mismo mapeo. */
export function createDevCatalog(baseUrl: string): CatalogApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const u = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== '') u.searchParams.set(k, v);
    const res = await fetch(u.toString());
    if (res.status === 404) throw Object.assign(new Error('not found'), { status: 404 });
    if (!res.ok) throw new Error(`API de desarrollo: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async listEvents(filters, page) {
      const rows = await get<EventPublicRow[]>('/events', {
        disciplines: filters.disciplines?.join(','),
        q: filters.q,
        from: filters.from,
        to: filters.to,
        free: filters.freeOnly ? '1' : undefined,
        limit: String(page.limit),
        offset: String(page.offset),
      });
      const items = rows.map(mapEventSummary);
      return { items, nextOffset: items.length < page.limit ? null : page.offset + page.limit };
    },
    async listEventsByIds(ids) {
      if (ids.length === 0) return [];
      return (await get<EventPublicRow[]>('/events/by-ids', { ids: ids.join(',') })).map(
        mapEventSummary,
      );
    },
    async getEvent(slugOrId) {
      try {
        return mapEventDetail(await get<EventPublicRow>(`/events/${encodeURIComponent(slugOrId)}`));
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },
    async listOccurrences(eventId) {
      return (await get<OccurrencePublicRow[]>(`/events/${eventId}/occurrences`)).map(
        mapOccurrence,
      );
    },
    async listEventSources(eventId) {
      return (await get<EventSourcePublicRow[]>(`/events/${eventId}/sources`)).map(mapEventSource);
    },
    async listCalendar(range, disciplines) {
      return (
        await get<OccurrencePublicRow[]>('/calendar', {
          from: range.from,
          to: range.to,
          disciplines: disciplines?.join(','),
        })
      ).map(mapOccurrence);
    },
    async getStats(eventId) {
      const r = await get<{ attending_count: number; recommend_count: number; save_count: number }>(
        `/stats/${eventId}`,
      );
      return { attending: r.attending_count, recommend: r.recommend_count, save: r.save_count };
    },
    async listSources() {
      const rows = await get<{ slug: string; name: string; base_url: string }[]>('/sources');
      return rows.map((s) => ({ slug: s.slug, name: s.name, baseUrl: s.base_url }));
    },
  };
}
