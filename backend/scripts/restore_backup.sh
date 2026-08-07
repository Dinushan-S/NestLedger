#!/usr/bin/env bash
# Restore a NestLedger backup dump into a Postgres/Supabase database.
#
# Usage:
#   ./restore_backup.sh /path/to/nestledger_YYYY-MM-DD.sql.gz TARGET_DB_URL
#
# Examples:
#   # Restore into a fresh scratch Supabase project to verify a backup:
#   ./restore_backup.sh /opt/backups/nestledger_2026-08-04.sql.gz "$SCRATCH_DB_URL"
#
# Caveats (same as backup.sh):
#   * The dump covers the `public` schema (app data) only — NOT Supabase-managed
#     auth.users. Full recovery = recreate project, re-apply supabase_schema.sql,
#     import this dump, then users re-auth.
#   * Do NOT restore over the live production DB — use a fresh/scratch project.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <backup.sql.gz> <target_db_url>" >&2
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB_URL="$2"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install the Postgres client first:" >&2
  echo "  sudo apt-get install -y postgresql-client" >&2
  exit 1
fi

echo "Restoring ${BACKUP_FILE} into target DB (this overwrites public schema data!)"
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "${CONFIRM}" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

# DROP the public schema to get a clean slate, recreate it, then import.
# Supabase requires the schema to exist and own RLS grants — re-apply the
# project schema first if the target is a fresh project.
psql "${TARGET_DB_URL}" -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
gunzip -c "${BACKUP_FILE}" | psql "${TARGET_DB_URL}"

echo "Restore complete. Verify row counts and re-apply supabase_schema.sql if needed."
