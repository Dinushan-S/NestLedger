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

## Refactor note
`components/nestledger/NestLedgerApp.tsx` currently contains most app flows in one file and should be split into smaller feature modules later.
# Build triggered for HTTPS update
