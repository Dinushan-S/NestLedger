# Slow Save Fix — Investigation & Fix Report

**Date:** 2026-07-19
**Branch:** `bugfix/build-error-expo`
**Scope:** Frontend (`frontend/components/nestledger/NestLedgerApp.tsx`, `frontend/lib/nestledger.ts`), Backend (`backend/server.py`)

---

## 1. The Issue

Saving anything in the app (expenses, savings deposits/withdrawals, bill payments, shopping items, budget plans, settings) took a long time — the button spinner ran for roughly **2–5 seconds on a typical save, and up to ~10 seconds** on the worst flows (edit expense, mark bill paid with a linked budget plan, confirm-bought with a plan).

---

## 2. How the Root Cause Was Found

The investigation followed a measure-first approach — no code was changed until the bottleneck was proven with numbers.

### Step 1: Trace the save path in code

Every save handler in `NestLedgerApp.tsx` followed the same shape:

```
await write to Supabase            (1–3 sequential REST calls)
await notifyOtherMembers(...)      (already fire-and-forget — not the problem)
await refreshProfileData(id, true) (re-fetches ALL 10 data collections)
→ only then release the spinner / update the list
```

### Step 2: Measure real network latency (the key evidence)

A trivial one-row query against the production Supabase REST API, measured from the developer's machine in Sri Lanka:

| Run | Total time | Connect | TTFB |
|-----|-----------|---------|------|
| 1 (cold) | 2.40 s | 0.49 s | 2.40 s |
| 2 | 1.35 s | 0.13 s | 1.35 s |
| 3 (warm) | 0.86 s | 0.14 s | 0.86 s |

**Every single Supabase REST call costs ~0.9–2.4 seconds** from this network.

### Step 3: Rule out the other suspects

- **Data volume:** the whole database held only ~231 expenses / 361 expense items — payload size is irrelevant.
- **Supabase region:** `ap-northeast-1` (Tokyo), status healthy. Distance from Sri Lanka explains the high per-call floor.
- **Supabase pausing:** the keepalive workflow (added Jul 16) already prevents free-tier auto-pause; the project was `ACTIVE_HEALTHY`.
- **Push notification backend:** `notifyOtherMembers` was already fire-and-forget, so the FastAPI backend was not in the blocking path.

### Conclusion — root cause

> **Slow saves = high per-request latency (~1–2.4 s/call) × the number of sequential awaited calls per save.**
> Most saves awaited 2–4 sequential "legs" (writes + a full 10-query refetch) before releasing the UI.

Example: *Mark bill paid with linked plan* = add payment → insert expense → insert expense items → full refresh = **4 sequential legs ≈ 4–10 s**.

---

## 3. The Fix (Frontend)

**Principle: the user waits only for the minimal durable write. Everything else happens in the background.**

All write APIs in `lib/nestledger.ts` already return the persisted row, so each handler now:

1. Awaits only the write(s) — independent writes run in parallel via `Promise.all`.
2. Applies the returned row directly to local state (the list updates instantly).
3. Closes the modal / releases the spinner.
4. Runs `void refreshProfileData(profileId, true)` as **background** reconciliation (the realtime subscription also re-syncs, as before).

### Changes by handler (`NestLedgerApp.tsx`)

| Flow | Before (awaited legs) | After (awaited legs) |
|------|----------------------|---------------------|
| Add expense | already optimistic (instant) | unchanged |
| **Edit expense** | 3 writes + refresh = 4 | **0 — now fully optimistic** with rollback on error |
| Borrow / Repay | 2 + refresh = 3 | 2 (returned row applied locally) |
| Savings deposit / withdraw | 1 + refresh = 2 | 1 |
| **Mark bill paid (with plan)** | 3 + refresh = 4 | **2** (payment + expense in parallel) |
| Shopping add / confirm bought | 2–4 | 1–3 |
| Create/edit plan, trackers, recurring bills | 1 + refresh = 2 | 1 |
| **Settings save** | 2 writes + 2 fetches = 3–4 | **1** (writes parallelized, returned rows applied) |
| All deletes / clear bought / mark read | 1 + refresh = 2 | 1 (local filter + background refresh) |

