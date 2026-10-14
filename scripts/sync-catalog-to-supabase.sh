#!/usr/bin/env bash
# Carga INICIAL del catálogo: copia las tablas de catálogo e ingestión del Postgres
# local al proyecto de Supabase usando la Management API (HTTPS), para entornos sin
# salida TCP a Postgres. El cron de GitHub Actions (ingest.yml) continúa después desde
# ese estado porque se copian también source_records / ingestion_runs.
#
#   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_URL=https://<ref>.supabase.co \
#   bash scripts/sync-catalog-to-supabase.sh --yes
#
#   # Ensayo completo contra otra base local (mismo volcado, mismos bloques, vía psql):
#   bash scripts/sync-catalog-to-supabase.sh --yes --to-local postgresql://…/otra_base
#
# ⚠ Reemplaza el contenido de esas tablas en el destino (TRUNCATE … CASCADE). No toca
#   disciplines ni las tablas de usuario salvo por la cascada de user_event_actions,
#   notifications y reminders (acciones sobre eventos que dejan de existir). Pensado para
#   la primera carga; después, el cron escribe directo en Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

CONFIRM=""
TO_LOCAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) CONFIRM=1 ;;
    --to-local) TO_LOCAL="${2:?--to-local necesita una URL}"; shift ;;
    *) echo "argumento desconocido: $1" >&2; exit 2 ;;
  esac
  shift
done

LOCAL_URL="${LOCAL_DATABASE_URL:-$(bash "$ROOT/scripts/pg-local.sh" url)}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
if [ -n "$TO_LOCAL" ]; then
  TARGET="$TO_LOCAL"
else
  : "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN (personal access token)}"
  : "${SUPABASE_URL:?Falta SUPABASE_URL}"
  REF="$(echo "$SUPABASE_URL" | sed -E 's#https?://([a-z0-9]+)\.supabase\.co.*#\1#')"
  API="https://api.supabase.com/v1/projects/$REF/database/query"
  TARGET="proyecto $REF"
fi
[ -n "$CONFIRM" ] || { echo "Agregá --yes para confirmar el reemplazo del catálogo en $TARGET" >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

TABLES=(institutions venues sources events event_disciplines occurrences ingestion_runs source_records event_changes event_duplicates event_stats)

run_sql() { # $1 = archivo SQL → destino (Supabase por HTTPS o una base local por psql)
  if [ -n "$TO_LOCAL" ]; then
    "$PGBIN/psql" "$TO_LOCAL" -q -v ON_ERROR_STOP=1 -X -f "$1" > "$WORK/r.json"
    return
  fi
  python3 -I -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1], encoding="utf8").read()}))' "$1" > "$WORK/q.json"
  local code
  code=$(curl -sS --max-time 300 -o "$WORK/r.json" -w "%{http_code}" -X POST "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @"$WORK/q.json")
  if [ "${code:0:1}" != "2" ]; then echo "✖ http $code: $(head -c 500 "$WORK/r.json")" >&2; return 1; fi
}

echo "1/5 volcado local → $WORK/dump.sql"
args=()
for t in "${TABLES[@]}"; do args+=(--table="public.$t"); done
# Una fila por INSERT: algunos source_records traen el HTML crudo (≤ 200 KB) y los bloques
# tienen que poder cortarse entre filas.
"$PGBIN/pg_dump" "$LOCAL_URL" --data-only --inserts --no-owner --no-privileges "${args[@]}" > "$WORK/dump.sql"

echo "2/5 partiendo en bloques de ~400 KB (antes de tocar el destino)"
python3 -I - "$WORK/dump.sql" "$WORK" <<'EOF'
import sys, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sql = src.read_text(encoding='utf8')

def statements(text):
    """Separa en sentencias respetando literales '...' (pg_dump duplica las comillas
    internas) y saltea comentarios -- y metacomandos de psql fuera de literales."""
    buf, i, n, in_quote, line_start = [], 0, len(text), False, True
    while i < n:
        c = text[i]
        if not in_quote and line_start and (text.startswith('--', i) or c == '\\'):
            j = text.find('\n', i)
            i = n if j < 0 else j + 1
            continue
        buf.append(c)
        if c == "'":
            in_quote = not in_quote
        elif c == ';' and not in_quote:
            stmt = ''.join(buf).strip()
            if stmt:
                yield stmt
            buf = []
        line_start = (c == '\n')
        i += 1
    rest = ''.join(buf).strip()
    if rest:
        raise SystemExit(f'volcado truncado o literal sin cerrar: {rest[:120]!r}')

keep = [s for s in statements(sql)
        if not s.upper().startswith('SET ') and not s.startswith('SELECT pg_catalog.set_config')]
inserts = sum(1 for s in keep if s.startswith('INSERT'))
chunks, buf, size = [], [], 0
for s in keep:
    if size + len(s) > 400_000 and buf:
        chunks.append('\n'.join(buf)); buf, size = [], 0
    buf.append(s); size += len(s)
if buf: chunks.append('\n'.join(buf))
for i, c in enumerate(chunks, 1):
    # replica: sin triggers ni chequeos de FK mientras se copian valores ya consistentes.
    (out / f'chunk-{i:03d}.sql').write_text(
        'set session_replication_role = replica;\n' + c + '\nset session_replication_role = origin;\n',
        encoding='utf8')
print(f'   sentencias: {len(keep)} ({inserts} INSERT) · bloques: {len(chunks)}')
EOF

echo "3/5 truncando tablas en el destino ($TARGET)"
echo "truncate table $(printf 'public.%s, ' "${TABLES[@]}" | sed 's/, $//') cascade;" > "$WORK/truncate.sql"
run_sql "$WORK/truncate.sql"

echo "4/5 enviando bloques"
for f in "$WORK"/chunk-*.sql; do printf '   %s ' "$(basename "$f")"; run_sql "$f" && echo ok; done

echo "5/5 verificación (local vs destino)"
cat > "$WORK/verify.sql" <<'EOF'
select 'events' as t, count(*)::int as n from public.events
union all select 'published', count(*)::int from public.events where status = 'published'
union all select 'occurrences', count(*)::int from public.occurrences
union all select 'source_records', count(*)::int from public.source_records
union all select 'ingestion_runs', count(*)::int from public.ingestion_runs
union all select 'institutions', count(*)::int from public.institutions
union all select 'venues', count(*)::int from public.venues
order by 1;
EOF
echo "   local:"
"$PGBIN/psql" "$LOCAL_URL" -X -At -F ' ' -f "$WORK/verify.sql" | sed 's/^/     /'
echo "   destino:"
if [ -n "$TO_LOCAL" ]; then
  "$PGBIN/psql" "$TO_LOCAL" -X -At -F ' ' -f "$WORK/verify.sql" | sed 's/^/     /'
else
  run_sql "$WORK/verify.sql" && python3 -I -c 'import json,sys; [print("     %s %s" % (r["t"], r["n"])) for r in json.load(open(sys.argv[1]))]' "$WORK/r.json"
fi
