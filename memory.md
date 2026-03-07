# NestLedger Memory

## Project summary
NestLedger is a shared family finance app with household profiles, budget plans, expenses, shopping lists, member invites, and notifications.

## Current implementation status
- Email auth via Supabase is live
- Supabase schema and RLS are set up
- Budget, expense, shopping, members, invite, and notifications flows are implemented
- Brevo SMTP invite sending is wired through FastAPI
- Expo push token registration and backend fanout endpoint are implemented

## Key operational notes
- Apply `/app/backend/supabase_schema.sql` when initializing a fresh Supabase project
- Backend depends on external Supabase availability
- Push notifications still need device-level validation on real hardware
- Backend startup now validates required env config

## Important commands
```bash
sudo supervisorctl restart backend
sudo supervisorctl restart expo
curl http://127.0.0.1:8001/api/health
```

## Important files
- `/app/README.md`
- `/app/frontend/README.md`
- `/app/memory/PRD.md`
- `/app/backend/server.py`
- `/app/backend/supabase_schema.sql`
- `/app/frontend/components/nestledger/NestLedgerApp.tsx`

## Handoff notes
- Main product backlog is in `/app/memory/PRD.md`
- Test report is in `/app/test_reports/iteration_1.json`
- Backend tests for invitation flow are in `/app/backend/tests/`
- Test accounts used during validation should be treated as temporary test data

## Config placeholders to document for Git handoff
- Supabase project URL
- Supabase anon key
- Supabase service role key
- Supabase transaction pooler URI
- Brevo sender email
- SMTP host/login/password
- Expo app public URL

## Known issues / follow-up
- Preview may take time to warm up after Expo restart
- Push delivery not fully verified on physical device yet
- Frontend app shell should be modularized into smaller files

## Git note
Per your instruction, I created the docs only and did **not** push anything to Git yet.