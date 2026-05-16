# NestLedger Production-Grade Check

Date: 2026-05-17
Branch: `codex/p0-production-readiness`
Latest main included: `66d25d7 feat(ui): enhance bill and savings trackers with monthly filtering and stats`

## Verdict

NestLedger is better than the previous pass, but it is still not fully production-grade for public release.

The frontend static quality gates now pass after fixing the new bill tracker hook-order issue introduced by the latest main update. Security hardening and dependency audit checks are also in a better state. The backend pytest blocker has a CI path now, but the test result is still pending until the GitHub workflow runs with configured secrets and seeded users. The remaining release blockers are external validation gates: backend pytest cannot run on this machine because Python is not installed, full app regression has not been executed, and real Android/iOS push delivery has not been validated on physical devices.

## Gates Run

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| Clean install | `npm.cmd ci` | Passed | 961 packages installed from `package-lock.json`. |
| TypeScript | `node node_modules\typescript\bin\tsc --noEmit` | Passed | No TypeScript errors. |
| ESLint | `node node_modules\eslint\bin\eslint.js .` | Passed | No ESLint errors or warnings after hook-order fix. |
| Dependency audit | `npm.cmd audit --audit-level=moderate` | Passed | 0 vulnerabilities. |
| Expo dependency check | `npx.cmd expo install --check` | Passed | Dependencies are up to date. |
| Expo Doctor | `npx.cmd expo-doctor` | Passed | 17/17 checks passed. |
| Backend pytest | `py -0p`, `python --version`, `python3 --version` | Pending CI | No Python runtime is installed locally. Added `.github/workflows/backend-tests.yml` so pytest can run in GitHub Actions with Python 3.11. |

## Issues Found In This Pass

### P0: Backend pytest pending CI execution

The backend test gate cannot pass locally because Python is not installed in this workstation. The repository now includes `.github/workflows/backend-tests.yml`, which installs Python 3.11, installs backend dependencies, validates required secrets, runs `pytest backend/tests`, and uploads a JUnit report.

Required next step:
Configure GitHub secrets `EXPO_BACKEND_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`; confirm seeded users and primary profile membership exist; then run the backend test workflow. Alternatively, install Python 3.11+ locally and run `pytest backend/tests`.

### P0: Full production regression still not executed

The report is still missing a fresh end-to-end or structured manual regression pass across signup, signin, profiles, budgets, expenses, shopping, borrow/repay, bills, savings, invites, notifications, and realtime two-session refresh.

Required next step:
Run the full P0 regression matrix and record pass/fail/blocker evidence in `test_reports/`.

### P0: Real-device push validation still not complete

Push notification readiness cannot be accepted until Android and iOS preview builds are installed on physical devices and validated outside Expo Go.

Required next step:
Create preview builds, validate permission prompt, project ID detection, token registration, logout/login token behavior, fanout actions, and foreground/background/closed-app delivery.

### P1: Release workflow consistency risk fixed

The frontend is now npm-based and `frontend/yarn.lock` is removed. `.github/workflows/deploy-all.yml` has been updated to run `npm ci` for the Android build job, keeping CI aligned with `package-lock.json`.

Required next step:
Run the workflow once in GitHub Actions after secrets are configured. Store submission remains out of scope for this pre-release check.

## Fix Applied During This Check

The latest main update introduced an ESLint production blocker in `frontend/components/nestledger/BillTracker.tsx`:

- `useMemo` was called conditionally through `stats?.paid ?? useMemo(...)`.
- This violates React hook ordering and failed `react-hooks/rules-of-hooks`.

Fix:

- Always compute the memoized fallback values.
- Use `stats` only when selecting the final displayed totals.
- Removed one unused `monthStart` variable in `frontend/components/nestledger/NestLedgerApp.tsx`.
- Added `.github/workflows/backend-tests.yml` for the pending backend pytest gate.
- Updated `.github/workflows/deploy-all.yml` to use `npm ci` instead of Yarn.
- Updated backend test fixtures to load `.env` files from the repository path and fail setup problems instead of skipping them.

## Production Decision

Do not mark the app production-ready yet.

The current code is closer to pre-release quality because TypeScript, ESLint, npm audit, Expo dependency checks, and Expo Doctor are green. However, a production-grade release still requires backend pytest, full P0 regression evidence, and real-device Android/iOS push validation.
