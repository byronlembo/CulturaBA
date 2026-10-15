import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { env, resolveApiMode } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createDevCatalog } from './catalogDev';
import { createSupabaseCatalog } from './catalogSupabase';
import type { CatalogApi, UserApi } from './types';
import { createLocalUserApi } from './userLocal';
import { createSupabaseUserApi } from './userSupabase';

export interface Account {
  email: string | null;
  isAnonymous: boolean;
}

export interface ApiContextValue {
  mode: 'supabase' | 'dev' | 'unconfigured';
  catalog: CatalogApi | null;
  user: UserApi;
  /** Sesión de Supabase: invitado (anónima) o cuenta con email. Null sin Supabase. */
  account: Account | null;
  /** true mientras se intenta la sesión anónima. */
  sessionPending: boolean;
  sessionError: string | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/**
 * Decide el origen de datos una sola vez por arranque:
 *  · supabase: catálogo vía PostgREST; usuario vía sesión (anónima si no hay cuenta; si falla, local).
 *  · dev: catálogo vía packages/devapi; usuario local.
 *  · unconfigured: sin catálogo; la UI muestra cómo configurar.
 * Sigue los cambios de sesión (crear cuenta, entrar con otra, cerrar sesión).
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const mode = useMemo(() => resolveApiMode(), []);
  const supabase = useMemo(() => (mode === 'supabase' ? getSupabase() : null), [mode]);
  const [userApi, setUserApi] = useState<UserApi>(() => createLocalUserApi());
  const [account, setAccount] = useState<Account | null>(null);
  const [sessionPending, setSessionPending] = useState(mode === 'supabase');
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const startGuest = async () => {
      const { error } = await supabase.auth.signInAnonymously();
      if (error && !cancelled) {
        setSessionError(error.message);
        setSessionPending(false);
      }
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const u = session?.user;
      if (u) {
        setAccount({ email: u.email || null, isAnonymous: u.is_anonymous ?? false });
        setUserApi((prev) => (prev.id === u.id ? prev : createSupabaseUserApi(supabase, u.id)));
        setSessionError(null);
        setSessionPending(false);
      } else {
        // Sin sesión (primer arranque o cerró sesión): invitado nuevo. Diferido porque
        // supabase-js no admite llamadas de auth dentro de este callback.
        setAccount(null);
        setTimeout(() => void startGuest(), 0);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const catalog = useMemo<CatalogApi | null>(() => {
    if (mode === 'supabase' && supabase) return createSupabaseCatalog(supabase);
    if (mode === 'dev') return createDevCatalog(env.devApiUrl);
    return null;
  }, [mode, supabase]);

  const value = useMemo<ApiContextValue>(
    () => ({ mode, catalog, user: userApi, account, sessionPending, sessionError }),
    [mode, catalog, userApi, account, sessionPending, sessionError],
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
