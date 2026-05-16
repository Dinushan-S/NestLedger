# NestLedger Production-Grade Check

Date: 2026-05-17
Branch: `codex/p0-production-readiness`
Latest main included: `66d25d7 feat(ui): enhance bill and savings trackers with monthly filtering and stats`

## Verdict

NestLedger is better than the previous pass, but it is still not fully production-grade for public release.

The frontend static quality gates now pass after fixing the new bill tracker hook-order issue introduced by the latest main update. Security hardening and dependency audit checks are also in a better state. Backend pytest now passes in GitHub Actions against the PR backend. The remaining release blockers are external validation gates: full app regression has not been executed, and real Android/iOS push delivery has not been validated on physical devices.

## Gates Run

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| Clean install | `npm.cmd ci` | Passed | 961 packages installed from `package-lock.json`. |
| TypeScript | `node node_modules\typescript\bin\tsc --noEmit` | Passed | No TypeScript errors. |
| ESLint | `node node_modules\eslint\bin\eslint.js .` | Passed | No ESLint errors or warnings after hook-order fix. |
| Dependency audit | `npm.cmd audit --audit-level=moderate` | Passed | 0 vulnerabilities. |
| Expo dependency check | `npx.cmd expo install --check` | Passed | Dependencies are up to date. |
| Expo Doctor | `npx.cmd expo-doctor` | Passed | 17/17 checks passed. |
| Backend pytest | GitHub Actions `pytest backend/tests` | Passed | 5 tests passed, 0 failures, 0 skipped in 8.461s. Artifact: `backend_pytest_results.xml`. |

## Issues Found In This Pass

### P0: Backend pytest passed

The backend test gate passed in GitHub Actions. The workflow installed Python 3.11, installed backend dependencies, started the branch backend on `127.0.0.1:8001`, validated required secrets, ran `pytest backend/tests`, and uploaded a JUnit report.

Evidence:
5 backend tests passed with 0 failures and 0 skipped.

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
- Updated backend CI to test the PR backend locally instead of the deployed production backend.
- Added `INVITE_EMAIL_DELIVERY=disabled` support for CI so invitation creation and accept-flow tests do not depend on SMTP availability.
- Made invitation send resilient: if SMTP delivery fails, the invite record and shareable link still return successfully with `email_delivered: false`.

## Production Decision

Do not mark the app production-ready yet.

The current code is closer to pre-release quality because TypeScript, ESLint, npm audit, Expo dependency checks, Expo Doctor, and backend pytest are green. However, a production-grade release still requires full P0 regression evidence and real-device Android/iOS push validation.
