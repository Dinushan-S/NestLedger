# NestLedger Memory

## Project summary

NestLedger is a shared family finance app with household profiles, budget plans, expenses, shopping lists, member invites, and notifications. Expo React Native frontend + Supabase (auth, Postgres, RLS, realtime) + FastAPI backend for invite emails (Brevo) and push fanout (Expo).

## Current implementation status

- Email auth via Supabase is live; schema + RLS in `backend/supabase_schema.sql`
- Budget, expense, shopping, members, invite, and notifications flows implemented
- Backend: FastAPI on a single GCP VM (`nestledger.dinushan.dev`), systemd-managed, nginx + certbot
- Multi-currency support shipped; dark-theme support shipped
- Frontend tests: 34/34 green (jest). Backend tests need `EXPO_BACKEND_URL`/frontend `.env` to run
- Data-integrity tests (`selectors.dataintegrity.test.ts`) cover borrow/repay netting, member owes, bill paid/pending, savings, cycle scoping, cent precision

## Dependencies & security (updated 2026-08-05)

- Backend: `fastapi==0.115.14` + `starlette 0.46.2` + `uvicorn==0.34.3` (bumped from 0.110.1/0.37.2/0.25.0 to fix CVEs)
- Frontend: `npm audit` now **16 moderate, 0 critical/high** (was 24 with 2 critical). postcss override pinned `8.5.25`. Remaining moderate are Expo build-chain only; clearing needs the breaking `expo@57` upgrade (deferred)
- ⚠️ **P0 PENDING (deferred on purpose):** `backend/.env` + `frontend/.env` exist in public git history (service-role key, DB password, SMTP/Brevo secrets). Removed from HEAD but fetchable. Must scrub history (`git filter-repo`) + confirm credential rotation **before public launch**. Not blocking local testing / closed beta. See `PRODUCTION_READINESS_AND_PREMORTEM.md` §P0.

## Operations (updated 2026-08-05)

- Deploy: GitHub Actions (`deploy-all.yml`) → SSH to VM → `git reset --hard origin/main` → systemd restart, with auto-rollback on failed health check
- Keepalive: `backend/scripts/keepalive.sh` via systemd timer `nestledger-keepalive.timer` (every 3 days) + GitHub Action
- Backups: `backend/scripts/backup.sh` (daily `pg_dump --schema=public` → `/opt/backups/`, 7-day retention, optional GCS upload via `GCS_BACKUP_BUCKET`) + `restore_backup.sh`, timer `nestledger-backup.timer` (02:00 UTC). **TODO: set `GCS_BACKUP_BUCKET` in ENV secret + run one scratch-project restore test**
- Realtime migration `migration_realtime_fix.sql` (budget_plans + profile_members in supabase_realtime publication) **applied to prod** (2026-08-05)
- Monitoring: UptimeRobot on `/api/health`, Sentry, GCP daily disk snapshots; rebuild runbook in `docs/SERVER_RECOVERY.md`

## Push notifications (diagnosis 2026-08-05)

