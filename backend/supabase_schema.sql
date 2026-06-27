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
  bill_tracker_enabled boolean not null default false,
  savings_tracker_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

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
