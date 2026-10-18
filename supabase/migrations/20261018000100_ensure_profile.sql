-- Every auth user needs a profile: the user tables (actions, diary, points…) reference
-- profiles(id). The insert trigger covers new users, but a session created before the
-- trigger (or before a schema reset) has none, and every write then fails with a
-- foreign-key error. Backfill once, and let the app make sure on each session.

insert into public.profiles (id, is_anonymous)
select u.id, coalesce(u.is_anonymous, false)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Creates the caller's profile if missing. Returns false when the session's user no
-- longer exists (the app then signs out and starts a new guest).
create or replace function public.ensure_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  insert into public.profiles (id, is_anonymous)
  select u.id, coalesce(u.is_anonymous, false) from auth.users u where u.id = uid
  on conflict (id) do nothing;
  return exists (select 1 from public.profiles where id = uid);
end
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
