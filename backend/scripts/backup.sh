#!/usr/bin/env bash
# Daily logical backup of the Supabase `public` schema via pg_dump.
#
# Free-tier Supabase has no automated backups, so the VM runs this on a
# systemd timer (nestledger-backup.timer). It dumps + gzips to BACKUP_DIR,
# prunes local backups older than RETENTION_DAYS, and (optionally) uploads
# to a GCS bucket and prunes old objects there too.
#
# Required env: SUPABASE_DB_URL   (direct Postgres connection string; lives in
#                                  the repo `.env` and the GitHub ENV secret)
# Optional env:
#   BACKUP_DIR        (default: /opt/backups)
#   RETENTION_DAYS    (default: 7)
#   GCS_BACKUP_BUCKET (e.g. gs://nestledger-backups — enables gsutil upload)
#   TRIGGERED_BY      (default: vm_cron) — for audit logging
#
# Restore: see scripts/restore_backup.sh.
# Caveat: logical dump covers `public` app data only, not Supabase-managed
# auth.users — full recovery = recreate project, re-apply schema, import dump.

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TRIGGERED_BY="${TRIGGERED_BY:-vm_cron}"
GCS_BACKUP_BUCKET="${GCS_BACKUP_BUCKET:-}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install the Postgres client first:" >&2
  echo "  sudo apt-get install -y postgresql-client" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/nestledger_$(date +%F).sql.gz"

echo "[backup] triggered_by=${TRIGGERED_BY} retention_days=${RETENTION_DAYS}"

# Dump the public schema (app data), gzip on the fly, stream straight to disk.
# Pipefail is on, so a failed pg_dump aborts before we touch any retention.
pg_dump "${SUPABASE_DB_URL}" --schema=public --no-owner --no-privileges \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[backup] wrote ${BACKUP_FILE} (${SIZE})"

# Prune local dumps older than RETENTION_DAYS (always keep the newest one).
find "${BACKUP_DIR}" -name 'nestledger_*.sql.gz' -type f -mtime +"${RETENTION_DAYS}" \
  -delete -print | sed 's/^/[backup] pruned /'

# Optional: push off-box to Cloud Storage (gsutil ships with gcloud on GCP VMs).
if [ -n "${GCS_BACKUP_BUCKET}" ]; then
  if ! command -v gsutil >/dev/null 2>&1; then
    echo "ERROR: GCS_BACKUP_BUCKET is set but gsutil is not installed." >&2
    exit 1
  fi
  gsutil cp "${BACKUP_FILE}" "${GCS_BACKUP_BUCKET}/nestledger_$(date +%F).sql.gz"
  echo "[backup] uploaded to ${GCS_BACKUP_BUCKET}"

  # Prune bucket objects older than RETENTION_DAYS (based on object age).
  CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
    || date -u -v-${RETENTION_DAYS}d '+%Y-%m-%dT%H:%M:%SZ')
  gsutil ls "${GCS_BACKUP_BUCKET}/nestledger_*.sql.gz" 2>/dev/null | while read -r obj; do
    created=$(gsutil stat "${obj}" 2>/dev/null | awk -F': ' '/Creation time/ {print $2; exit}')
    if [ -n "${created}" ] && [ "$(printf '%s\n%s' "${created}" "${CUTOFF}" | sort | head -1)" = "${created}" ]; then
      echo "[backup] deleting stale object ${obj}"
      gsutil rm "${obj}"
    fi
  done
fi

echo "[backup] complete"
