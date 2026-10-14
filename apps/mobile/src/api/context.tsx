import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { env, resolveApiMode } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createDevCatalog } from './catalogDev';
import { createSupabaseCatalog } from './catalogSupabase';
import type { CatalogApi, UserApi } from './types';
import { createLocalUserApi } from './userLocal';
import { createSupabaseUserApi } from './userSupabase';

export interface ApiContextValue {
  mode: 'supabase' | 'dev' | 'unconfigured';
  catalog: CatalogApi | null;
  user: UserApi;
  /** true mientras se intenta la sesión anónima. */
  sessionPending: boolean;
  sessionError: string | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/**
 * Decide el origen de datos una sola vez por arranque:
 *  · supabase: catálogo vía PostgREST; usuario vía sesión anónima (si falla, local).
 *  · dev: catálogo vía packages/devapi; usuario local.
 *  · unconfigured: sin catálogo; la UI muestra cómo configurar.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const mode = useMemo(() => resolveApiMode(), []);
  const supabase = useMemo(() => (mode === 'supabase' ? getSupabase() : null), [mode]);
  const [userApi, setUserApi] = useState<UserApi>(() => createLocalUserApi());
  const [sessionPending, setSessionPending] = useState(mode === 'supabase');
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let session = data.session;
        if (!session) {
          const { data: anon, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          session = anon.session;
        }
        if (!cancelled && session?.user)
          setUserApi(createSupabaseUserApi(supabase, session.user.id));
      } catch (err) {
        if (!cancelled) setSessionError((err as Error).message);
      } finally {
        if (!cancelled) setSessionPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const catalog = useMemo<CatalogApi | null>(() => {
    if (mode === 'supabase' && supabase) return createSupabaseCatalog(supabase);
    if (mode === 'dev') return createDevCatalog(env.devApiUrl);
    return null;
  }, [mode, supabase]);

  const value = useMemo<ApiContextValue>(
    () => ({ mode, catalog, user: userApi, sessionPending, sessionError }),
    [mode, catalog, userApi, sessionPending, sessionError],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi fuera de ApiProvider');
  return ctx;
}

export function useCatalog(): CatalogApi {
  const { catalog } = useApi();
  if (!catalog) throw new Error('Catálogo no configurado');
  return catalog;
}
