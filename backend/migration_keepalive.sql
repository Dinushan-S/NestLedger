-- Run this entire script in your Supabase SQL editor (Dashboard → SQL Editor)
-- Coordination table for the Supabase keep-alive pings (GitHub Actions + VM cron).
-- Prevents the free-tier project from auto-pausing after 7 days of inactivity.

create table if not exists public.keepalive_pings (
  id bigint generated always as identity primary key,
  triggered_by text not null check (triggered_by in ('github_actions', 'vm_cron')),
  triggered_at timestamptz not null default now()
);

create index if not exists idx_keepalive_pings_triggered_at on public.keepalive_pings(triggered_at desc);

alter table public.keepalive_pings enable row level security;
-- No policies granted to anon/authenticated — only the service role (which
-- bypasses RLS entirely) can read or write this table. No public access at all.
