#!/usr/bin/env bash
# Pings Supabase to prevent the free-tier project from auto-pausing after 7
# days of inactivity. Checks keepalive_pings for a recent row (from either
# leg) and skips the insert if one exists within SKIP_WINDOW_HOURS.
#
# Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Optional env: TRIGGERED_BY (default: vm_cron)

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
TRIGGERED_BY="${TRIGGERED_BY:-vm_cron}"
SKIP_WINDOW_HOURS="${SKIP_WINDOW_HOURS:-20}"

auth_headers=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
)

latest_response=$(curl -fsS "${auth_headers[@]}" \
  "${SUPABASE_URL}/rest/v1/keepalive_pings?select=triggered_at&order=triggered_at.desc&limit=1")

latest_ts=$(echo "$latest_response" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
print(rows[0]['triggered_at'] if rows else '')
")

should_skip=false
if [ -n "$latest_ts" ]; then
  should_skip=$(python3 -c "
from datetime import datetime, timezone
latest = datetime.fromisoformat('$latest_ts'.replace('Z', '+00:00'))
age_hours = (datetime.now(timezone.utc) - latest).total_seconds() / 3600
print('true' if age_hours < ${SKIP_WINDOW_HOURS} else 'false')
")
fi

if [ "$should_skip" = "true" ]; then
  echo "Recent keepalive ping found (within ${SKIP_WINDOW_HOURS}h) — read alone counted as activity, skipping insert."
  exit 0
fi

curl -fsS -X POST "${auth_headers[@]}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"triggered_by\": \"${TRIGGERED_BY}\"}" \
  "${SUPABASE_URL}/rest/v1/keepalive_pings"

echo "Inserted keepalive ping (triggered_by=${TRIGGERED_BY})."
