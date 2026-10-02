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
