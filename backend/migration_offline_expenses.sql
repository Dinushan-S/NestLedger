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
