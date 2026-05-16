# NestLedger P0 Implementation Plan

## Scope

This plan covers the production-readiness work excluding the complete production release pipeline.

Skipped for now:

- Android/iOS production build workflow
- Google Play submission
- App Store/TestFlight submission
- EAS auto-submit workflow

Included in this plan:

- Full production regression testing
- Backend CORS security hardening
- Debug logging cleanup
- Push notification real-device validation
- Small QA bug fix
- Frontend maintainability preparation

## Fresh Repo Rescan Notes

A fresh scan was completed before implementation. Git currently shows only planning/documentation files as untracked:

- `P0_IMPLEMENTATION_PLAN.md`
- `PRODUCTION_RELEASE_PLAN.md`
- `busibessd.md`

No source-code diff is currently visible in this worktree. However, the current app surface includes newer flows that are not fully reflected in the older PRD/test report:

- Borrow from budget
- Repay to budget
- Member-level borrow balance calculation
- Shopping item bought flow that creates a linked budget expense
- Unbought flow that can delete the linked expense
- Daily reminder scheduling stored in `AsyncStorage`

These flows must be included in regression before production hardening is considered complete.

## Main Branch Rescan Notes

`origin/main` was fetched and checked after the billing/savings update.

The latest main branch includes:

```text
9f37e0e feat(nestledger): add bill tracking and savings management
```

New files/features on `main`:

- `backend/migration_bills_savings.sql`
- `frontend/components/nestledger/BillTracker.tsx`
- `frontend/components/nestledger/SavingsTracker.tsx`
- New Supabase tables:
  - `recurring_bills`
  - `bill_payments`
  - `savings`
- New frontend API modules:
  - `billApi`
  - `savingsApi`

Production notes from the rescan:

- Bill payments can create linked budget expenses.
- Savings withdrawals can create linked budget expenses.
- Savings deposits and withdrawals trigger member notifications.
- Billing and savings need stable `testID` coverage before reliable E2E automation.
- Realtime subscriptions should be validated for `bill_payments` and `savings`; the app currently refreshes after local mutations, but second-device updates need proof.
- The standalone billing/savings migration creates policies without `drop policy if exists`; reruns after partial application may fail. Check this before production rollout.

## Regression Check Status

Full production regression testing was attempted first. Frontend validation is now runnable after reinstalling dependencies, but complete production regression still cannot be fully completed from this local environment because backend Python and real-device push validation are unavailable here.

### Commands Attempted

```bash
npm.cmd ci
npm.cmd audit --audit-level=moderate
npm.cmd audit fix
npm.cmd run lint
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
py -0p
```

### Current Results

- Frontend dependencies install cleanly with `npm.cmd ci`.
- TypeScript passes with `node node_modules\typescript\bin\tsc --noEmit`.
- ESLint passes with 0 errors and 0 warnings after the follow-up hook dependency cleanup.
- Debug log scan now finds no production app logging; only `frontend/scripts/reset-project.js` logs remain.
- Shopping typo scan confirms `shoppong` no longer exists.
- Wildcard backend CORS scan confirms `allow_origins=["*"]` no longer exists.
- `npm.cmd audit fix` upgraded `@xmldom/xmldom` from `0.8.12` to `0.8.13` and removed the high-severity audit finding.
- `npm.cmd audit --audit-level=moderate` still reports 4 moderate PostCSS findings through Expo. The only npm-suggested fix is `npm audit fix --force`, which would install `expo@49.0.23` and should be treated as a dependency migration rather than an automatic production hotfix.
- Backend tests cannot run locally because Python is not installed in this workstation environment.

### Regression Decision

The frontend local checks are restored and the P0 code fixes can proceed. Full production regression is still not complete until backend pytest, E2E workflows, and real-device push validation run in a prepared environment.

The current result should be treated as:

> Frontend static validation passed; full production regression remains partially blocked by environment/device coverage.

## Execution Status

### Completed In This Pass

- Synced this worktree to latest `main`, including the billing and savings feature commit.
- Restored frontend dependency installation.
- Fixed the shopping quantity test id typo from `shoppong-quantity-input` to `shopping-quantity-input`.
- Added stable `testID` selectors to billing and savings flows.
- Removed production-path frontend debug logging for expense payloads, realtime payloads, user/session details, and detailed error dumps.
- Hardened backend CORS to use `ALLOWED_ORIGINS` and `APP_PUBLIC_URL` instead of wildcard origins.
- Documented `ALLOWED_ORIGINS` in `README.md`.
- Made the billing/savings standalone migration safer to rerun after partial application by dropping policies before recreating them.
- Added `recurring_bills` to Supabase realtime publication setup.
- Added realtime refresh coverage for `recurring_bills`, `bill_payments`, and `savings`.
- Removed several unused calculations from `NestLedgerApp.tsx` to reduce lint noise.
- Updated lockfiles through `npm.cmd audit fix` to resolve the high-severity `@xmldom/xmldom` finding.