- All notification paths set explicit titles; improved to per-type titles: "Budget updated", "New member joined", "Shopping list updated", "Shopping item bought" (backend `server.py` NOTIFICATION_TITLES + frontend `notificationTitles` in `nestledger.constants.ts` — keep in sync)
- "expo" title seen in local testing is **Expo Go dev behavior** (Expo Go's Android label is "expo"), not a code bug — test with a dev build (`npx expo run:android`) for accurate titles
- Real-device push/realtime validation (foreground/background/closed, 2 devices) still pending

## Frontend structure (refactor 2026-08-05)

- `NestLedgerApp.tsx` split: 4,618 → 3,323 lines (now ~3,209 after code-quality pass)
- `frontend/components/nestledger/nestledger.styles.ts` (static StyleSheet, ~950 lines)
- `frontend/components/nestledger/nestledger.ui.tsx` (presentational components incl. shared `SafeWrap`)
- `frontend/components/nestledger/nestledger.constants.ts` (form types, defaults, helpers, notification constants)
- `frontend/components/nestledger/hooks/useRealtimeChannel.ts` (channel subscribe/unsubscribe + notifications)
- Remaining: split main component by tab (P2, after device testing)

## Code quality pass (2026-08-07) — review history

Reviewed the NestLedger cleanup for correctness, clarity, architecture, tests. All changes behavior-preserving (token-level diff vs HEAD + string-value byte-equality + green suite).

Fixed findings:

- **Strict TS** — enabled `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes` in `frontend/tsconfig.json`; fixed all 65 surfaced errors (guarded `!` where invariants hold, `| undefined` prop/param widenings, destructure defaults `[hours = 0, minutes = 0]`, fetch `body: null`, conditional-spread `onPress`)
- **Complexity** — `buildCurrentPlanMonthStats` 18 → 12 decision points via `sumPrices` helper + `ensureBalance` closure + type-predicate filter; behavior pinned by `selectors.dataintegrity.test.ts`
- **Re-render churn** — `period`/`priorRange` in `AnalyseScreen` wrapped in `useMemo([cycle])`; cleared 3 `react-hooks/exhaustive-deps` warnings
- **Duplication removed** — shared `SafeWrap` (close outline+testID), `buildBorrowBalances` (borrow/repay netting), `tableCrud` factory (3 api crud × 3 methods); net −114 lines
- **Error visibility** — two intentional `console.warn` guards (reminder settings load, space-type migration flag); kept in prod (babel strips only log/info)
- **Sync test** — `nestledger.constants.test.ts` pins backend `NOTIFICATION_TITLES` contract

Green: `tsc --noEmit`, 34/34 jest, eslint 0 errors, `expo export` (android) bundles clean.

## Important commands

```bash
sudo systemctl restart nestledger          # restart backend on VM
sudo systemctl status nestledger --no-pager
journalctl -u nestledger -n 100            # backend logs
sudo systemctl list-timers                 # keepalive + backup timers
bash backend/scripts/backup.sh             # manual backup run (needs SUPABASE_DB_URL)
curl -f https://nestledger.dinushan.dev/api/health
```

## Important files

- `backend/server.py` — FastAPI app (invites, push fanout, health)
- `backend/supabase_schema.sql` — apply when initializing a fresh Supabase project
- `backend/migration_realtime_fix.sql`, `backend/migration_keepalive.sql`
- `backend/scripts/backup.sh`, `backend/scripts/restore_backup.sh`, `backend/scripts/keepalive.sh`
- `frontend/components/nestledger/NestLedgerApp.tsx` (+ `nestledger.styles.ts`, `nestledger.ui.tsx`, `nestledger.constants.ts`)
- `.github/workflows/deploy-all.yml`, `supabase-keepalive.yml`
- `PRODUCTION_READINESS_AND_PREMORTEM.md` — canonical pending/blocker list

## Handoff notes

- Product backlog: `memory/PRD.md`; business docs in `docs/`; test reports in `test_reports/`
- Backend invitation tests: `backend/tests/` (need `EXPO_BACKEND_URL` env or `frontend/.env` `EXPO_PUBLIC_BACKEND_URL`)
- Test accounts used during validation are temporary test data

## Config placeholders (env: `.env` + GitHub `ENV` secret)

- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
- Brevo/SMTP sender + password, EXPO_BACKEND_URL, ALLOWED_ORIGINS, APP_PUBLIC_URL
- `GCS_BACKUP_BUCKET` — set for off-box backups (recommended)

## Known issues / follow-up (pending list)

1. **P0 secret leak** — deferred; scrub history + rotate creds before public launch
2. Real-device + CI test validation (test Supabase project, GH secrets, 2-device push/realtime)
3. iOS pipeline — Apple/Codemagic setup (TestFlight)
4. Store-console paperwork — privacy disclosures + legal review
5. `expo@57` upgrade (clears remaining moderate npm vulns)
6. Further `NestLedgerApp.tsx` split by tab
7. Set `GCS_BACKUP_BUCKET` + run one restore test
