#!/usr/bin/env bash
#
# The whole system, end to end: a real Postgres with the real schema, the real
# production build of the app, and a real browser clicking through it.
#
# Only Supabase's HTTP layer is stood in for (supabase-shim.mjs) — a hosted
# Supabase needs Docker to run locally. Everything that decides whether this
# system is correct is real: the SQL, the policies, the triggers, the React.
#
#   bash e2e/run.sh
#
# Requires Postgres 16 on PATH and a non-root user to run it as (initdb
# refuses to run as root). Rebuilds the app unless SKIP_BUILD=1.
set -uo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$PWD"
PG="/usr/lib/postgresql/16/bin"
SOCK=/tmp/pgsock
DATA=/tmp/pgtest
PORT_SHIM=54321
PORT_APP=3210
RUN_AS="${E2E_USER:-claude}"

say() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

cleanup() {
  fuser -k $PORT_SHIM/tcp 2>/dev/null
  fuser -k $PORT_APP/tcp 2>/dev/null
}
trap cleanup EXIT

say "postgres"
if ! su "$RUN_AS" -c "$PG/pg_isready -h $SOCK -p 55432" >/dev/null 2>&1; then
  rm -rf $DATA $SOCK
  mkdir -p $SOCK && chown "$RUN_AS" $SOCK && chmod 777 $SOCK
  su "$RUN_AS" -c "$PG/initdb -D $DATA -U postgres --auth=trust" >/dev/null 2>&1
  su "$RUN_AS" -c "$PG/pg_ctl -D $DATA -o '-p 55432 -k $SOCK' -l /tmp/pg.log start" >/dev/null 2>&1
  sleep 2
fi

# a clean database every run: the flows create people and trainings, and a
# second pass over the same rows would test something other than what it says
say "schema"
fuser -k $PORT_SHIM/tcp 2>/dev/null
sleep 1
su "$RUN_AS" -c "$PG/dropdb -h $SOCK -p 55432 -U postgres --if-exists hapak" 2>/dev/null
su "$RUN_AS" -c "$PG/createdb -h $SOCK -p 55432 -U postgres hapak"
su "$RUN_AS" -c "$PG/psql -h $SOCK -p 55432 -U postgres -d hapak -q -f '$APP_DIR/supabase/tests/00_supabase_stubs.sql'" >/dev/null 2>&1
su "$RUN_AS" -c "$PG/psql -h $SOCK -p 55432 -U postgres -d hapak -q --single-transaction -f '$APP_DIR/supabase/setup.sql'" 2>&1 | grep -i error | head -5

# GoTrue keeps the email and the app metadata on the auth user; the local stub
# of auth.users has only the id, so the shim's two columns are added here
su "$RUN_AS" -c "$PG/psql -h $SOCK -p 55432 -U postgres -d hapak -qc \"
  alter table auth.users add column if not exists email text unique;
  alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
  grant usage on schema auth to postgres, authenticated, anon;\"" >/dev/null

echo "  $(su "$RUN_AS" -c "$PG/psql -h $SOCK -p 55432 -U postgres -d hapak -qtAc 'select count(*) from people'") people, $(su "$RUN_AS" -c "$PG/psql -h $SOCK -p 55432 -U postgres -d hapak -qtAc 'select count(*) from teams'") teams"

say "supabase shim"
node e2e/supabase-shim.mjs $PORT_SHIM "postgres://postgres@/hapak?host=$SOCK&port=55432" \
  > /tmp/shim.log 2>&1 &
sleep 2
head -1 /tmp/shim.log

export NEXT_PUBLIC_SUPABASE_URL="http://localhost:$PORT_SHIM"
export NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key
export SUPABASE_SERVICE_ROLE_KEY=e2e-service-role-key
export PIN_PEPPER=e2e-pepper-value
export AUTH_DERIVE_SECRET=e2e-derive-secret
export CRON_SECRET=e2e-cron-secret

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  say "build"
  npm run build 2>&1 | grep -E "✓ Compiled|Error" | head -3
fi

say "app"
fuser -k $PORT_APP/tcp 2>/dev/null
sleep 1
npx next start -p $PORT_APP > /tmp/next-e2e.log 2>&1 &
for _ in $(seq 1 30); do
  curl -sS -o /dev/null "http://localhost:$PORT_APP/login" 2>/dev/null && break
  sleep 1
done
curl -sS "http://localhost:$PORT_APP/api/health" | head -c 120; echo

say "flows"
node e2e/flows.mjs "http://localhost:$PORT_APP"
FLOWS=$?

# the same system from every chair, on the data the flows just created
say "roles"
node e2e/roles.mjs "http://localhost:$PORT_APP"
ROLES=$?

# and what each of them can take through the API, with the screen out of the way
say "attack"
node e2e/attack.mjs "http://localhost:$PORT_APP" "http://localhost:$PORT_SHIM" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
ATTACK=$?

exit $(( FLOWS + ROLES + ATTACK ))
