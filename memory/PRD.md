# NestLedger PRD

## Problem Statement
Build **NestLedger**, a mobile family home expense manager and shared shopping list app, using an Expo React Native frontend with Supabase for auth, database, realtime updates, and session management. The user requested **email login/register** instead of Google Sign-In for now, Bento-style minimal UI, LKR/Rs. currency formatting, shared profile spaces, budget tracking, shopping lists, member invites, and notifications.

## Architecture
- **Frontend:** Expo SDK 54 + Expo Router + React Native TypeScript
- **Backend helper:** FastAPI for secure invitation + push fanout endpoints
- **Database/Auth/Realtime:** Supabase Auth, PostgREST, Realtime, and PostgreSQL schema in `/app/backend/supabase_schema.sql`
- **Email invites:** Brevo SMTP via FastAPI backend
- **Push notifications:** Expo push token registration + backend fanout endpoint (device delivery requires a real mobile device token)

## What’s Implemented
- Email sign in / register flow with Supabase session persistence
- First-run profile creation with emoji avatar selection and family/home space creation
- Profile switcher with multiple accessible spaces
- Dashboard with Bento-style cards, monthly spend summary, budget progress, shopping summary, and notification activity
- Budget plans list, create plan modal, plan detail modal, expense add bottom sheet, time/category filters
- Shared shopping list with add item flow, pending/bought filters, clear bought, and bought-state updates
- Members screen with avatar, name, email, and joined date
- Invite member flow with email invite + shareable deep link (`/invite?token=...` and `nestledger://invite?token=...`)
- Invitation acceptance backend flow and member-joined notification creation
- Notifications modal with unread badge and mark-all-read
- Supabase RLS policies + helper SQL functions for profile-scoped access control
- Backend tests for health + invitation flows and frontend self-testing with Expo preview
- Added stable `testID` coverage for core interactive controls to support reliable E2E automation

## Backlog

### P0
- Validate push notification delivery on a real Android/iOS device with live Expo push tokens
- Add second-user UI validation for invite acceptance directly through the `/invite` route flow end-to-end

### P1
- Split `NestLedgerApp.tsx` into smaller screen and feature modules for maintainability
- Add richer category picker UI for all default expense categories in the add-expense sheet
- Improve notification actions with deep links to the related screen/item

### P2
- Add profile owner/member role management if needed later
- Add recurring budgets, charts, and analytics insights
- Add avatar image upload in addition to emoji avatars