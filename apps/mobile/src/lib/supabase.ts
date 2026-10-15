import type { Database } from '@culturaba/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
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
        // Web: el enlace del email de cuenta vuelve con la sesión en la URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return client;
}
