# NestLedger Production Release Plan

## Goal

Prepare NestLedger for a safe public production release by closing release, security, logging, maintainability, testing, push notification, and small QA gaps before app store launch.

## Current Release Verdict

NestLedger is currently MVP-ready, but not production-release-ready.

The app has the core product flows, but production readiness requires stronger release automation, security hardening, full regression validation, real-device push testing, and clearer operational checks.

## P0 Before Release

These items must be completed before a public production launch.

### 1. Complete Production Release Pipeline

**Problem:**  
The current GitHub workflow builds Android only and does not submit to Google Play. It also does not build or submit iOS.

**Why it matters:**  
A production mobile app needs repeatable release builds, store submission, versioning, and release traceability.

**Plan:**

1. Update the release workflow to build both Android and iOS production builds.
2. Add Google Play submission through EAS Submit.
3. Add Apple App Store submission through EAS Submit.
4. Configure required store credentials in Expo/EAS and GitHub secrets.
5. Add manual release trigger for controlled production releases.
6. Keep backend deployment separate from app store release where possible.

**Expo production flow reference:**  
Official Expo SDK 54 guidance uses production profiles in `eas.json`, production builds with:

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

Then submit using EAS Submit or an automated EAS workflow with build jobs followed by submit jobs.

**Acceptance criteria:**

- Android production `.aab` builds successfully.
- iOS production build succeeds.
- Google Play internal/closed testing submission succeeds.
- App Store Connect TestFlight submission succeeds.
- Release workflow can be run manually.
- Version/build numbers increment correctly.

## 2. Restrict Backend CORS

**Problem:**  
Backend CORS currently allows all origins.

**Why it matters:**  
Wide-open CORS increases exposure and is not appropriate for production APIs.

**Plan:**

1. Add an environment variable such as `ALLOWED_ORIGINS`.
2. Parse known production origins from environment config.
3. Restrict CORS to:
   - Production app domain
   - Production web fallback domain
   - Approved preview/staging domains, if needed
4. Keep localhost only for development environments.
5. Add a backend test or manual check for blocked unknown origins.

**Acceptance criteria:**

- Unknown browser origins are blocked.
- Production domain still works.
- Mobile app API calls still work.
- Local development can still be configured safely.

## 3. Remove Or Gate Debug Logging

**Problem:**  
Frontend logs expense data, user IDs, realtime payloads, and detailed errors.

**Why it matters:**  
Production logs should not expose personal or financial data. Excess logging also makes real debugging harder.

**Plan:**

1. Remove unnecessary `console.log` calls from production paths.
2. Keep only safe error logging.
3. Add a small logging helper if needed:
   - Logs in development
   - Silent or sanitized in production
4. Avoid logging full expense payloads, user IDs, tokens, invite links, or Supabase errors with sensitive details.

**Acceptance criteria:**

- No raw expense payloads are logged.
- No user IDs or invite tokens are logged in normal production flows.
- Realtime payload logs are removed or dev-only.
- Errors shown to users are friendly and non-technical.

## 4. Run Full Production Regression Testing

**Problem:**  
Existing report says backend passed 5/5, but frontend success was only 65% and retesting was required. Current `testID` coverage appears improved, so the report is outdated.

**Why it matters:**  
Production release needs confidence in core user flows, not only backend endpoint tests.

**Plan:**

1. Run backend tests against a production-like Supabase test project.
2. Run frontend lint and type checks.
3. Run mobile/web E2E regression using stable `testID`s.
4. Validate real user flows with two accounts.
5. Update the test report with fresh results.

**Required test scenarios:**

- Sign up
- Sign in
- Create household profile
- Switch household profile
- Create budget plan
- Add expense
- Edit expense
- Delete expense
- Add shopping item
- Mark shopping item as bought
- Convert bought item into expense
- Invite second user
- Accept invite through invite route
- View members
- Receive notifications
- Mark notifications as read
- Delete or leave household space

**Acceptance criteria:**

- Backend tests pass.
- Frontend lint/type checks pass.
- Core E2E flows pass in one full regression run.
- New `test_reports` output replaces the outdated 65% report.
- Any known release defects are documented with severity.

## 5. Validate Push Notifications On Real Devices

**Problem:**  
Push notification delivery is wired, but not validated on real Android/iOS devices.

**Why it matters:**  
Push notifications often behave differently between simulators, Expo Go, development builds, and production builds.

**Plan:**

1. Create production or preview builds for Android and iOS.
2. Install on real devices.
3. Register Expo push tokens.
4. Trigger notification fanout from key app actions.
5. Confirm delivery when:
   - App is foregrounded
   - App is backgrounded
   - App is closed
6. Confirm notification permission prompts are clear.
7. Document platform-specific behavior.

**Acceptance criteria:**

- Android push delivery confirmed on real device.
- iOS push delivery confirmed on real device.
- Token registration works after reinstall/login.
- Failed push delivery does not break the app.
- Notification copy is user-friendly.

## 6. Fix Known Small QA Bug

**Problem:**  
There is a typo in the shopping quantity test id: `shoppong-quantity-input`.

**Why it matters:**  
Small QA issues reduce automation reliability and create avoidable confusion.

**Plan:**

1. Rename `shoppong-quantity-input` to `shopping-quantity-input`.
2. Update any tests that reference the typo.
3. Rerun affected shopping-list automation.

**Acceptance criteria:**

- Correct test id is used.
- Shopping item quantity flow still works.
- E2E selectors use the corrected value.

## P1 Soon After P0

These are important, but they can follow after the release blockers are removed.

### 1. Split The Large Frontend File

**Problem:**  
`NestLedgerApp.tsx` is about 3,672 lines, which creates maintainability risk.

**Plan:**

1. Extract auth flow into an auth module.
2. Extract dashboard screen.
3. Extract budget screen and budget detail modal.
4. Extract expense composer and expense list.
5. Extract shopping screen and bought-item flow.
6. Extract profile, members, invite, settings, and notifications.
7. Keep shared types, helpers, and UI primitives separate.

**Acceptance criteria:**

- Main app shell is small and orchestration-focused.
- Feature modules own their own UI and handlers.
- No behavior regression after refactor.
- E2E tests still pass.

### 2. Add Release Operations Checklist

**Plan:**

1. Add a pre-release checklist.
2. Add rollback steps.
3. Add support contact and privacy policy review.
4. Add monitoring and uptime checks.
5. Add backup/recovery expectations for Supabase data.

**Acceptance criteria:**

- Release can be repeated by following documented steps.
- Rollback path is clear.
- Support and privacy requirements are ready for app stores.

## Suggested Execution Order

1. Fix the small test id typo.
2. Remove or gate debug logging.
3. Restrict backend CORS.
4. Run local lint/type/backend tests.
5. Refresh full frontend E2E regression.
6. Validate real-device push notifications.
7. Update GitHub/EAS release workflow for Android and iOS.
8. Submit to Google Play internal testing and TestFlight.
9. Complete app store metadata, privacy, screenshots, and support materials.
10. Decide public release date only after internal testing passes.

## Release Decision Rule

Do not release publicly until all P0 acceptance criteria are complete.

The app can move to internal testing or closed beta before all P1 work is done, but it should not be publicly marketed until the release pipeline, security, testing, and push notification validation are complete.
