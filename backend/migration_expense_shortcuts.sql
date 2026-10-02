-- Run in Supabase SQL Editor before using Expense Shortcuts.
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