### Still Open Before Production

- Run backend pytest in an environment with Python installed.
- Run full E2E regression for auth, household, budget, shopping, borrow/repay, billing, savings, invite, notifications, and member flows.
- Validate Android and iOS push delivery on real devices.
- Refactor `NestLedgerApp.tsx` after regression is stable; it is still too large for comfortable production maintenance even though the current hook warnings are resolved.

### Completed In Follow-Up Pass

- Resolved the remaining Expo/PostCSS audit issue without `npm audit fix --force`.
- Added an npm override/resolution for `postcss@8.5.10`.
- Updated Expo SDK 54 patch packages to the versions expected by Expo validation.
- Added the missing `expo-font` peer dependency required by `@expo/vector-icons`.
- Removed the invalid `expo.cli` field from `frontend/app.json`; `cli.appVersionSource` remains in `frontend/eas.json`.
- Standardized frontend package management on npm by keeping `package-lock.json` and removing the stale Yarn lockfile.
- Fixed the remaining React hook dependency warnings in `NestLedgerApp.tsx`.
- Added a fresh pre-release production report at `test_reports/pre_release_production_2026-05-16.json`.
- Added a real-device push validation template at `test_reports/pre_release_push_validation_template.md`.

### Follow-Up Pass Verification

- `npm.cmd ci`: passed.
- `npm.cmd audit --audit-level=moderate`: passed with 0 vulnerabilities.
- `npx.cmd expo install --check`: passed.
- `npx.cmd expo-doctor`: passed 17/17 checks.
- `node node_modules\typescript\bin\tsc --noEmit`: passed.
- `node node_modules\eslint\bin\eslint.js .`: passed with 0 warnings.
- `py -0p`: blocked because no Python runtime is installed on this workstation.

## Phase 1: Restore Test Environment

### Goal

Make the local environment capable of running backend and frontend validation.

### Tasks

1. Cleanly reinstall frontend dependencies.
2. Confirm `node_modules/.bin` contains required commands:
   - `expo`
   - `tsc`
   - `eslint`
3. Confirm Python is installed and accessible.
4. Install backend dependencies in a virtual environment.
5. Confirm environment variables required for backend tests are available.

### Commands To Run

Frontend:

