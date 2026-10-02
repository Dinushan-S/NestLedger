create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  avatar_emoji text,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji_avatar text,
  space_type text not null default 'family' check (space_type in ('personal', 'family', 'trip_family', 'trip_friends', 'shared_living')),
  currency text not null,
  bill_tracker_enabled boolean not null default false,
  savings_tracker_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.set_profile_currency_on_insert()
returns trigger language plpgsql as $$
begin
  if new.currency is null then
    new.currency := coalesce((
      select nullif(currency, '') from public.user_profiles where user_id = new.created_by
    ), 'USD');
  end if;
  return new;
end $$;

drop trigger if exists profile_currency_on_insert on public.profiles;
create trigger profile_currency_on_insert before insert on public.profiles
for each row execute function public.set_profile_currency_on_insert();

create table if not exists public.profile_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(profile_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  invite_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  total_amount numeric(12,2) not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  description text,
  category text not null,
  price numeric(12,2) not null default 0,
  date timestamptz not null default now(),
  added_by uuid not null references auth.users(id) on delete cascade,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.buy_list_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  quantity text,
  category text,
  added_by uuid not null references auth.users(id) on delete cascade,
  is_bought boolean not null default false,
  bought_by uuid references auth.users(id) on delete set null,
  bought_at timestamptz,
  linked_expense_id uuid references public.expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  type text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null unique,
  platform text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profile_members_profile_id on public.profile_members(profile_id);
create index if not exists idx_profile_members_user_id on public.profile_members(user_id);
create index if not exists idx_budget_plans_profile_id on public.budget_plans(profile_id);
create index if not exists idx_expenses_profile_id on public.expenses(profile_id);
create index if not exists idx_expenses_plan_id on public.expenses(plan_id);
create index if not exists idx_expenses_paid_by on public.expenses(paid_by);
create index if not exists idx_expense_items_expense_id on public.expense_items(expense_id);
create index if not exists idx_buy_list_items_profile_id on public.buy_list_items(profile_id);
create index if not exists idx_notifications_profile_id on public.notifications(profile_id);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_device_tokens_user_id on public.device_tokens(user_id);

alter table public.user_profiles enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_members enable row level security;
alter table public.invitations enable row level security;
alter table public.budget_plans enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.buy_list_items enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;

create or replace function public.is_profile_member(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_members
    where profile_id = target_profile and user_id = auth.uid()
  ) and auth.uid() is not null;
$$;

create or replace function public.is_profile_owner(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_profile and created_by = auth.uid()
  );
$$;

create or replace function public.is_user_in_profile(target_profile uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_members
    where profile_id = target_profile and user_id = target_user
  );
$$;

create or replace function public.has_shared_profile(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_members me
    join public.profile_members them on me.profile_id = them.profile_id
    where me.user_id = auth.uid() and them.user_id = target_user
  );
$$;

grant execute on function public.is_profile_member(uuid) to authenticated;
grant execute on function public.is_profile_owner(uuid) to authenticated;
grant execute on function public.is_user_in_profile(uuid, uuid) to authenticated;
grant execute on function public.has_shared_profile(uuid) to authenticated;

drop policy if exists "user profile own select" on public.user_profiles;
create policy "user profile own select" on public.user_profiles
for select using (
  auth.uid() = user_id or public.has_shared_profile(user_id)
);

drop policy if exists "user profile own insert" on public.user_profiles;
create policy "user profile own insert" on public.user_profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "user profile own update" on public.user_profiles;
create policy "user profile own update" on public.user_profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles members select" on public.profiles;
create policy "profiles members select" on public.profiles
for select using (created_by = auth.uid() or public.is_profile_member(id));

drop policy if exists "profiles creator insert" on public.profiles;
create policy "profiles creator insert" on public.profiles
for insert with check (created_by = auth.uid());

drop policy if exists "profiles member update" on public.profiles;
create policy "profiles member update" on public.profiles
for update using (created_by = auth.uid() or public.is_profile_member(id));

drop policy if exists "profile members same profile select" on public.profile_members;
create policy "profile members same profile select" on public.profile_members
for select using (public.is_profile_member(profile_id));

drop policy if exists "profile members owner insert" on public.profile_members;
create policy "profile members owner insert" on public.profile_members
for insert with check (
  auth.uid() = user_id and public.is_profile_owner(profile_id)
);

drop policy if exists "profile members self delete" on public.profile_members;
create policy "profile members self delete" on public.profile_members
for delete using (auth.uid() = user_id);

drop policy if exists "profiles owner delete" on public.profiles;
create policy "profiles owner delete" on public.profiles
for delete using (created_by = auth.uid());

drop policy if exists "expenses member delete" on public.expenses;
create policy "expenses member delete" on public.expenses
for delete using (
  added_by = auth.uid() 
  or public.is_profile_member(profile_id)
);

drop policy if exists "notifications own delete" on public.notifications;
create policy "notifications own delete" on public.notifications
for delete using (auth.uid() = user_id);

drop policy if exists "budget plans member select" on public.budget_plans;
create policy "budget plans member select" on public.budget_plans
for select using (public.is_profile_member(profile_id));

drop policy if exists "budget plans member insert" on public.budget_plans;
create policy "budget plans member insert" on public.budget_plans
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "budget plans member update" on public.budget_plans;
create policy "budget plans member update" on public.budget_plans
for update using (public.is_profile_member(profile_id));

drop policy if exists "budget plans member delete" on public.budget_plans;
create policy "budget plans member delete" on public.budget_plans
for delete using (public.is_profile_member(profile_id));

drop policy if exists "expenses member select" on public.expenses;
create policy "expenses member select" on public.expenses
for select using (public.is_profile_member(profile_id));

drop policy if exists "expenses member insert" on public.expenses;
create policy "expenses member insert" on public.expenses
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "expenses member update" on public.expenses;
create policy "expenses member update" on public.expenses
for update using (
  added_by = auth.uid() 
  or public.is_profile_member(profile_id)
);

drop policy if exists "expense items member select" on public.expense_items;
create policy "expense items member select" on public.expense_items
for select using (
  exists (
    select 1 from public.expenses e 
    where e.id = expense_id and public.is_profile_member(e.profile_id)
  )
);

drop policy if exists "expense items member insert" on public.expense_items;
create policy "expense items member insert" on public.expense_items
for insert with check (
  exists (
    select 1 from public.expenses e 
    where e.id = expense_id and public.is_profile_member(e.profile_id)
  )
);

drop policy if exists "expense items member update" on public.expense_items;
create policy "expense items member update" on public.expense_items
for update using (
  exists (
    select 1 from public.expenses e 
    where e.id = expense_id and public.is_profile_member(e.profile_id)
  )
);

drop policy if exists "expense items member delete" on public.expense_items;
create policy "expense items member delete" on public.expense_items
for delete using (
  exists (
    select 1 from public.expenses e 
    where e.id = expense_id and public.is_profile_member(e.profile_id)
  )
);

drop policy if exists "buy list member select" on public.buy_list_items;
create policy "buy list member select" on public.buy_list_items
for select using (public.is_profile_member(profile_id));

drop policy if exists "buy list member insert" on public.buy_list_items;
create policy "buy list member insert" on public.buy_list_items
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "buy list member update" on public.buy_list_items;
create policy "buy list member update" on public.buy_list_items
for update using (public.is_profile_member(profile_id));

drop policy if exists "buy list member delete" on public.buy_list_items;
create policy "buy list member delete" on public.buy_list_items
for delete using (public.is_profile_member(profile_id));

drop policy if exists "notifications own select" on public.notifications;
create policy "notifications own select" on public.notifications
for select using (auth.uid() = user_id);

drop policy if exists "notifications member insert" on public.notifications;
create policy "notifications member insert" on public.notifications
for insert with check (
  public.is_profile_member(profile_id) and public.is_user_in_profile(profile_id, user_id)
);

drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "device tokens own select" on public.device_tokens;
create policy "device tokens own select" on public.device_tokens
for select using (auth.uid() = user_id);

drop policy if exists "device tokens own insert" on public.device_tokens;
create policy "device tokens own insert" on public.device_tokens
for insert with check (auth.uid() = user_id);

drop policy if exists "device tokens own update" on public.device_tokens;
create policy "device tokens own update" on public.device_tokens
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  begin
    alter publication supabase_realtime add table public.expenses;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.buy_list_items;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.expense_items;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.budget_plans;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profile_members;
  exception when duplicate_object then null;
  end;
end $$;

-- Migration: Rename title to description and migrate existing data
do $$
begin
  -- Rename title column to description if it exists
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'expenses' and column_name = 'title'
  ) then
    alter table public.expenses rename column title to description;
  end if;

  -- Migrate existing expenses to expense_items
  insert into public.expense_items (expense_id, name, price, created_at)
  select id, description, price, created_at
  from public.expenses
  where description is not null
  and not exists (
    select 1 from public.expense_items where expense_id = expenses.id
  );
