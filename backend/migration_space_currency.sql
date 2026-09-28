-- Run in Supabase SQL Editor before deploying clients that read profiles.currency.
-- Existing spaces have no saved currency; use their creator's current default.
-- Correct known spaces manually if their creator changed default since creation.
alter table public.profiles add column if not exists currency text;
alter table public.profiles alter column currency drop default;

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

update public.profiles as space
set currency = coalesce(nullif(owner.currency, ''), 'USD')
from public.user_profiles as owner
where space.created_by = owner.user_id and space.currency is null;

update public.profiles set currency = 'USD' where currency is null;

alter table public.profiles alter column currency set not null;