```bash
cd frontend
npm ci
npm run lint
node node_modules/typescript/bin/tsc --noEmit
```

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pytest
```

### Acceptance Criteria

- Frontend dependencies install cleanly.
- Frontend lint runs.
- TypeScript check runs.
- Backend pytest runs.
- Any failing tests are real application/test failures, not missing toolchain failures.

## Phase 2: Full Production Regression Testing

### Goal

Create a fresh production-readiness test result before changing production behavior.

### Required Test Coverage

1. Sign up
2. Sign in
3. Create household profile
4. Switch household profile
5. Create budget plan
6. Add expense
7. Edit expense
8. Delete expense
9. Add shopping item
10. Add shopping item quantity
11. Mark shopping item as bought
12. Convert bought shopping item into budget expense
13. Mark bought shopping item back to unbought and verify linked expense behavior
14. Borrow from budget
15. Edit borrow record
16. Repay to budget
17. Verify member borrow balance calculations
18. Enable daily reminder
19. Change daily reminder time
20. Disable daily reminder
21. Create recurring bill
22. Create bill with category-specific fields such as electricity units
23. Mark bill as paid without linking to budget plan
24. Mark bill as paid and link to budget plan
25. Verify linked bill payment creates correct budget expense
26. Delete recurring bill and verify payment behavior
27. Add savings deposit
28. Add savings withdrawal without budget link
29. Add savings withdrawal linked to budget plan
30. Verify linked savings withdrawal creates correct budget expense
31. Delete savings entry
32. Verify savings total, monthly net, deposits, and withdrawals calculations
33. Verify bill/savings updates on second user's device or browser session
34. Invite second user
35. Accept invite through invite route
36. View members
37. Receive notification
38. Mark notifications as read
39. Delete or leave household space

### Acceptance Criteria

- Backend tests pass.
- Frontend lint/type checks pass.
- E2E regression completes in one run.
- Fresh test report is created.
- Any remaining bugs are ranked by severity.

## Phase 3: Fix Small QA Bug

### Issue

There is a typo in the shopping quantity test id:

```tsx
shoppong-quantity-input
```

### Implementation Plan

1. Rename it to:

```tsx
shopping-quantity-input
```

2. Search the repo for any test or automation references to the old typo.
3. Update affected tests.
4. Rerun shopping-list regression.

### Acceptance Criteria

- Correct test id exists.
- Old typo no longer exists.
- Shopping quantity input still works.
- E2E selector can target the field reliably.

## Phase 3B: Add Test IDs For Billing And Savings

### Issue

The new `BillTracker` and `SavingsTracker` components need stable selectors before full regression automation can be reliable.

### Implementation Plan

Add `testID` props for:

- New bill composer
- Bill name, amount, units, due-day, notify-days inputs
- Bill category chips
- Bill recurring and active toggles
- Save bill button
- Bill row/detail open
- Mark bill paid button
- Bill payment amount, units, plan, and paid-by controls
- Confirm bill payment button
- Delete bill button
- Savings deposit and withdrawal modals
- Savings amount, date, note, and plan controls
- Confirm deposit and withdrawal buttons
- Savings entry row/detail open
- Delete savings entry button

### Acceptance Criteria

- Billing and savings E2E tests do not depend on visible text selectors.
- Selectors are unique and stable.
- Existing budget, shopping, and profile selectors remain unchanged.

## Phase 4: Remove Or Gate Debug Logging

### Issue

Frontend logs currently expose sensitive or noisy production data, including expense payloads, user IDs, realtime payloads, and detailed error data.

### Implementation Plan

1. Search for all production-path logging:

```bash
rg "console\." frontend
```

2. Classify each log:
   - Remove
   - Keep as development-only
   - Replace with sanitized user-facing error
3. Add a tiny logging helper if useful:

```ts
const isDev = __DEV__;
```

4. Remove logs from:
   - expense creation/update/delete
   - realtime payload subscriptions
   - session/user identifiers
   - invite/token-related flows
5. Keep only safe, minimal error handling.

### Acceptance Criteria

- No raw expense payloads are logged.
- No user IDs are logged in normal app usage.
- No realtime payload dumps are logged.
- No invite tokens or sensitive backend errors are logged.
- Development-only logs are clearly gated.

## Phase 5: Backend CORS Security Hardening

### Issue

Backend CORS currently allows all origins.

### Implementation Plan

1. Add backend environment variable:

```bash
ALLOWED_ORIGINS=https://nestledger.dinushan.dev
```

2. Parse it in `backend/server.py`.
3. Replace wildcard CORS with allowed origins.
4. Allow local origins only in development configuration.
5. Add a manual or automated validation check for:
   - approved origin allowed
   - unknown origin blocked

### Acceptance Criteria

- `allow_origins=["*"]` is removed.
- Production origin is explicitly allowed.
- Unknown browser origins are blocked.
- Mobile app calls still work.
- Local development still has a documented setup path.

## Phase 6: Push Notification Real-Device Validation

### Issue

Push notification delivery is wired but not production-validated on real Android/iOS devices.

### Implementation Plan

1. Create preview or production-like mobile builds.
2. Install on a real Android device.
3. Install on a real iOS device.
4. Log in as two users in the same household.
5. Confirm push token registration.
6. Trigger push-generating actions:
   - Add expense
   - Add shopping item
   - Mark item bought
   - Accept invite
7. Test delivery states:
   - foreground
   - background
   - app closed
8. Document actual behavior.

### Acceptance Criteria

- Android push works on real device.
- iOS push works on real device.
- Token registration survives logout/login.
- Failed push delivery does not break user flows.
- Notification copy is clear and user-friendly.

## Phase 7: Frontend Maintainability Preparation

### Issue

`NestLedgerApp.tsx` is very large and risky for production maintenance.

### Implementation Plan

Do not do a large refactor before stabilizing tests. First prepare a safe extraction strategy.

Suggested extraction order:

1. Shared form components and modal helpers
2. Auth screen
3. Profile creation and switcher
4. Dashboard screen
5. Budget screen and budget detail modal
6. Expense composer
7. Shopping screen and bought-item flow
8. Members, invite, settings, and notifications

### Acceptance Criteria

- Refactor plan is written before moving code.
- Regression tests pass before refactor starts.
- Each extraction is small and independently testable.
- No feature behavior changes during extraction.

## Suggested Execution Order

1. Restore test environment.
2. Run full production regression testing.
3. Fix `shoppong-quantity-input` typo.
4. Add stable billing/savings test IDs.
5. Remove or gate debug logging.
6. Harden backend CORS.
7. Run backend/frontend regression again, including billing/savings.
8. Validate push notifications on real Android and iOS devices.
9. Validate local daily reminder behavior on a real device.
10. Prepare maintainability refactor plan.
11. Start frontend file split only after regression is stable.

## Do Not Start Yet

Do not start the production release pipeline work until these P0 items are stable.

That means no public release, no app store production submission, and no marketing launch until regression, security, logging, and push validation are complete.