### Changes in `lib/nestledger.ts`

- `updateExpense`: the expense update and old-items delete touch different tables, so they now share one round trip (3 legs → 2).

**Net effect: typical saves drop from ~2–5 s to ~1–2 s; worst flows drop from ~4–10 s to ~1–3 s; expense add/edit feel instant.**

---

## 4. Backend Audit (`backend/server.py`)

All endpoints were reviewed for the same sequential-call pattern.

### Fixed: `/spaces/delete`

When the last member leaves a space, the endpoint issued **6 sequential DELETE calls** (expenses, buy_list_items, budget_plans, notifications, invitations, then profiles). Verified against the **live database**: every child table referencing `profiles` (including the bill/savings tracker tables the old code missed) has `ON DELETE CASCADE`. The five explicit deletes were redundant — deleting the `profiles` row removes everything.

**Change:** collapsed to a single `DELETE profiles` call. Space deletion now makes 5 total REST calls instead of 10. Syntax-checked with `py_compile`. **Note: the backend must be redeployed for this to take effect.**

### Reviewed, not changed (recommendations)

| Finding | Impact | Recommendation |
|---------|--------|----------------|
| `/invitations/send` does a full synchronous SMTP conversation (connect → STARTTLS → login → send) inside the request | Invite button waits ~2–8 s extra | Move email to a background task if the `email_delivered` response flag can become "queued" semantics |
| Every endpoint calls Supabase `/auth/v1/user` over the network to verify the token | +1 round trip per request | Verify the JWT locally against Supabase JWKS (no network call) |
| `/invitations/accept` chains up to 8 sequential REST calls | Rare, one-time flow | Use `on_conflict` upsert for membership to drop the pre-check; acceptable as-is |

---

## 5. Verification

- `npm run typecheck` — clean.
- `npm run test` — 7 suites, 32 tests, all pass.
- `python -m py_compile server.py` — clean.
- **Still pending:** a manual pass on a real device through save/edit/delete for expenses, bills, savings, and shopping before the next release build. The backend change needs a redeploy.

---

## 6. Longer-Term Recommendation

The ~1-second floor per request is the Tokyo round trip and cannot be fixed in code. If saves still feel sluggish after this change, **migrate the Supabase project to `ap-south-1` (Mumbai)** — roughly 3–4× lower per-call latency from Sri Lanka. This requires a project migration (new project + data copy), so treat it as a separate planned task.

---

## Appendix: claude-mem Plugin Fix (dev tooling, not app code)

**Symptom:** `UserPromptSubmit operation blocked by hook: … claude-mem worker unreachable for 50 consecutive hooks`.

**Root cause (two layers):**

1. After a reboot killed the worker daemon, Windows recycled its recorded PID (3096) to an unrelated process (brave.exe). The plugin's liveness check only tests "does the PID exist", so every session refused to respawn the worker ("Worker already running (PID alive), refusing to start duplicate") while waiting on a port that never opened. After 50 consecutive hook failures the plugin escalates to blocking prompts. **This is a plugin bug (stale PID file + PID reuse), not caused by running multiple Claude sessions** — concurrent sessions only add harmless spawn-lock contention on top.
2. The plugin had also been disabled in `~/.claude/settings.json` (`"claude-mem@thedotmack": false`), which makes the worker exit silently on every start attempt.

**Fix applied:** deleted the stale `~/.claude-mem/worker.pid`, reset `~/.claude-mem/state/hook-failures.json` to 0, re-enabled the plugin in settings, and started the worker via its own `start` command. Verified: `/api/health` returns `status: ok, initialized, mcpReady`, and the previously-blocking hook now exits 0.

**If it happens again** (e.g., after a reboot): delete `~/.claude-mem/worker.pid` and run the plugin's `start` command — full steps are saved in project memory (`claude-mem-worker-recovery`).
