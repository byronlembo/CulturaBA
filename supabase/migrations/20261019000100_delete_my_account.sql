-- Self-service account deletion (App Store guideline 5.1.1(v): an app that creates accounts
-- must let people delete them from inside the app). Deleting the auth user cascades to the
-- profile and every user table (actions, diary, points, check-ins, friends, redemptions).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
