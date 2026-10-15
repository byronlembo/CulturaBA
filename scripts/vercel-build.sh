#!/usr/bin/env bash
# Build de la web export para Vercel (vercel.json → buildCommand). Valores públicos por
# diseño: la clave publicable solo lee lo que permite RLS.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "vercel-build: $(pwd) · node $(node --version) · pnpm $(pnpm --version)"
[ -d node_modules ] || { echo "vercel-build: falta node_modules (¿falló el install?)" >&2; exit 1; }
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://ioyaejccerbfczpjgstg.supabase.co}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-sb_publishable_GnQMCCghtslfRX0u13km4Q_E-8GMKxv}"
export EXPO_PUBLIC_WEB_BASE_URL="${EXPO_PUBLIC_WEB_BASE_URL:-https://culturaba.xn--lembodiseo-19a.com}"
echo "vercel-build: exportando la web contra ${EXPO_PUBLIC_SUPABASE_URL}"
pnpm --filter @culturaba/mobile export:web
echo "vercel-build: listo ($(ls apps/mobile/dist | tr '\n' ' '))"
