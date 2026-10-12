#!/bin/bash
# Local dev: Postgres + api-server (8081) + kostr (3003). Ctrl-C stops both servers.
set -e
cd "$(dirname "$0")/.."
export LC_ALL=en_US.UTF-8
export DATABASE_URL=${DATABASE_URL:-postgresql://localhost:5432/kostr}
pg_isready -q || pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/pg16.log start
trap 'kill 0' EXIT
PORT=8081 pnpm --filter @workspace/api-server run dev &
PORT=3003 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_test_dev_mock_do_not_use pnpm --filter @workspace/kostr run dev &
wait
