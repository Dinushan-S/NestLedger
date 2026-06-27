# NestLedger — Production Readiness Review & Premortem

_Date: 2026-06-28 · Reviewed commit: `aea40b0` · Reviewer: automated code/config audit_

## Verdict

**Not yet safe for a public production launch — but close, and ready for a closed beta now.**

The product is functionally complete and a large share of the original hardening work has landed: backend abuse protection (rate limiting), dependency hygiene, a live + in-app-linked privacy policy, and operations (monitoring, error tracking, auto-rollback, snapshots, rebuild runbook). What still blocks a **public** launch is a short, mostly account/device-gated list: the iOS pipeline, validating release artifacts on real devices, data-integrity tests, and finishing the store-console paperwork.

| Area | Status |
|------|--------|
| Core product flows | ✅ Complete (auth, households, budgets, expenses, shopping, bills, savings, multi-currency, push wiring) |
| Frontend static quality | ✅ tsc clean, eslint clean, expo-doctor 17/17, 0 npm vulns, no console.log in prod paths |
| Backend security basics | ✅ token verification, CORS restricted via env, RLS in schema (77 policies), per-endpoint membership checks |
| Backend abuse protection | ✅ per-user rate limits on invite + push **fanout** (429 + `Retry-After`), env-configurable |
| Dependency hygiene | ✅ `requirements.txt` trimmed to 6 runtime deps; dev/test split into `requirements-dev.txt` |
| Operations | ✅ beta-ready — UptimeRobot + email, Sentry, auto-rollback on failed deploy, GCP daily disk snapshots, rebuild runbook (`docs/SERVER_RECOVERY.md`). Single-VM SPOF accepted for beta |
| Release pipeline control | ✅ by design — Android auto-submits to Play **alpha (closed testing)**; manual alpha→production promotion is the gate |
| Store compliance | 🟡 privacy policy **live** + linked in-app; disclosures mapped. Remaining: legal review + enter in both consoles |
| iOS | 🟡 in progress — build/submit via **Codemagic** (`codemagic.yaml`) scaffolded; needs Apple setup |
| Test validation | 🟡 CI pytest workflow exists but needs a test Supabase project + secrets; real-device push/realtime unverified |
| Data integrity (linked records) | 🟡 unit tests added (`selectors.dataintegrity.test.ts`) covering borrow/repay netting, member owes, bill paid/pending, savings, cycle scoping, decimal precision — run `npm test` to confirm green; realtime/cross-currency display still unverified |

Legend: ✅ done · 🟡 in progress / partial · 🔴 open

---

## Still needs fixing (before public launch)

Ordered by importance. Most are gated on your accounts/devices, not code.

