import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useApi, useCatalog } from '@/api/context';
import type {
  CatalogFilters,
  Occurrence,
  UserAction,
  UserActionRecord,
  UserApi,
} from '@/api/types';
import { usePreferences } from '@/store/preferences';
import { isUpcomingChange } from './calendar/planChanges';

const PAGE = 20;

export const keys = {
  feed: (f: CatalogFilters) => ['events', f] as const,
  event: (slug: string) => ['event', slug] as const,
  occurrences: (id: string) => ['occurrences', id] as const,
  sources: (id: string) => ['event-sources', id] as const,
  stats: (id: string) => ['stats', id] as const,
  calendar: (from: string, to: string, d: string[]) => ['calendar', from, to, d] as const,
  byIds: (ids: string[]) => ['events-by-ids', ids] as const,
  actions: ['my-actions'] as const,
  diary: ['my-diary'] as const,
  catalogSources: ['catalog-sources'] as const,
};

export function useEventsInfinite(filters: CatalogFilters, enabled = true) {
  const catalog = useCatalog();
  return useInfiniteQuery({
    queryKey: keys.feed(filters),
    queryFn: ({ pageParam }) => catalog.listEvents(filters, { offset: pageParam, limit: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled,
  });
}

export function useEvent(slug: string) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.event(slug),
    queryFn: () => catalog.getEvent(slug),
    enabled: Boolean(slug),
  });
}

export function useOccurrences(eventId: string | undefined) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.occurrences(eventId ?? ''),
    queryFn: () => catalog.listOccurrences(eventId ?? ''),
    enabled: Boolean(eventId),
  });
}

/** Funciones canceladas, postergadas o reprogramadas de los eventos dados (mismo caché que la ficha). */
export function usePlanChanges(eventIds: string[]): Occurrence[] {
  const catalog = useCatalog();
  return useQueries({
    queries: eventIds.map((id) => ({
      queryKey: keys.occurrences(id),
      queryFn: () => catalog.listOccurrences(id),
    })),
    combine: (results) => results.flatMap((r) => (r.data ?? []).filter((o) => isUpcomingChange(o))),
  });
}

export function useEventSources(eventId: string | undefined) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.sources(eventId ?? ''),
    queryFn: () => catalog.listEventSources(eventId ?? ''),
    enabled: Boolean(eventId),
  });
}

export function useStats(eventId: string | undefined) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.stats(eventId ?? ''),
    queryFn: () => catalog.getStats(eventId ?? ''),
    enabled: Boolean(eventId),
    staleTime: 30_000,
  });
}

export function useCalendar(from: string, to: string, disciplines: string[]) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.calendar(from, to, disciplines),
    queryFn: () => catalog.listCalendar({ from, to }, disciplines.length ? disciplines : undefined),
  });
}

export function useEventsByIds(ids: string[]) {
  const catalog = useCatalog();
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: keys.byIds(sorted),
    queryFn: () => catalog.listEventsByIds(sorted),
    enabled: sorted.length > 0,
  });
}

export function useCatalogSources() {
  const catalog = useCatalog();
  return useQuery({
    queryKey: keys.catalogSources,
    queryFn: () => catalog.listSources(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// ── Usuario: intereses y acciones ───────────────────────────────────────────

export function useMyActions() {
  const { user } = useApi();
  return useQuery({
    queryKey: [...keys.actions, user.id],
    queryFn: () => user.listActions(),
    staleTime: 0,
  });
}

export function useHasAction(eventId: string | undefined, action: UserAction): boolean {
  const { data } = useMyActions();
  return Boolean(eventId && data?.some((a) => a.eventId === eventId && a.action === action));
}

/** Toggle idempotente y reversible con actualización optimista de la lista y los conteos. */
export function useToggleAction(eventId: string | undefined) {
  const { user } = useApi();
  const qc = useQueryClient();
  const actionsKey = [...keys.actions, user.id];
  return useMutation({
    mutationFn: async ({ action, next }: { action: UserAction; next: boolean }) => {
      if (!eventId) return;
      if (next) await user.addAction(eventId, action);
      else await user.removeAction(eventId, action);
    },
    onMutate: async ({ action, next }) => {
      if (!eventId) return;
      await qc.cancelQueries({ queryKey: actionsKey });
      const previous = qc.getQueryData<UserActionRecord[]>(actionsKey) ?? [];
      const without = previous.filter((a) => !(a.eventId === eventId && a.action === action));
      qc.setQueryData<UserActionRecord[]>(
        actionsKey,
        next ? [{ eventId, action, createdAt: new Date().toISOString() }, ...without] : without,
      );
      const statsKey = keys.stats(eventId);
      const prevStats = qc.getQueryData<{ attending: number; recommend: number; save: number }>(
        statsKey,
      );
      if (prevStats && user.kind === 'supabase') {
        qc.setQueryData(statsKey, {
          ...prevStats,
          [action]: Math.max(0, prevStats[action] + (next ? 1 : -1)),
        });
      }
      return { previous, prevStats };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(actionsKey, ctx.previous);
      if (ctx?.prevStats && eventId) qc.setQueryData(keys.stats(eventId), ctx.prevStats);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: actionsKey });
      if (eventId) void qc.invalidateQueries({ queryKey: keys.stats(eventId) });
    },
  });
}

/**
 * Intereses: el store local responde al instante; la API (local o Supabase) se
 * sincroniza detrás. Al cambiar de usuario (sesión anónima lista) se reconcilia.
 */
export function useInterests() {
  const { user } = useApi();
  const interests = usePreferences((s) => s.interests);
  const setLocal = usePreferences((s) => s.setInterests);
  const qc = useQueryClient();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconciliar solo al cambiar de proveedor de usuario
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await user.getInterests().catch(() => null);
      if (cancelled || remote === null) return;
      if (remote.length === 0 && interests.length > 0) {
        await user.setInterests(interests).catch(() => {});
      } else if (remote.length > 0 && remote.join() !== interests.join()) {
        setLocal(remote);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setInterests = useCallback(
    async (next: string[]) => {
      setLocal(next);
      await user.setInterests(next).catch(() => {});
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    [user, setLocal, qc],
  );

  return { interests, setInterests };
}

// ── Diario ──────────────────────────────────────────────────────────────────

export function useDiary() {
  const { user } = useApi();
  return useQuery({ queryKey: [...keys.diary, user.id], queryFn: () => user.listDiary() });
}

/** Alta, edición o baja de una entrada; refresca el diario al terminar. */
export function useDiaryMutation() {
  const { user } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: (u: UserApi) => Promise<void>) => change(user),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.diary }),
  });
}
