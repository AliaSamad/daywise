#!/usr/bin/env bash
# Verifies the migration, RLS policies, the no-overlap constraint and apply_plan against a
# throwaway PostgreSQL database (no Supabase needed).
#   PGURL=postgres://postgres@localhost:5432/postgres ./scripts/test-db.sh
set -euo pipefail
PGURL="${PGURL:-postgres://postgres@localhost:5432/postgres}"
DB="daywise_test_$$"
cd "$(dirname "$0")/.."
psql "$PGURL" -qc "create database $DB"
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
psql "$PGURL" -q -v ON_ERROR_STOP=1 \
  -c "\\connect $DB" \
  -f supabase/tests/supabase_stub.sql \
  -f supabase/migrations/20261026000000_init.sql \
  -f supabase/tests/rls_test.sql
echo "Database tests passed."
