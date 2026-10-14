import type { Database } from '@culturaba/shared';
import { stripDiacritics } from '@culturaba/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CatalogApi,
  type CatalogFilters,
  mapEventDetail,
  mapEventSource,
  mapEventSummary,
  mapOccurrence,
  UUID_RE,
} from './types';

/** Implementación contra PostgREST de Supabase, leyendo solo vistas públicas con la clave anon. */
export function createSupabaseCatalog(supabase: SupabaseClient<Database>): CatalogApi {
  return {
    async listEvents(filters: CatalogFilters, page) {
      let q = supabase.from('v_events_public').select('*').not('next_starts_at', 'is', null);
      if (filters.disciplines?.length) q = q.overlaps('disciplines', filters.disciplines);
      if (filters.q?.trim()) {
        q = q.textSearch('search_tsv', stripDiacritics(filters.q.trim()), {
          type: 'websearch',
          config: 'spanish',
        });
      }
      if (filters.from) q = q.gte('last_ends_at', `${filters.from}T00:00:00-03:00`);
      if (filters.to) q = q.lt('next_starts_at', `${filters.to}T23:59:59.999-03:00`);
      if (filters.freeOnly) q = q.eq('is_free', true);
      const { data, error } = await q
        .order('next_starts_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page.offset, page.offset + page.limit - 1);
      if (error) throw new Error(error.message);
      const items = (data ?? []).map(mapEventSummary);
      return { items, nextOffset: items.length < page.limit ? null : page.offset + page.limit };
    },

    async listEventsByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('v_events_public').select('*').in('id', ids);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapEventSummary);
    },

    async getEvent(slugOrId) {
      const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';
      const { data, error } = await supabase
        .from('v_events_public')
        .select('*')
        .eq(column, slugOrId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapEventDetail(data) : null;
    },

    async listOccurrences(eventId) {
      const { data, error } = await supabase
        .from('v_occurrences_public')
        .select('*')
        .eq('event_id', eventId)
        .order('starts_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapOccurrence);
    },

    async listEventSources(eventId) {
      const { data, error } = await supabase
        .from('v_event_sources_public')
        .select('*')
        .eq('event_id', eventId)
        .order('last_seen_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapEventSource);
    },

    async listCalendar(range, disciplines) {
      let q = supabase
        .from('v_occurrences_public')
        .select('*')
        .lte('start_date', range.to)
        .gte('end_date', range.from)
        .neq('status', 'cancelled');
      if (disciplines?.length) q = q.overlaps('disciplines', disciplines);
      const { data, error } = await q.order('starts_at', { ascending: true }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapOccurrence);
    },

    async getStats(eventId) {
      const { data, error } = await supabase
        .from('event_stats')
        .select('attending_count, recommend_count, save_count')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        attending: data?.attending_count ?? 0,
        recommend: data?.recommend_count ?? 0,
        save: data?.save_count ?? 0,
      };
    },

    async listSources() {
      const { data, error } = await supabase
        .from('sources')
        .select('slug, name, base_url')
        .eq('enabled', true)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []).map((s) => ({ slug: s.slug, name: s.name, baseUrl: s.base_url }));
    },
  };
}
