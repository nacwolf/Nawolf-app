#!/bin/bash
# Local dev: Postgres + migrations + api-server (8081) + kostr (3003).
# Ctrl-C stops both servers.
set -e
cd "$(dirname "$0")/.."
export LC_ALL=en_US.UTF-8
# The app must not connect as a superuser: superusers skip row-level security.
export DATABASE_URL=${DATABASE_URL:-postgresql://kostr_app@localhost:5432/kostr_dev}

pg_isready -q || pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/pg16.log start
psql -d postgres -tAc "select 1 from pg_roles where rolname='kostr_app'" | grep -q 1 \
  || psql -d postgres -c "create role kostr_app login nosuperuser nobypassrls"
psql -d postgres -tAc "select 1 from pg_database where datname='kostr_dev'" | grep -q 1 \
  || createdb -O kostr_app kostr_dev
pnpm --filter @workspace/db run migrate

trap 'kill $(jobs -p) 2>/dev/null' EXIT
CLERK_DEV_MOCK=1 PORT=8081 pnpm --filter @workspace/api-server run dev &
PORT=3003 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_dev_mock_do_not_use pnpm --filter @workspace/kostr run dev &
wait
