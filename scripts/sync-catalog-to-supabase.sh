#!/usr/bin/env bash
# Carga INICIAL del catálogo: copia las tablas de catálogo e ingestión del Postgres
# local al proyecto de Supabase usando la Management API (HTTPS), para entornos sin
# salida TCP a Postgres. El cron de GitHub Actions (ingest.yml) continúa después desde
# ese estado porque se copian también source_records / ingestion_runs.
#
#   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_URL=https://<ref>.supabase.co \
#   bash scripts/sync-catalog-to-supabase.sh --yes
#
# ⚠ Reemplaza el contenido remoto de esas tablas (TRUNCATE … CASCADE). No toca
#   disciplines ni las tablas de usuario salvo por la cascada de user_event_actions
#   (acciones sobre eventos que dejan de existir). Pensado para la primera carga.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

: "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN (personal access token)}"
: "${SUPABASE_URL:?Falta SUPABASE_URL}"
LOCAL_URL="${LOCAL_DATABASE_URL:-$(bash "$ROOT/scripts/pg-local.sh" url)}"
REF="$(echo "$SUPABASE_URL" | sed -E 's#https?://([a-z0-9]+)\.supabase\.co.*#\1#')"
API="https://api.supabase.com/v1/projects/$REF/database/query"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
WORK="$(mktemp -d)"

[ "${1:-}" = "--yes" ] || { echo "Agregá --yes para confirmar el reemplazo del catálogo remoto en $REF" >&2; exit 2; }

TABLES=(institutions venues sources events event_disciplines occurrences ingestion_runs source_records event_changes event_duplicates event_stats)

sbq() { # $1 = archivo SQL
  python3 -I -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1], encoding="utf8").read()}))' "$1" > "$WORK/q.json"
  local code
  code=$(curl -sS --max-time 300 -o "$WORK/r.json" -w "%{http_code}" -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @"$WORK/q.json")
  if [ "${code:0:1}" != "2" ]; then echo "✖ http $code: $(head -c 500 "$WORK/r.json")" >&2; return 1; fi
}

echo "1/4 volcado local → $WORK/dump.sql"
args=()
for t in "${TABLES[@]}"; do args+=(--table="public.$t"); done
"$PGBIN/pg_dump" "$LOCAL_URL" --data-only --inserts --rows-per-insert=100 --no-owner --no-privileges "${args[@]}" > "$WORK/dump.sql"
grep -c "^INSERT" "$WORK/dump.sql" | xargs -I{} echo "   sentencias INSERT: {}"

echo "2/4 truncando tablas remotas"
{
  echo "truncate table $(printf 'public.%s, ' "${TABLES[@]}" | sed 's/, $//') cascade;"
} > "$WORK/truncate.sql"
sbq "$WORK/truncate.sql"

echo "3/4 enviando en bloques"
# Triggers de updated_at y de stats no interfieren; se copian los valores tal cual.
# Partimos el volcado en bloques de ~400 KB cortando solo en límites de sentencia.
python3 -I - "$WORK/dump.sql" "$WORK" <<'EOF'
import sys, re, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sql = src.read_text(encoding='utf8')
# quitar comandos psql y SETs de sesión que no aplican
lines = [l for l in sql.splitlines() if not l.startswith('\\') and not l.startswith('SET ') and not l.startswith('SELECT pg_catalog.set_config')]
stmts, cur = [], []
for l in lines:
    cur.append(l)
    if l.endswith(');') or l.endswith(';') and not l.startswith('INSERT'):
        stmts.append('\n'.join(cur)); cur = []
if cur: stmts.append('\n'.join(cur))
chunks, buf, size = [], [], 0
for s in stmts:
    if size + len(s) > 400_000 and buf:
        chunks.append('\n'.join(buf)); buf, size = [], 0
    buf.append(s); size += len(s)
if buf: chunks.append('\n'.join(buf))
for i, c in enumerate(chunks, 1):
    (out / f'chunk-{i:03d}.sql').write_text('set session_replication_role = replica;\n' + c + '\nset session_replication_role = origin;\n', encoding='utf8')
print(f'   bloques: {len(chunks)}')
EOF
for f in "$WORK"/chunk-*.sql; do printf '   %s ' "$(basename "$f")"; sbq "$f" && echo ok; done

echo "4/4 verificación remota"
cat > "$WORK/verify.sql" <<'EOF'
select 'events' as t, count(*)::int as n from public.events
union all select 'published', count(*)::int from public.events where status = 'published'
union all select 'occurrences', count(*)::int from public.occurrences
union all select 'source_records', count(*)::int from public.source_records
union all select 'ingestion_runs', count(*)::int from public.ingestion_runs;
EOF
sbq "$WORK/verify.sql" && cat "$WORK/r.json" && echo
rm -rf "$WORK"
