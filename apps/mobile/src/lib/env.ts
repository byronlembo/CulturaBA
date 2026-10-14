import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { webBaseUrl?: string };

/** Solo variables EXPO_PUBLIC_* llegan al bundle; se leen como literales. */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  devApiUrl: process.env.EXPO_PUBLIC_DEV_API_URL ?? '',
  apiModeOverride: process.env.EXPO_PUBLIC_API_MODE ?? '',
  webBaseUrl:
    process.env.EXPO_PUBLIC_WEB_BASE_URL ??
    extra.webBaseUrl ??
    'https://culturaba.xn--lembodiseo-19a.com',
};

export type ApiMode = 'supabase' | 'dev' | 'unconfigured';

export function resolveApiMode(e: typeof env = env): ApiMode {
  if (e.apiModeOverride === 'dev' && e.devApiUrl) return 'dev';
  if (e.supabaseUrl && e.supabaseAnonKey) return 'supabase';
  if (e.devApiUrl) return 'dev';
  return 'unconfigured';
}
