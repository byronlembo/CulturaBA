#!/usr/bin/env bash
# Local PostgreSQL 16 cluster for CulturaBA development (no Docker needed).
#
#   pnpm db:init        create the cluster (idempotent)
#   pnpm db:start       start it on localhost:$CULTURABA_PGPORT (default 54329)
#   pnpm db:stop
#   pnpm db:status
#   pnpm db:reset       drop + create `culturaba`, apply auth stub + migrations + seed
#   pnpm db:reset-test  same for `culturaba_test` (used by integration tests)
#   pnpm db:types       regenerate packages/shared/src/db/database.types.ts
#   pnpm db:url         print the connection URL
#
# The same migration files are pushed unchanged to Supabase with `supabase db push`.
# Locally, supabase/tests/local_auth_stub.sql provides the pieces of the `auth`
# schema and the roles that Supabase ships out of the box.
#
# Postgres refuses to run as root. When this script is executed as root (e.g. in a
# cloud dev container) it runs the cluster as the unprivileged OS user $PG_OS_USER.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
if [ -z "$PGBIN" ] && command -v pg_ctl >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v pg_ctl)")"; fi
[ -n "$PGBIN" ] || { echo "pg-local: PostgreSQL binaries not found (set PGBIN)" >&2; exit 1; }

PGPORT="${CULTURABA_PGPORT:-54329}"
PG_OS_USER="${CULTURABA_PG_OS_USER:-pgdev}"
DB="${CULTURABA_DB:-culturaba}"
TEST_DB="${CULTURABA_TEST_DB:-culturaba_test}"

if [ "$(id -u)" = "0" ]; then
  id "$PG_OS_USER" >/dev/null 2>&1 || useradd -r -m -d "/home/$PG_OS_USER" -s /bin/bash "$PG_OS_USER"
  RUN=(runuser -u "$PG_OS_USER" --)
  DATA_HOME="/home/$PG_OS_USER/.culturaba"
else
  RUN=()
  DATA_HOME="${CULTURABA_PGDATA_HOME:-$HOME/.culturaba}"
fi
PGDATA="$DATA_HOME/pg16"
SOCKDIR="$DATA_HOME/run"
LOGFILE="$DATA_HOME/postgres.log"
URL="postgresql://postgres@localhost:$PGPORT/$DB"
TEST_URL="postgresql://postgres@localhost:$PGPORT/$TEST_DB"

psql_admin() { "$PGBIN/psql" -h localhost -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

cmd_init() {
  "${RUN[@]}" mkdir -p "$DATA_HOME" "$SOCKDIR"
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "pg-local: initdb → $PGDATA"
    "${RUN[@]}" "$PGBIN/initdb" -D "$PGDATA" -A trust -U postgres --no-locale -E UTF8 >/dev/null
    "${RUN[@]}" bash -c "cat >> '$PGDATA/postgresql.conf' <<EOF
port = $PGPORT
listen_addresses = 'localhost'
unix_socket_directories = '$SOCKDIR'
max_connections = 50
shared_buffers = 128MB
log_min_messages = warning
EOF"
  else
    echo "pg-local: cluster already initialised at $PGDATA"
  fi
}

cmd_start() {
  cmd_init
  if "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "pg-local: already running on port $PGPORT"
  else
    "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -w start >/dev/null
    echo "pg-local: started on port $PGPORT (log: $LOGFILE)"
  fi
}

cmd_stop() {
  if "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null
    echo "pg-local: stopped"
  else
    echo "pg-local: not running"
  fi
}

cmd_status() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status || true; }

apply_schema() {
  local target="$1"
  psql_admin -d postgres -qc "DROP DATABASE IF EXISTS \"$target\" WITH (FORCE)" >/dev/null
  psql_admin -d postgres -qc "CREATE DATABASE \"$target\"" >/dev/null
  echo "pg-local: applying auth stub + migrations + seed to $target"
  psql_admin -d "$target" -q -f "$ROOT/supabase/tests/local_auth_stub.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "  · $(basename "$f")"
    psql_admin -d "$target" -q -f "$f"
  done
  if [ -f "$ROOT/supabase/seed.sql" ]; then
    echo "  · seed.sql"
    psql_admin -d "$target" -q -f "$ROOT/supabase/seed.sql"
  fi
}

cmd_reset() { cmd_start; apply_schema "$DB"; echo "pg-local: $URL ready"; }
cmd_reset_test() { cmd_start; apply_schema "$TEST_DB"; echo "pg-local: $TEST_URL ready"; }

cmd_types() {
  cmd_start
  local out="$ROOT/packages/shared/src/db/database.types.ts"
  mkdir -p "$(dirname "$out")"
  (cd "$ROOT" && pnpm exec supabase gen types typescript --db-url "$URL" --schema public > "$out")
  echo "pg-local: wrote $out"
}

case "${1:-}" in
  init) cmd_init ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  reset) cmd_reset ;;
  reset-test) cmd_reset_test ;;
  types) cmd_types ;;
  url) echo "$URL" ;;
  test-url) echo "$TEST_URL" ;;
  *) echo "usage: $0 {init|start|stop|status|reset|reset-test|types|url|test-url}" >&2; exit 2 ;;
esac
