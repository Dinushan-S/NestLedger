# NestLedger — Testing & Release Validation Guide

How to move the **Test validation** gate from PARTIAL to validated. Two independent parts:

1. **Backend pytest** — already wired into CI (`.github/workflows/backend-tests.yml`); just needs a test project, seed users, and secrets. Can be fully automated.
2. **Real-device push** — manual, needs real hardware. Cannot be automated in CI.

---

## Part 1 — Backend pytest

The workflow boots `backend.server:app` and runs the suite in `backend/tests/`. The fixtures in `conftest.py` sign in two hard-coded test users and look up a household for the primary user, so those must exist in the target Supabase project.

> **Use a dedicated TEST Supabase project — never production.** The suite writes data and exercises the invite flow. The workflow sets `INVITE_EMAIL_DELIVERY: disabled`, so no real Brevo emails are sent during CI.

### Step 1 — Create the test Supabase project
Create a new project in the Supabase dashboard (e.g. `nestledger-test`). Note its **Project URL**, **anon key**, and **service-role key** (Settings → API).

### Step 2 — Apply schema + migrations
Run these against the test project (SQL editor or `psql`), in order:

- `backend/supabase_schema.sql`
- `backend/migration_bills_savings.sql`
- `backend/migration_trackers.sql`

### Step 3 — Create the two test auth users
`conftest.py` expects these exact credentials:

| Role | Email | Password |
|------|-------|----------|
| primary | `nestledger.e2e.primary@example.org` | `NestLedger123!` |
| member | `nestledger.e2e.member@example.org` | `NestLedger123!` |

Create them in the dashboard: **Authentication → Users → Add user**, set the email and password, and enable **Auto Confirm User** (so they can sign in without email verification). Do this for both.

### Step 4 — Seed profile rows for the primary user
The `primary_profile_id` fixture fails if the primary user has no household. After the two auth users exist, run the snippet below in the test project's SQL editor. It looks the users up by email, creates `user_profiles` rows, a household, and memberships — and is safe to re-run.

```sql
-- Seed app-schema rows for the e2e test users.
-- Requires the two auth users to already exist (created via Auth → Add user).
do $$
declare
  primary_uid uuid;
  member_uid  uuid;
  hh_id       uuid;
begin
  select id into primary_uid from auth.users
    where email = 'nestledger.e2e.primary@example.org';
  select id into member_uid from auth.users
    where email = 'nestledger.e2e.member@example.org';

  if primary_uid is null or member_uid is null then
    raise exception 'Create both auth users first (Auth → Users → Add user).';
  end if;

  -- public.user_profiles (app-level profile, keyed by user_id)
  insert into public.user_profiles (user_id, email, name, currency)
  values
    (primary_uid, 'nestledger.e2e.primary@example.org', 'Primary Tester', 'USD'),
    (member_uid,  'nestledger.e2e.member@example.org',  'Member Tester',  'USD')
  on conflict (user_id) do nothing;

  -- A household owned by the primary user (reuse if one already exists)
  select id into hh_id from public.profiles
    where created_by = primary_uid and name = 'TEST Household' limit 1;

  if hh_id is null then
    insert into public.profiles (name, space_type, created_by)
    values ('TEST Household', 'family', primary_uid)
    returning id into hh_id;
  end if;

  -- Memberships
  insert into public.profile_members (profile_id, user_id)
  values (hh_id, primary_uid), (hh_id, member_uid)
  on conflict (profile_id, user_id) do nothing;
end $$;
```

### Step 5 — Set the GitHub Action secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**, pointing at the **test** project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Step 6 — Run it
Push a change under `backend/**`, or go to **Actions → Backend Tests → Run workflow** (`workflow_dispatch`). Green = gate passed. The run uploads `backend_pytest_results.xml` as an artifact.

### Run locally (optional)
```bash
# from repo root
python3.11 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

export SUPABASE_URL=...            # test project
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
export APP_PUBLIC_URL=http://127.0.0.1:8001
export ALLOWED_ORIGINS=http://127.0.0.1:8001
export EXPO_BACKEND_URL=http://127.0.0.1:8001
export INVITE_EMAIL_DELIVERY=disabled

python -m uvicorn backend.server:app --host 127.0.0.1 --port 8001 &
pytest backend/tests
```

---

## Part 2 — Real-device push validation (manual)

CI cannot verify push delivery; it needs real devices. Do this once per platform before launch and re-check after any notification-related change.

### Build installable binaries
```bash
cd frontend
eas build --platform android --profile preview     # installable APK
eas build --platform ios --profile preview         # requires Apple Developer account
```

### Test matrix (run on a real Android phone, and a real iPhone for iOS)
1. Install the build and sign in.
2. Confirm a row appears in the `device_tokens` table for your user (token registered).
3. From a **second** account in the same household, trigger a notification-causing action: add an expense, send an invite, or make a savings deposit.
4. Confirm the notification arrives in each app state:
   - [ ] Foreground (app open)
   - [ ] Background (app minimized)
   - [ ] Closed (app fully killed)
5. Uninstall → reinstall → log back in → confirm the token re-registers in `device_tokens`.
6. Confirm a failed/expired token does **not** crash the app (server prunes `DeviceNotRegistered`).

### Record results
Update `test_reports/` (or the readiness checklist) with platform, OS version, date, and pass/fail per row above. Once both platforms pass, the **Test validation** gate is cleared.

---

## What "done" looks like

- [ ] CI `Backend Tests` workflow is green against the test project.
- [ ] Push validated on real Android (all three app states + reinstall).
- [ ] Push validated on real iOS (all three app states + reinstall).
- [ ] Results recorded in `test_reports/`.
