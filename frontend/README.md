# NestLedger Frontend

This folder contains the Expo React Native frontend for NestLedger.

## Main responsibilities
- Authentication UI
- Profile creation and switching
- Dashboard, budgets, expenses, shopping, profile, and notifications UI
- Supabase session + realtime subscriptions
- Invite acceptance route handling

## Key files
- `app/_layout.tsx` — root Expo Router layout
- `app/index.tsx` — app entry screen
- `app/invite.tsx` — invite acceptance entry route
- `components/nestledger/NestLedgerApp.tsx` — current main app implementation
- `components/ui/` — shared UI pieces
- `constants/nestledger.ts` — theme and display constants
- `lib/config.ts` — frontend runtime config
- `lib/supabase.ts` — Supabase client
- `lib/nestledger.ts` — app data access layer

## Run locally
```bash
cd /app/frontend
yarn install
npx expo start
```

## Required public config
- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_APP_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Notes
- App scheme: `nestledger`
- Invite fallback route: `/invite?token=...`
- Push token registration is wired, but real push delivery must be validated on device
- For reliable automation, core controls now include `testID` props

## Offline expenses
- After one online sign-in and data load, cached spaces, budgets, expenses, and tracker data open offline.
- Adding, editing, deleting, and resetting loaded expenses saves to account-scoped AsyncStorage before the app confirms success. Pending expenses count toward local totals immediately and survive closing the app.
- While the app is open, reconnecting or returning to the foreground automatically syncs pending changes. Background/closed-app sync is not supported. Database and auth requests pause offline; a foreground reachability check runs every 15 seconds with a 3-second timeout.
- Sync uses stable expense IDs and a transactional database function. Failed permissions or validation leave the change saved locally and show a Retry action. Editing the same expense on multiple devices uses the last successfully synced edit.
- Account changes cannot read or upload another account's cache. Pending changes are retained for that account; clearing app data or uninstalling removes them.
- New sign-ins, space/budget creation, shared shopping changes, bill/savings writes, invites, receipt scanning, and notification delivery require internet. Saved expense shortcuts can still add expenses offline.

Apply `backend/migration_offline_expenses.sql` in Supabase before distributing this app version. The migration keeps existing row-level security and saves each expense with its items in one transaction. Without it, changes stay local and the sync error remains visible.

Run `npm run test:offline`, `npm run typecheck`, and `npm run lint`. The offline regression script simulates storage, server responses, and connection loss against the real app data functions and startup hook. Before release, also sign in/load a budget on a phone, enable airplane mode, reopen the app, add/edit/delete an expense, close/reopen, then reconnect and verify the database and a second device have exactly one final copy.

## Refactor note
`components/nestledger/NestLedgerApp.tsx` currently contains most app flows in one file and should be split into smaller feature modules later.
# Build triggered for HTTPS update
