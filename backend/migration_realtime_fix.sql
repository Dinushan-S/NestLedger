-- Migration: add budget_plans and profile_members to the realtime publication.
--
-- Why: the app subscribes to postgres_changes for budget_plans and profile_members
-- (NestLedgerApp.tsx), but these tables were never added to supabase_realtime, so a
-- second device received no live updates when a budget plan changed or a member
-- joined/left. Other tables (expenses, bill_payments, savings, etc.) were already added.
--
-- Safe to run multiple times.

do $$
begin
  begin
    alter publication supabase_realtime add table public.budget_plans;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profile_members;
  exception when duplicate_object then null;
  end;
end $$;

-- Verify which tables are in the publication:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
