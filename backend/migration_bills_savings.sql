-- Run this entire script in your Supabase SQL editor (Dashboard → SQL Editor)

-- 1. recurring_bills table
create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  due_day int2 not null check (due_day between 1 and 31),
  notify_days_before int2 not null default 1,
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_bills_profile_id on public.recurring_bills(profile_id);

-- 2. bill_payments table
create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bill_id uuid references public.recurring_bills(id) on delete cascade,
  plan_id uuid references public.budget_plans(id) on delete set null,
  amount numeric(12,2) not null,
  units numeric,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  date date,
  month int2 not null check (month between 1 and 12),
  year int2 not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_bill_payments_profile_id on public.bill_payments(profile_id);
create index if not exists idx_bill_payments_bill_id on public.bill_payments(bill_id);

-- 3. savings table
create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null,
  note text,
  linked_plan_id uuid references public.budget_plans(id) on delete set null,
  date date not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_profile_id on public.savings(profile_id);

-- 4. Enable RLS
alter table public.recurring_bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.savings enable row level security;

-- 5. RLS Policies for recurring_bills
create policy "recurring bills member select" on public.recurring_bills
for select using (public.is_profile_member(profile_id));

create policy "recurring bills member insert" on public.recurring_bills
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

create policy "recurring bills member update" on public.recurring_bills
for update using (public.is_profile_member(profile_id));

create policy "recurring bills member delete" on public.recurring_bills
for delete using (public.is_profile_member(profile_id));

-- 6. RLS Policies for bill_payments
create policy "bill payments member select" on public.bill_payments
for select using (public.is_profile_member(profile_id));

create policy "bill payments member insert" on public.bill_payments
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

create policy "bill payments member update" on public.bill_payments
for update using (public.is_profile_member(profile_id));

create policy "bill payments member delete" on public.bill_payments
for delete using (public.is_profile_member(profile_id));

-- 7. RLS Policies for savings
create policy "savings member select" on public.savings
for select using (public.is_profile_member(profile_id));

create policy "savings member insert" on public.savings
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

create policy "savings member update" on public.savings
for update using (public.is_profile_member(profile_id));

create policy "savings member delete" on public.savings
for delete using (public.is_profile_member(profile_id));

-- 8. Add to realtime publication
do $$
begin
  alter publication supabase_realtime add table public.bill_payments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.savings;
exception when duplicate_object then null;
end $$;

-- 9. Add default_amount and default_units to recurring_bills (run even if table already exists)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recurring_bills' and column_name = 'default_amount'
  ) then
    alter table public.recurring_bills add column default_amount numeric(12,2) not null default 0;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'recurring_bills' and column_name = 'default_units'
  ) then
    alter table public.recurring_bills add column default_units numeric;
  end if;
end $$;
