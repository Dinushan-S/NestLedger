# NestLedger

NestLedger is a mobile family home expense manager and shared shopping list app built with **Expo React Native**, **FastAPI**, and **Supabase**.

## What the app does
- Email sign in and registration with Supabase Auth
- Family/home profile creation and switching
- Shared budget plans and expense tracking
- Shared shopping list with bought state updates
- Member management and invite flow
- In-app notifications and realtime sync

## Tech stack
- **Frontend:** Expo SDK 54, Expo Router, React Native, TypeScript
- **Backend:** FastAPI
- **Database/Auth/Realtime:** Supabase
- **Email:** Brevo SMTP
- **Push:** Expo notifications token registration + backend fanout endpoint

## Project structure
```text
/app
├── backend/
│   ├── server.py
│   ├── requirements.txt
│   ├── supabase_schema.sql
│   └── tests/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── constants/
│   ├── lib/
│   ├── assets/
│   └── README.md
├── memory/
│   └── PRD.md
├── memory.md
└── test_reports/
```

## Setup instructions

### 1. Frontend
```bash
cd /app/frontend
npm ci
npx expo start
```

### 2. Backend
```bash
cd /app/backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Supervisor commands in this workspace
```bash
sudo supervisorctl restart backend
sudo supervisorctl restart expo
```

## Supabase setup
Run the SQL schema before first use:

```sql
-- execute file contents from:
/app/backend/supabase_schema.sql
```

This creates:
- `user_profiles`
- `profiles`
- `profile_members`
- `invitations`
- `budget_plans`
- `expenses`
- `buy_list_items`
- `notifications`
- `device_tokens`

It also configures:
- RLS policies
- helper SQL functions for profile access
- realtime publication for expenses, shopping items, and notifications

## Environment notes

### Frontend
Frontend reads config from Expo config and public env values, including:
- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_APP_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Frontend dependency management uses npm in this repo. Keep `package-lock.json` as the single lockfile for local checks and EAS consistency.

### Backend
Backend requires values such as:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `APP_PUBLIC_URL`
- `ALLOWED_ORIGINS`
- `BREVO_FROM_EMAIL`
- `SMTP_HOST`
- `SMTP_LOGIN`
- `SMTP_PASSWORD`
- `INVITE_EMAIL_DELIVERY` (`enabled` by default; set to `disabled` only for CI/test environments that should create shareable invite links without sending email)

## Important files
- `/app/backend/server.py` — invite + push backend helper API
- `/app/backend/supabase_schema.sql` — database schema and policies
- `/app/frontend/components/nestledger/NestLedgerApp.tsx` — current main app shell
- `/app/frontend/lib/nestledger.ts` — Supabase client-side data layer
- `/app/memory/PRD.md` — product requirements and backlog
- `/app/memory.md` — handoff and maintenance notes

## Testing
- Backend health endpoint: `GET /api/health`
- Backend invitation tests live in `/app/backend/tests/`
- Test report: `/app/test_reports/iteration_1.json`
- Backend pytest requires Python plus:
  - `EXPO_BACKEND_URL` or `frontend/.env` `EXPO_PUBLIC_BACKEND_URL`; the GitHub workflow starts a local backend and sets this to `http://127.0.0.1:8001`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - seeded users `nestledger.e2e.primary@example.org` and `nestledger.e2e.member@example.org`
- Backend pytest runs in GitHub Actions through `.github/workflows/backend-tests.yml`.
- Required GitHub secrets for the backend test workflow:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Seeded backend test data must include:
  - primary test user with password `NestLedger123!`
  - member test user with password `NestLedger123!`
  - at least one household profile membership for the primary test user
- Frontend pre-release gates:
  - `npm ci`
  - `npm audit --audit-level=moderate`
  - `npx expo install --check`
  - `npx expo-doctor`
  - `node node_modules\typescript\bin\tsc --noEmit`
  - `node node_modules\eslint\bin\eslint.js .`

## Current status
- Core app flows are implemented and verified
- Invite email send/accept backend flow works
- Realtime data works after schema setup
- Push delivery still needs validation on a real mobile device

## Next recommended improvements
- Split the large frontend app file into smaller feature modules
- Add richer charts and analytics cards
- Validate production push notifications on Android and iOS devices
