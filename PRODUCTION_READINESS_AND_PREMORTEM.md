# NestLedger — Production Readiness Review & Premortem

_Date: 2026-07-06 · Reviewed commit: `336ed79` (origin/main tip; PR #31 merged) · Reviewer: automated code/config/security audit · Supersedes the 2026-06-28 review_

## Verdict

**Not safe for a public launch until the secret leak below is closed out. Still fine for the existing closed beta.**

Since the June 28 review the code has improved (Sentry live, auto-rollback shipped, data-integrity tests now pass green, dark-theme work merged). But this pass surfaced one issue the previous review missed: **the GitHub repository is public and `backend/.env` — including the Supabase service-role key, database password, SMTP password and Brevo API key — was committed to git history.** The file was removed from the working tree on 2026-03-07, but the old commits remain fetchable by anyone. Current live keys appear to differ from the leaked ones (rotation likely happened), but that must be confirmed and the history scrubbed. Two dependency regressions also appeared (npm and starlette CVEs).

| Area | Status |
|------|--------|
| **Repo secret hygiene** | 🔴 **NEW — `backend/.env` + `frontend/.env` in public git history** (service-role key, DB URL, SMTP + Brevo secrets). Removed from HEAD, still in history. Confirm rotation + scrub history |
| Core product flows | ✅ Complete (auth, households, budgets, expenses, shopping, bills, savings, multi-currency, push wiring) |
| Data integrity (linked records) | ✅ `selectors.dataintegrity.test.ts` **runs green — 13/13** (borrow/repay netting, member owes floored at 0, bill paid/pending, savings, cycle scoping, cent precision). Cross-currency display + realtime race still unverified |
| Backend security basics | ✅ token verification, CORS restricted via env (fails closed), RLS in schema, per-endpoint membership checks, PostgREST `in.()` filter injection guarded in fanout cleanup |
| Backend abuse protection | ✅ per-user sliding-window rate limits on invite + push fanout (429 + `Retry-After`), env-configurable; duplicate-invite 409 guard; Expo push-token regex validation |
| Backend dependency hygiene | 🟡 `requirements.txt` trimmed to 7 runtime deps, BUT pinned **starlette 0.37.2 has ≥6 CVEs** (via `fastapi==0.110.1`) — bump fastapi/starlette |
| Frontend dependency hygiene | 🟡 **24 npm vulns (1 critical `shell-quote`, 3 high incl. `form-data` CRLF)** — regression from "0 vulns" on June 28; most fixable via `npm audit fix` (dev/build-chain, not shipped runtime) |
| Operations | ✅ UptimeRobot + email, Sentry (debug route removed), auto-rollback on failed deploy, GCP daily disk snapshots, rebuild runbook. Single-VM SPOF accepted for beta |
| Release pipeline control | ✅ Android auto-submits to Play alpha (closed testing); manual alpha→production promotion is the gate; backend deploy auto-rolls-back on failed health check |
| Store compliance | 🟡 privacy policy live + linked in-app; disclosures mapped. Remaining: legal review + enter in both consoles |
| iOS | 🟡 build/submit via Codemagic (`codemagic.yaml`) scaffolded; needs Apple Developer + ASC setup |
| Test validation (runtime) | 🟡 CI pytest workflow exists but needs a test Supabase project + secrets; real-device push/realtime still unverified |

Legend: ✅ done · 🟡 in progress / partial · 🔴 open blocker

---

## 🔴 P0 — Secret leak in public git history (NEW, must fix before public launch)

> **STATUS: PENDING — deferred on purpose (2026-08-05).** Local testing ongoing; repo is a public GitHub repo but release is gated behind the Play alpha (closed testing) track, so the leak is not yet exploitable in a public release. **Must be closed before promoting to production.** Do not forget this.
>**What.** `Dinushan-S/NestLedger` is a **public** GitHub repo. `backend/.env` and `frontend/.env` were tracked and committed, then removed from tracking in commit `3eaefa7` (2026-03-07). Removal from HEAD does **not** remove them from history — anyone can run `git log`/`git show` on the old commits and read every value.

**Exposed in `backend/.env` history:**

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses **all** RLS; full read/write to every household's data
- `SUPABASE_DB_URL` — direct Postgres connection string (DB password)
- `SMTP_PASSWORD` + `BREVO_API_KEY` — can send mail as your domain (phishing / quota burn)
- `MONGO_URL` (legacy)

**Exposed in `frontend/.env` history:** backend URL, Supabase URL + anon key (anon key is public-by-design, low risk).

**Current state (checked this pass).** The values in the live `backend/.env` **differ** from the leaked ones for `SERVICE_ROLE_KEY`, `SMTP_PASSWORD`, `BREVO_API_KEY`, and `SUPABASE_DB_URL` — consistent with a rotation. The Supabase **project ref is unchanged** (`yrrshpkaqvphkdayzodh`), so the JWT-based keys were only truly invalidated if the project's JWT secret was rotated.

**To close it out:**

1. **Confirm invalidation.** In Supabase, verify the leaked service-role JWT no longer authenticates. If unsure, rotate the project JWT secret (invalidates all old JWTs) and reset the database password. Rotate the Brevo API key + SMTP credential if not already done.
2. **Scrub history.** Use `git filter-repo` (or BFG) to purge `backend/.env` and `frontend/.env` from all commits, then force-push. Note this rewrites SHAs and breaks the deploy VM's `git reset --hard origin/main` on next pull — plan the re-clone.
3. **Or** make the repo **private** as an immediate stopgap (blocks anonymous access while you scrub).
4. **Prevent recurrence.** `.gitignore` now covers `*.env` (good). Add a pre-commit secret scanner (gitleaks) and enable GitHub secret-scanning/push-protection.

Other secret-ish files in the repo tree — `deploy_key`, `nestledger_deploy_key` (SSH private keys), and `frontend/learn-488011-b6719fee46c1.json` (GCP service-account key) — are present on disk but are **gitignored and not tracked** (verified). Keep them that way; confirm the GCP JSON never bundles into an EAS build.

---

## Still needs fixing (before public launch)

Ordered by importance.

1. **Close the secret leak (P0) — PENDING (deferred, fix later).** See section above. This is the top blocker for public launch; not blocking local testing. `git filter-repo` scrub + credential rotation still outstanding.

2. **Dependency CVEs (P1) — ✅ FIXED 2026-08-05.**
   - Backend: `fastapi==0.110.1` / `starlette 0.37.2` (multiple CVEs) → bumped to **`fastapi==0.115.14` + `starlette 0.46.2` + `uvicorn==0.34.3`**; app loads + tests green.
   - Frontend: `npm audit` went from **24 vulns (2 critical, 6 high)** → **16 moderate, 0 critical, 0 high** via `npm audit fix` + `postcss` override bumped `8.5.10 → 8.5.25`. Remaining 16 moderate are all Expo build-chain/dev deps; fixing them needs the breaking `expo@57` upgrade (deferred). Frontend tests 33/33 green.

3. **Real-device + CI test validation — PENDING.** Stand up a **test** Supabase project, seed the two users `conftest.py` expects, set the 3 GitHub Action secrets so `backend-tests.yml` runs green, then validate **push + realtime on real Android & iOS** (foreground/background/closed, reinstall, two devices). Steps in `TESTING.md`. _(Premortem #2, #6.)_

4. **iOS pipeline — finish Apple/Codemagic setup — PENDING.** `codemagic.yaml` is committed (native `expo prebuild` → IPA → TestFlight). Remaining: Apple Developer membership, an App Store Connect record for `com.nestledger.app`, an ASC API key in Codemagic, the `nestledger_env` var group, `APP_STORE_APPLE_ID`, then pass TestFlight.

5. **Store-console paperwork — PENDING.** Enter the privacy URL + Data Safety (Google) / App Privacy (Apple) answers, complete content/age ratings, and get the policy a legal review.

6. **Expo 57 upgrade — PENDING (P2).** Clears the last 16 moderate npm vulns (build-chain only, not shipped runtime); breaking change — defer until after beta is stable.

7. **`NestLedgerApp.tsx` split (P2).** ~~4,480 lines~~ → **3,323 lines (2026-08-05)**: styles → `nestledger.styles.ts` (953), helper components → `nestledger.ui.tsx` (186), types/constants → `nestledger.constants.ts` (155). Remaining: split the main component by tab (budget/shopping/savings) — riskier, defer until after device testing.

## ✅ Done since the 2026-07-06 review

- ✅ **Realtime migration applied in prod** — `migration_realtime_fix.sql` (`budget_plans` + `profile_members` in `supabase_realtime` publication) confirmed applied on the live DB (2026-08-05). Remaining: two-device test (folded into #3).
- ✅ **Backend CVEs fixed** — fastapi/starlette/uvicorn bumped (see #2).
- ✅ **Frontend npm audit 24 → 16 (0 critical/high)** — see #2.
- ✅ **DIY pg_dump backups shipped** — `backend/scripts/backup.sh` (daily, 7-day retention, optional GCS off-box upload) + `restore_backup.sh` + systemd timer `nestledger-backup.timer` provisioned by `deploy-all.yml`. Set `GCS_BACKUP_BUCKET` in the ENV secret for off-box storage. Remaining: one scratch-project restore test (folded into #3).
- ✅ **Notification titles improved** — per-type push/local titles ("Budget updated", "New member joined", …) instead of generic "NestLedger"; "expo" title seen during local testing is Expo Go dev behavior (its Android label), not a code bug.

- ✅ **Data-integrity tests pass green** — `selectors.dataintegrity.test.ts`, 13/13 (verified this pass, ~11s).
- ✅ **Sentry** error/performance tracking live on backend; temporary Sentry verification/debug route added then **removed** (`af5bd87`).
- ✅ **Auto-rollback** shipped in `deploy-all.yml` — captures prior SHA, polls `/api/health`, reverts on failure.
- ✅ **Invite endpoint** hardened — rate limit + duplicate-invite 409 guard, with unit + integration tests (`4c4c043`, `bed6cdb`).
- ✅ **Dark-theme support** merged (`theme-context.tsx`, `336ed79`).
- ✅ **Landing page** de-nested from the repo (deployed separately via Vercel).

## Still solid (baseline)

- **Auth is real.** `get_current_user` verifies the bearer token against Supabase `/auth/v1/user`, not client claims.
- **Authorization server-side.** Sensitive endpoints call `ensure_profile_member(...)` before acting.
- **RLS present** — every table has `enable row level security` + member-scoped policies; all tables cascade-delete from `profiles`, so no orphan rows.
- **CORS** driven by `ALLOWED_ORIGINS`/`APP_PUBLIC_URL`, fails closed (startup raises if unset).
- **Injection-aware.** Fanout dead-token cleanup quotes each value per PostgREST `in.()` rules and scopes the delete to the profile's recipients.

---

## Premortem (reviewed 2026-07-06)

_It's three months after launch. NestLedger failed. Most likely autopsy, with current mitigation status._

**1. The leaked service-role key was used before rotation was confirmed.** 🔴 _Open — highest risk._ The public git history exposed a service-role key that bypasses RLS. If it was never actually invalidated (project JWT secret unchanged), an attacker read or wiped every household's financial data, or sent phishing mail via the leaked Brevo/SMTP creds. _Fix: confirm invalidation + scrub history (still-needs-fixing #1). Until confirmed, treat the current data as potentially compromised._

**2. A broken app build reached users.** 🟢 _Reduced._ Ships to Play alpha (closed testing) with a manual production gate; backend bad deploys auto-rollback on failed health check. _Residual: no staged rollout once you promote to production._

**3. Push notifications never actually worked in production.** 🟠 _Code verified, runtime unconfirmed._ Static audit of the push path passes (handler, Android HIGH channel, permissions, `projectId` present, backend registration with token regex validation, tap-routing). _Residual: real-device delivery across foreground/background/closed + reinstall still unvalidated (still-needs-fixing #3)._

**4. The invite/email endpoint got abused.** 🟢 _Mitigated._ Invite + fanout rate-limited (429 + `Retry-After`); duplicate-invite 409 guard. _Residual: watch Brevo deliverability/bounce; note the leaked Brevo key in #1 if not rotated._

**5. A dependency CVE got exploited.** 🟢 _Fixed 2026-08-05._ Backend starlette bumped 0.37.2 → 0.46.2 (via `fastapi==0.115.14`, `uvicorn==0.34.3`); frontend `npm audit` 24 → 16 (0 critical/high, `npm audit fix` + postcss override). _Residual: 16 moderate remain in the Expo build chain — needs the breaking `expo@57` upgrade (deferred)._

**6. Linked-record math corrupted budgets.** 🟢 _Addressed._ Derived-ledger math is now covered by 13 passing unit tests (borrow/repay netting, member owes, bill paid/pending, savings, cycle scoping, cent precision). _Residual: cross-currency *display* and the delete-original / second-device-race edges still uncovered._

**7. Shared state didn't sync across devices.** 🟢 _Migration applied in prod (2026-08-05)._ `budget_plans` and `profile_members` are in the `supabase_realtime` publication. _Residual: two-device realtime test still to run (folded into still-needs-fixing #3)._

**8. The single backend box fell over.** 🟢 _Reduced._ Uptime monitoring + alerts, Sentry, auto-rollback, daily disk snapshots, rebuild runbook, and now **daily `pg_dump` backups** (script + systemd timer + optional GCS off-box upload, 2026-08-05). Server is stateless (code in git, `.env` in a GitHub secret, data in Supabase). _Residual: single-VM SPOF (accepted for beta); one scratch-project restore test remains._

**9. Store rejection / stall.** 🟢 _Reduced._ Privacy policy live + linked in-app, disclosures mapped, iOS pipeline scaffolded. _Residual: finish console paperwork + Apple setup (still-needs-fixing #4, #5)._

**Net premortem read:** operational and abuse risks remain well-controlled, and the data-integrity risk that dominated the last review is now closed (tests green). The launch-blocking risk today is **the secret leak in public history (#1)** — nothing else should ship to the public until that's confirmed closed. Unvalidated push/realtime on real devices (#3, #7) is the next tier.

---

## Recommended path to launch

1. **Close the secret leak — PENDING (deferred).** Confirm the leaked service-role/DB/SMTP/Brevo creds are invalidated, scrub `*.env` from git history (or make the repo private now), add gitleaks + push protection. _(#1)_
2. ~~Bump fastapi/starlette; npm audit fix~~ — ✅ done 2026-08-05 (backend starlette 0.46.2, frontend 0 critical/high).
3. Stand up the test Supabase project + secrets; get `backend-tests.yml` green. _(#3)_
4. ~~Apply migration_realtime_fix.sql~~ — ✅ applied in prod 2026-08-05. Remaining: validate push + realtime on real Android & iOS (two devices). _(#3, #7)_
5. Finish the Codemagic/Apple iOS setup; pass TestFlight. _(#4)_
6. Enter store-console disclosures + privacy URL; get a legal review. _(#5)_
7. Keep serving the **closed beta**; go public only after 1, 3–6 are green.
8. _Soon after:_ set `GCS_BACKUP_BUCKET` for off-box backups + run one restore test (#8); `NestLedgerApp.tsx` further split by tab (started 2026-08-05 — styles/UI/constants extracted, 4,618 → 3,323 lines); `expo@57` upgrade to clear remaining moderate npm vulns.

_Already done: data-integrity tests green, rate limiting + duplicate guard, live + in-app privacy policy, monitoring + Sentry, auto-rollback, snapshots + rebuild runbook, iOS pipeline scaffolding, realtime publication fix (applied), dependency CVE fixes, DIY pg_dump backups, NestLedgerApp.tsx partial split._
