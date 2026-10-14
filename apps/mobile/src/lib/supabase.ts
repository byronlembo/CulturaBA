import type { Database } from '@culturaba/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient<Database> | null = null;

/** Cliente con la clave PUBLICABLE. Nunca la secreta. Null si no está configurado. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
