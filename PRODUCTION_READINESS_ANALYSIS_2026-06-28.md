# NestLedger — Production Readiness Analysis

_Date: 2026-06-28 · Working tree: branch `bugfix/build-error-expo` (HEAD `336ed79` + uncommitted WIP) · Method: live code/build/test verification_

## Verdict

**Not ready for a public production launch — ready for a closed beta once one P0 security item is handled.**

This analysis re-ran the actual build, tests, and security checks against the current working tree, rather than trusting the prior write-up. The existing `PRODUCTION_READINESS_AND_PREMORTEM.md` (reviewed commit `aea40b0`) still reads correctly for the committed code, but the live tree had drifted: it no longer compiled, and the history scan surfaced a leaked credential the earlier review missed. The build break is now fixed (this session). The credential leak remains open and is the one true launch blocker that is purely in your control.

## Status at a glance

| Area | Status | Notes |
|------|--------|-------|
| Frontend build (`tsc --noEmit`) | ✅ Clean | Was broken on the WIP tree (3 errors); fixed this session |
| Frontend lint (`eslint`) | ✅ Clean | Was 2 errors + warnings; fixed this session |
| Data-integrity unit tests | ✅ 13/13 pass | `selectors.dataintegrity.test.ts` — closes prior top risk |
| Form/component tests | ✅ Pass | `ProfileFormControls.test.tsx` green after repair |
| RLS in schema | ✅ Present | 61 `CREATE POLICY` statements |
| Realtime publication fix | ✅ Landed in code | `budget_plans` + `profile_members` added; **not yet applied to prod DB** |
| Working secrets (`.env`, deploy keys, GCP key) | ✅ Gitignored / untracked | Verified not currently tracked |
| **Firebase Admin SDK key in git history** | 🔴 **P0 — open** | Real service-account private key recoverable from history; **must rotate** |
| iOS pipeline (Codemagic/Apple) | 🟡 Scaffolded | Needs Apple Developer + ASC setup |
| CI tests / real-device push + realtime | 🟡 Unvalidated | Needs test Supabase project + 2-device run |
| Store-console paperwork | 🟡 Partial | Privacy policy live + linked; disclosures + legal review remain |
| Service-role key hardening | 🟡 Open | Lives on single VM + CI; rotate + restrict |
| DB backups (free Supabase) | 🟡 Deferred | DIY `pg_dump` not yet set up |

Legend: ✅ verified done · 🟡 partial / gated on accounts · 🔴 launch blocker

## What was verified this session

The data-integrity math — the biggest risk in the prior review — is genuinely covered and passing: 13/13 tests across borrow/repay netting, per-member owes (floored at 0), bill paid-vs-pending, savings balance, cycle-window scoping, and decimal-cent precision. The realtime fix is real in the code: both previously-missing tables are now in the `supabase_realtime` publication in `supabase_schema.sql` and in the standalone `migration_realtime_fix.sql` — but the migration has not yet been applied to the production database, so a second device still won't get live budget-plan or membership updates until it is. RLS is present with 61 policies. The deploy keys, `.env`, and GCP key are all properly gitignored and untracked today.

## Findings

### 1. Build break on the working tree — FIXED this session

The in-progress `spaceType` / dark-theme work left the tree non-compiling: `SpaceType` was imported from the wrong module, an `onMarkPaid` callback dropped a required third argument, a test fixture was missing the new `spaceType` field, and there were unescaped JSX apostrophes plus a dead `monthlySpend` computation. All five were corrected; `tsc` and `eslint` now exit clean and the related tests pass. (During the fix, the editor corrupted three large CRLF + emoji files mid-write — NUL-padding and end-truncation — which was caught on verification and repaired byte-for-byte; the net change is only the five intended fixes.)

### 2. Leaked Firebase Admin SDK private key in git history — P0, OPEN

Commit `21879de` committed `frontend/nestledger-de24a-firebase-adminsdk-fbsvc-d002ca62a0.json` — a real `service_account` JSON containing a `BEGIN PRIVATE KEY`. A later commit only added it to `.gitignore`; the secret is still fully recoverable from history. A Firebase Admin key grants privileged backend access to the project. **Before any launch: rotate/revoke the key in the Firebase console, and ideally purge it from history (BFG / `git filter-repo`, then force-push) and treat the old key as compromised.** The prior review flagged only the Supabase/GCP keys, so this is a separate, confirmed exposure.

## Premortem refresh

The operational and abuse risks that dominated the original audit (bad builds reaching the public, invite-endpoint abuse, single-box failure, store rejection) remain controlled — closed-testing track with a manual production gate, rate limiting, monitoring + auto-rollback + snapshots, and a live privacy policy. The data-integrity risk is now downgraded from "partially addressed" to "covered and passing." The two failure modes most likely to actually sink a launch are now:

1. **A leaked credential is exploited** (Firebase Admin key in history) — newly identified, P0, fix = rotate.
2. **Push/realtime never validated on real devices** — code is correctly wired and the realtime publication bug is fixed in code, but delivery and the two-device sync path are still unverified, and the realtime migration is not yet applied to prod.

## Recommended path to launch

1. Rotate the leaked Firebase Admin key; purge from history; confirm no key bundles into a build.
2. Apply `migration_realtime_fix.sql` to the production database.
3. Stand up the test Supabase project + CI secrets; get `backend-tests.yml` green.
4. Validate push + realtime on real Android & iOS (two devices, foreground/background/closed, reinstall).
5. Finish Codemagic/Apple iOS setup; pass TestFlight.
6. Enter store-console disclosures + privacy URL; get a legal review.
7. Rotate + lock down the Supabase service-role key; set up DIY `pg_dump` backups.
8. Ship to closed beta now (after #1); go public only once #2–#6 are green.