1. **Data-integrity tests (highest risk).** 🟡 _Started._ Added `selectors.dataintegrity.test.ts` — covers borrow/repay netting, per-member owes (floored at 0), bill paid-vs-pending, savings deposits/withdrawals/balance, cycle-window + plan scoping, and decimal-cent precision. Assertions were cross-checked against the source formulas. **To do:** run `npm test` to confirm green in your environment (jest-expo wouldn't boot in the sandbox), and extend to cross-currency *display* and the realtime second-device path. _(See premortem #5.)_

2. **Real-device + CI test validation.** Stand up a **test** Supabase project, seed the two users `conftest.py` expects, set the 3 GitHub Action secrets so `backend-tests.yml` runs green, then validate **push + realtime on real Android & iOS** (foreground/background/closed, reinstall, two devices). Steps in `TESTING.md`. _(Premortem #2, #6.)_

3. **iOS pipeline — finish Apple/Codemagic setup.** `codemagic.yaml` is committed (native `expo prebuild` → IPA → TestFlight). Remaining (your action): Apple Developer membership, an App Store Connect record for `com.nestledger.app` (→ ASC App ID), add an ASC API key to Codemagic, set the `nestledger_env` var group, fill `APP_STORE_APPLE_ID`, then pass TestFlight. Details in `codemagic.yaml` + `docs/STORE_COMPLIANCE.md`.

4. **Store-console paperwork.** Enter the privacy URL + Data Safety (Google) / App Privacy (Apple) answers from `docs/STORE_COMPLIANCE.md`, complete content/age ratings, and get the policy a legal review. Checklist: `docs/STORE_COMPLIANCE_TODO.md`.

5. **Service-role key hardening (P1).** The full `.env` (Supabase **service-role** key, SMTP password) is base64'd through a GitHub secret onto the VM. The service-role key bypasses RLS, making that box a crown-jewel target. Rotate it, restrict server access, and confirm the `learn-488011-*.json` GCP key (gitignored) never bundles into a build. _(Premortem #4.)_

6. **DIY backups (deferred by choice).** Free Supabase has no built-in backups — set up a daily `pg_dump` → Cloud Storage. Steps in `docs/OPERATIONS_TODO.md`. _(Premortem #7.)_

7. **`NestLedgerApp.tsx` is 4,485 lines (P1).** Maintainability/regression risk; split per the existing plan. Not a launch blocker.

---

## Done since the initial audit

- ✅ **Rate limiting** on invite + push fanout endpoints (429 + `Retry-After`, env-configurable).
- ✅ **`requirements.txt` trimmed** from 26 pkgs to 6 runtime deps; dev/test split out; unused `File`/`UploadFile` import removed.
- ✅ **Privacy policy** written, **live** at `nest-ledger-landingpage.vercel.app/static/privacy.html`, and **linked in-app** (Settings → About & legal).
- ✅ **Uptime monitoring** (UptimeRobot on `/api/health`) + email alerts.
- ✅ **Sentry** error/performance tracking on the backend (verified receiving events).
- ✅ **Auto-rollback** in `deploy-all.yml` — captures the prior SHA and reverts on a failed health check.
- ✅ **GCP daily disk snapshots** + a documented **rebuild runbook** (`docs/SERVER_RECOVERY.md`).
- ✅ **iOS pipeline scaffolded** on Codemagic (`codemagic.yaml`).
- ✅ **Release pipeline** confirmed acceptable — alpha closed-testing track with a manual production gate.

---

## What's solid (baseline)

- **Auth is real.** `get_current_user` verifies the bearer token against Supabase `/auth/v1/user`, not client claims.
- **Authorization server-side.** Sensitive endpoints call `ensure_profile_member(...)` before acting.
- **RLS present** (77 policy statements) — DB doesn't rely on the API layer alone.
- **CORS** driven by `ALLOWED_ORIGINS` / `APP_PUBLIC_URL`, fails closed if unset.
- **Logging cleaned** — no `console.log` in production paths.

---

## Premortem (reviewed 2026-06-28)

_It's three months after launch. NestLedger failed. Most likely autopsy, with current mitigation status._

**1. A broken app build reached users.** 🟢 _Reduced._ App ships to the Play **alpha (closed testing)** track and promotion to production is manual, so a bad merge hits invited testers, not the public. Backend bad deploys now auto-rollback on a failed health check. _Residual: no staged rollout once you do promote to production._

**2. Push notifications never actually worked in production.** 🟠 _Code verified, runtime unconfirmed._ Static audit of the push path passed: notification handler, Android HIGH-importance channel, permission request + `POST_NOTIFICATIONS`/iOS usage string, a present `extra.eas.projectId` (so token fetch won't silently bail), backend token registration, and tap-routing via `useLastNotificationResponse` are all correctly wired; `google-services.json` is present. The one common silent-failure cause (missing projectId) is **not** present here. _Residual: actual delivery still needs real-device validation across foreground/background/closed + reinstall (still-needs-fixing #2). Minor: registration errors are swallowed by a silent `catch {}` — consider surfacing them once frontend error reporting exists._

**3. The invite/email endpoint got abused.** 🟢 _Mitigated._ Invite + fanout now rate-limited (429 + `Retry-After`), so an abuser can't spam invites to burn the Brevo quota or flood members. _Residual: watch Brevo deliverability/bounce rates in production._

**4. The service-role key leaked.** 🟠 _Partially open._ Sentry/monitoring now surface anomalies, but the key still lives on a single VM + CI and bypasses all RLS. _Fix: rotate + restrict + confirm no key bundling (still-needs-fixing #5)._

**5. Linked-record math corrupted budgets.** 🟠 _Partially addressed._ Unit tests now cover the core derived-ledger math (borrow/repay netting, member owes, bill paid/pending, savings, cycle scoping, decimal precision) in `selectors.dataintegrity.test.ts`. _Residual: run them green in CI, and cover the delete-original / second-device-race / cross-currency-display edges (still-needs-fixing #1)._

**6. Shared state didn't sync across devices.** 🟠 _Bug found + fixed; runtime unconfirmed._ Audit showed the client **does** subscribe to realtime for 9 tables (incl. `bill_payments`, `savings`), and most were correctly added to the `supabase_realtime` publication — but **`budget_plans` and `profile_members` were missing from the publication**, so a second device got no live updates when a budget plan changed or a member joined/left. Fixed in `supabase_schema.sql` + standalone `backend/migration_realtime_fix.sql` (apply to the existing DB). _Residual: apply the migration in prod, then confirm with a two-device test (still-needs-fixing #2)._

**7. The single backend box fell over.** 🟢 _Reduced._ Now: uptime monitoring + alerts, Sentry, auto-rollback, daily disk snapshots, and a rebuild runbook. Server is stateless (code in git, `.env` in the GitHub secret, data in Supabase), so VM loss = downtime, not data loss. _Residual: single-VM SPOF (accepted for beta) and no DB backups yet on free Supabase (still-needs-fixing #6)._

**8. Store rejection / stall.** 🟢 _Reduced._ Privacy policy is live + linked in-app, disclosures mapped, and the iOS pipeline is scaffolded on Codemagic. _Residual: finish console paperwork + complete the Apple setup (still-needs-fixing #3, #4)._

**Net premortem read:** the operational and abuse risks that dominated the original audit are now largely controlled. The remaining failure modes that could actually sink a launch are **data-integrity bugs in linked records (#5)** and **unvalidated push/realtime (#2, #6)** — both fixable with the tests in still-needs-fixing #1–#2.

---

## Recommended path to launch

1. Add data-integrity tests for linked-record + multi-currency paths. _(still-needs-fixing #1)_
2. Stand up the test Supabase project + secrets; get `backend-tests.yml` green. _(#2)_
3. Validate push + realtime on real Android & iOS (two devices). _(#2)_
4. Finish the Codemagic/Apple iOS setup; pass TestFlight. _(#3)_
5. Enter store-console disclosures + privacy URL; get a legal review. _(#4)_
6. Rotate + lock down the service-role key. _(#5)_
7. Ship to **closed beta**; go public only after 1–5 are green.
8. _Soon after:_ DIY `pg_dump` backups (#6) and split `NestLedgerApp.tsx` (#7).

_Already done: rate limiting, dependency trim, live + in-app privacy policy, monitoring + Sentry, auto-rollback, snapshots + rebuild runbook, iOS pipeline scaffolding, release-pipeline review._
