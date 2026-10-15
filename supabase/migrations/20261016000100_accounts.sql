-- A guest becomes a permanent account by confirming an email (same auth.users row,
-- so their saved events stay). Keep profiles.is_anonymous truthful when that happens.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set is_anonymous = coalesce(new.is_anonymous, false) where id = new.id;
  return new;
end
$$;

create trigger on_auth_user_updated
  after update of is_anonymous on auth.users
  for each row
  when (old.is_anonymous is distinct from new.is_anonymous)
  execute function public.handle_user_updated();

update public.profiles p
set is_anonymous = coalesce(u.is_anonymous, false)
from auth.users u
where u.id = p.id and p.is_anonymous is distinct from coalesce(u.is_anonymous, false);
