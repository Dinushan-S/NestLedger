-- Run in Supabase SQL Editor. Adds bill_trackers, savings_trackers, and tracker_id FKs.

-- 1. bill_trackers table
create table if not exists public.bill_trackers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_bill_trackers_profile_id on public.bill_trackers(profile_id);

-- 2. savings_trackers table
create table if not exists public.savings_trackers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_trackers_profile_id on public.savings_trackers(profile_id);

-- 3. Add bill/savings compatibility columns (safe to re-run)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recurring_bills' and column_name = 'tracker_id'
  ) then
    alter table public.recurring_bills add column tracker_id uuid references public.bill_trackers(id) on delete cascade;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bill_payments' and column_name = 'tracker_id'
  ) then
    alter table public.bill_payments add column tracker_id uuid references public.bill_trackers(id) on delete cascade;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bill_payments' and column_name = 'name'
  ) then
    alter table public.bill_payments add column name text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'savings' and column_name = 'tracker_id'
  ) then
    alter table public.savings add column tracker_id uuid references public.savings_trackers(id) on delete cascade;
  end if;
end $$;

-- 4. RLS for bill_trackers
alter table public.bill_trackers enable row level security;

drop policy if exists "bill trackers member select" on public.bill_trackers;
create policy "bill trackers member select" on public.bill_trackers
for select using (public.is_profile_member(profile_id));

drop policy if exists "bill trackers member insert" on public.bill_trackers;
create policy "bill trackers member insert" on public.bill_trackers
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "bill trackers member update" on public.bill_trackers;
create policy "bill trackers member update" on public.bill_trackers
for update using (public.is_profile_member(profile_id));

drop policy if exists "bill trackers member delete" on public.bill_trackers;
create policy "bill trackers member delete" on public.bill_trackers
for delete using (public.is_profile_member(profile_id));

-- 5. RLS for savings_trackers
alter table public.savings_trackers enable row level security;

drop policy if exists "savings trackers member select" on public.savings_trackers;
create policy "savings trackers member select" on public.savings_trackers
for select using (public.is_profile_member(profile_id));

drop policy if exists "savings trackers member insert" on public.savings_trackers;
create policy "savings trackers member insert" on public.savings_trackers
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "savings trackers member update" on public.savings_trackers;
create policy "savings trackers member update" on public.savings_trackers
for update using (public.is_profile_member(profile_id));

drop policy if exists "savings trackers member delete" on public.savings_trackers;
create policy "savings trackers member delete" on public.savings_trackers
for delete using (public.is_profile_member(profile_id));

-- 6. Add to realtime publication
do $$
begin
  alter publication supabase_realtime add table public.bill_trackers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.savings_trackers;
exception when duplicate_object then null;
end $$;
