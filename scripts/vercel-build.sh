#!/usr/bin/env bash
# Build de la web export para Vercel (vercel.json → buildCommand). Valores públicos por
# diseño: la clave publicable solo lee lo que permite RLS.
set -euo pipefail
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://ioyaejccerbfczpjgstg.supabase.co}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-sb_publishable_GnQMCCghtslfRX0u13km4Q_E-8GMKxv}"
export EXPO_PUBLIC_WEB_BASE_URL="${EXPO_PUBLIC_WEB_BASE_URL:-https://${VERCEL_PROJECT_PRODUCTION_URL:-culturaba.vercel.app}}"
pnpm --filter @culturaba/mobile export:web