end $$;

-- Migration: Add used_by column to expenses for personal budget usage tracking
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'expenses' and column_name = 'used_by'
  ) then
    alter table public.expenses add column used_by uuid;
    create index if not exists idx_expenses_used_by on public.expenses(used_by);
  end if;
end $$;

-- Scheduled expense templates. Each occurrence is confirmed in the app and
-- becomes a normal row in expenses; templates never create charges themselves.
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  reminder_time time not null default '09:00',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_expenses_profile_due
  on public.recurring_expenses(profile_id, is_active, next_due_date);

alter table public.recurring_expenses enable row level security;

drop policy if exists "recurring expenses member select" on public.recurring_expenses;
create policy "recurring expenses member select" on public.recurring_expenses
for select using (public.is_profile_member(profile_id));

drop policy if exists "recurring expenses member insert" on public.recurring_expenses;
create policy "recurring expenses member insert" on public.recurring_expenses
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "recurring expenses member update" on public.recurring_expenses;
create policy "recurring expenses member update" on public.recurring_expenses
for update using (public.is_profile_member(profile_id));

drop policy if exists "recurring expenses member delete" on public.recurring_expenses;
create policy "recurring expenses member delete" on public.recurring_expenses
for delete using (public.is_profile_member(profile_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.recurring_expenses;
  exception when duplicate_object then null;
  end;
end $$;

-- Saved copies of past expenses for manual one-tap entry.
create table if not exists public.expense_shortcuts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  paid_by uuid,
  used_by uuid,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.expense_shortcuts enable row level security;

drop policy if exists "expense shortcuts member select" on public.expense_shortcuts;
create policy "expense shortcuts member select" on public.expense_shortcuts
for select using (public.is_profile_member(profile_id));

drop policy if exists "expense shortcuts member insert" on public.expense_shortcuts;
create policy "expense shortcuts member insert" on public.expense_shortcuts
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "expense shortcuts member delete" on public.expense_shortcuts;
create policy "expense shortcuts member delete" on public.expense_shortcuts
for delete using (public.is_profile_member(profile_id));

-- Migration: Add used_by index (if missing from migration above)
do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'idx_expenses_used_by'
  ) then
    create index if not exists idx_expenses_used_by on public.expenses(used_by);
  end if;
end $$;

-- Table: recurring_bills — bill templates
create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tracker_id uuid references public.bill_trackers(id) on delete cascade,
  name text not null,
  category text not null,
  default_amount numeric(12,2) not null default 0,
  default_units numeric,
  due_day int2 not null check (due_day between 1 and 31),
  notify_days_before int2 not null default 1,
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_bills_profile_id on public.recurring_bills(profile_id);

-- Table: bill_trackers
create table if not exists public.bill_trackers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_bill_trackers_profile_id on public.bill_trackers(profile_id);

-- Table: bill_payments — payment records for bills
create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tracker_id uuid references public.bill_trackers(id) on delete cascade,
  bill_id uuid references public.recurring_bills(id) on delete cascade,
  plan_id uuid references public.budget_plans(id) on delete set null,
  amount numeric(12,2) not null,
  units numeric,
  name text,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  date date,
  month int2 not null check (month between 1 and 12),
  year int2 not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_bill_payments_profile_id on public.bill_payments(profile_id);
create index if not exists idx_bill_payments_bill_id on public.bill_payments(bill_id);

-- Table: savings — deposits and withdrawals
create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tracker_id uuid references public.savings_trackers(id) on delete cascade,
  amount numeric(12,2) not null,
  note text,
  name text,
  linked_plan_id uuid references public.budget_plans(id) on delete set null,
  date date not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_profile_id on public.savings(profile_id);

-- Table: savings_trackers
create table if not exists public.savings_trackers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_savings_trackers_profile_id on public.savings_trackers(profile_id);

-- RLS for bill_trackers
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

-- RLS for recurring_bills
alter table public.recurring_bills enable row level security;

drop policy if exists "recurring bills member select" on public.recurring_bills;
create policy "recurring bills member select" on public.recurring_bills
for select using (public.is_profile_member(profile_id));

drop policy if exists "recurring bills member insert" on public.recurring_bills;
create policy "recurring bills member insert" on public.recurring_bills
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "recurring bills member update" on public.recurring_bills;
create policy "recurring bills member update" on public.recurring_bills
for update using (public.is_profile_member(profile_id));

drop policy if exists "recurring bills member delete" on public.recurring_bills;
create policy "recurring bills member delete" on public.recurring_bills
for delete using (public.is_profile_member(profile_id));

-- RLS for bill_payments
alter table public.bill_payments enable row level security;

drop policy if exists "bill payments member select" on public.bill_payments;
create policy "bill payments member select" on public.bill_payments
for select using (public.is_profile_member(profile_id));

drop policy if exists "bill payments member insert" on public.bill_payments;
create policy "bill payments member insert" on public.bill_payments
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "bill payments member update" on public.bill_payments;
create policy "bill payments member update" on public.bill_payments
for update using (public.is_profile_member(profile_id));

drop policy if exists "bill payments member delete" on public.bill_payments;
create policy "bill payments member delete" on public.bill_payments
for delete using (public.is_profile_member(profile_id));

-- RLS for savings_trackers
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

-- RLS for savings

drop policy if exists "recurring bills member select" on public.recurring_bills;
create policy "recurring bills member select" on public.recurring_bills
for select using (public.is_profile_member(profile_id));

drop policy if exists "recurring bills member insert" on public.recurring_bills;
create policy "recurring bills member insert" on public.recurring_bills
for insert with check (
  created_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "recurring bills member update" on public.recurring_bills;
create policy "recurring bills member update" on public.recurring_bills
for update using (public.is_profile_member(profile_id));

drop policy if exists "recurring bills member delete" on public.recurring_bills;
create policy "recurring bills member delete" on public.recurring_bills
for delete using (public.is_profile_member(profile_id));

-- RLS for bill_payments
alter table public.bill_payments enable row level security;

drop policy if exists "bill payments member select" on public.bill_payments;
create policy "bill payments member select" on public.bill_payments
for select using (public.is_profile_member(profile_id));

drop policy if exists "bill payments member insert" on public.bill_payments;
create policy "bill payments member insert" on public.bill_payments
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "bill payments member update" on public.bill_payments;
create policy "bill payments member update" on public.bill_payments
for update using (public.is_profile_member(profile_id));

drop policy if exists "bill payments member delete" on public.bill_payments;
create policy "bill payments member delete" on public.bill_payments
for delete using (public.is_profile_member(profile_id));

-- RLS for savings
alter table public.savings enable row level security;

drop policy if exists "savings member select" on public.savings;
create policy "savings member select" on public.savings
for select using (public.is_profile_member(profile_id));

drop policy if exists "savings member insert" on public.savings;
create policy "savings member insert" on public.savings
for insert with check (
  added_by = auth.uid() and public.is_profile_member(profile_id)
);

drop policy if exists "savings member update" on public.savings;
create policy "savings member update" on public.savings
for update using (public.is_profile_member(profile_id));

drop policy if exists "savings member delete" on public.savings;
create policy "savings member delete" on public.savings
for delete using (public.is_profile_member(profile_id));

-- Add to realtime publication
do $$
begin
  begin
    alter publication supabase_realtime add table public.recurring_bills;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bill_payments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.savings;
  exception when duplicate_object then null;
  end;
end $$;

-- Migration: Add is_borrow column to separate borrow/repay records from expenses
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'expenses' and column_name = 'is_borrow'
  ) then
    alter table public.expenses add column is_borrow boolean not null default false;
    create index if not exists idx_expenses_is_borrow on public.expenses(is_borrow);
  end if;
end $$;

-- Run in Supabase SQL Editor before enabling Expense Shortcut widgets.
create table if not exists public.widget_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.widget_taps (
  session_id uuid not null references public.widget_sessions(id) on delete cascade,
  tap_id uuid not null,
  shortcut_id uuid not null,
  plan_id uuid not null,
  expense_date date not null,
  expense_id uuid,
  primary key (session_id, tap_id)
);

alter table public.widget_sessions enable row level security;
alter table public.widget_taps enable row level security;
revoke all on public.widget_sessions, public.widget_taps from public, anon, authenticated;
grant select, insert, delete on public.widget_sessions to service_role;

-- One transaction reserves the tap, creates the expense and copies its items.
create or replace function public.add_widget_expense(
  p_token_hash text,
  p_shortcut_id uuid,
  p_plan_id uuid,
  p_tap_id uuid,
  p_date date
)
returns table(expense_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.widget_sessions%rowtype;
  v_shortcut public.expense_shortcuts%rowtype;
  v_item jsonb;
  v_name text;
  v_price numeric(12,2);
  v_total numeric := 0;
  v_expense_id uuid;
  v_existing public.widget_taps%rowtype;
  v_inserted integer;
begin
  select * into v_session from public.widget_sessions s
  where s.token_hash = p_token_hash and s.expires_at > now() for share;
  if not found then
    raise exception 'WIDGET_SESSION_INVALID';
  end if;

  perform 1 from public.profile_members m
  where m.profile_id = v_session.profile_id and m.user_id = v_session.user_id for share;
  if not found then
    raise exception 'WIDGET_ACCESS_DENIED';
  end if;

  insert into public.widget_taps (session_id, tap_id, shortcut_id, plan_id, expense_date)
  values (v_session.id, p_tap_id, p_shortcut_id, p_plan_id, p_date)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing from public.widget_taps t
    where t.session_id = v_session.id and t.tap_id = p_tap_id;
    if v_existing.shortcut_id <> p_shortcut_id
       or v_existing.plan_id <> p_plan_id
       or v_existing.expense_date <> p_date then
      raise exception 'WIDGET_TAP_CONFLICT';
    end if;
    expense_id := v_existing.expense_id;
    created := false;
    return next;
    return;
  end if;

  if p_date is null
     or p_date < (now() at time zone 'UTC')::date - 30
     or p_date > (now() at time zone 'UTC')::date + 1 then
    raise exception 'WIDGET_DATE_INVALID';
  end if;

  select * into v_shortcut from public.expense_shortcuts s
  where s.id = p_shortcut_id and s.profile_id = v_session.profile_id for share;
  if not found then
    raise exception 'WIDGET_SHORTCUT_NOT_FOUND';
  end if;

  perform 1 from public.budget_plans p
  where p.id = p_plan_id and p.profile_id = v_session.profile_id for share;
  if not found then
    raise exception 'WIDGET_PLAN_NOT_FOUND';
  end if;

  if nullif(btrim(v_shortcut.category), '') is null
     or jsonb_array_length(v_shortcut.items) = 0
     or jsonb_array_length(v_shortcut.items) > 100 then
    raise exception 'WIDGET_SHORTCUT_INVALID';
  end if;
  for v_item in select value from jsonb_array_elements(v_shortcut.items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'name') <> 'string'
       or jsonb_typeof(v_item->'price') <> 'number'
       or nullif(btrim(v_item->>'name'), '') is null then
      raise exception 'WIDGET_SHORTCUT_INVALID';
    end if;
    if abs((v_item->>'price')::numeric) > 9999999999.99 then
      raise exception 'WIDGET_SHORTCUT_INVALID';
    end if;
    v_price := round((v_item->>'price')::numeric, 2);
    v_total := v_total + v_price;
  end loop;
  if abs(v_total) > 9999999999.99 then
    raise exception 'WIDGET_SHORTCUT_INVALID';
  end if;

  insert into public.expenses (
    plan_id, profile_id, description, category, price, date, added_by, paid_by, used_by
  ) values (
    p_plan_id, v_session.profile_id, nullif(btrim(v_shortcut.description), ''),
    v_shortcut.category, v_total, (p_date::text || 'T00:00:00Z')::timestamptz,
    v_session.user_id, v_shortcut.paid_by,
    case when v_shortcut.paid_by is null then v_shortcut.used_by else null end
  ) returning id into v_expense_id;

  for v_item in select value from jsonb_array_elements(v_shortcut.items) loop
    v_name := btrim(v_item->>'name');
    v_price := round((v_item->>'price')::numeric, 2);
    insert into public.expense_items (expense_id, name, price)
    values (v_expense_id, v_name, v_price);
  end loop;

  update public.widget_taps t set expense_id = v_expense_id
  where t.session_id = v_session.id and t.tap_id = p_tap_id;
  expense_id := v_expense_id;
  created := true;
  return next;
end $$;

revoke all on function public.add_widget_expense(text, uuid, uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.add_widget_expense(text, uuid, uuid, uuid, date)
  to service_role;


-- Apply before releasing the offline-capable app. One transaction saves the
-- expense and its items; replays use the device-generated expense UUID.
create or replace function public.sync_expense(
  p_expense jsonb, p_actor_id uuid, p_delete boolean default false, p_is_new boolean default false
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  incoming public.expenses;
  existing public.expenses;
  total numeric;
begin
  incoming := jsonb_populate_record(null::public.expenses, p_expense);
  if auth.uid() is null or auth.uid() is distinct from p_actor_id or
     not public.is_profile_member(incoming.profile_id) then
    raise exception 'You no longer have access to this space.' using errcode = '42501';
  end if;
  -- Include missing rows: a timed-out request may still be committing on retry.
  perform pg_advisory_xact_lock(hashtextextended(incoming.id::text, 0));
  select * into existing from public.expenses where id = incoming.id for update;
  if existing.id is not null and existing.profile_id <> incoming.profile_id then
    raise exception 'Expense belongs to a different space.' using errcode = '42501';
  end if;
  if p_delete then
    delete from public.expenses where id = incoming.id;
    if exists (select 1 from public.expenses where id = incoming.id) then
      raise exception 'You cannot delete this expense.' using errcode = '42501';
    end if;
    return;
  end if;
  if jsonb_typeof(p_expense->'items') is distinct from 'array' or
     jsonb_array_length(p_expense->'items') = 0 or
     exists (select 1 from jsonb_array_elements(p_expense->'items') item
       where jsonb_typeof(item->'name') is distinct from 'string' or nullif(trim(item->>'name'), '') is null or
         jsonb_typeof(item->'price') is distinct from 'number') or
     nullif(trim(incoming.category), '') is null or incoming.date is null or
     not exists (select 1 from public.budget_plans where id = incoming.plan_id and profile_id = incoming.profile_id) then
    raise exception 'Invalid expense data.' using errcode = '22023';
  end if;
  select sum((item->>'price')::numeric) into total from jsonb_array_elements(p_expense->'items') item;
  if existing.id is null then
    if not p_is_new or incoming.added_by <> auth.uid() then
      raise exception 'This expense was removed or belongs to another account.' using errcode = '42501';
    end if;
    insert into public.expenses (id, profile_id, plan_id, added_by, created_at,
      category, date, description, paid_by, used_by, is_borrow, price)
    values (incoming.id, incoming.profile_id, incoming.plan_id, auth.uid(), incoming.created_at,
      incoming.category, incoming.date, incoming.description, incoming.paid_by, incoming.used_by, incoming.is_borrow, total);
  else
    update public.expenses set category = incoming.category, date = incoming.date,
      description = incoming.description, paid_by = incoming.paid_by,
      used_by = incoming.used_by, price = total where id = incoming.id;
    if not found then
      raise exception 'You cannot edit this expense.' using errcode = '42501';
    end if;
  end if;
  delete from public.expense_items where expense_id = incoming.id;
  insert into public.expense_items (expense_id, name, price, created_at)
    select incoming.id, item->>'name', (item->>'price')::numeric, incoming.created_at
    from jsonb_array_elements(p_expense->'items') item;
end;
$$;
revoke all on function public.sync_expense(jsonb, uuid, boolean, boolean) from public, anon;
grant execute on function public.sync_expense(jsonb, uuid, boolean, boolean) to authenticated;
