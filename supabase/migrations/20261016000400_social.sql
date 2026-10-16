-- Friends and leaderboards.
--  · Each account picks a public @username (profiles.username). It is the only thing
--    other users ever see, together with check-in points on the leaderboards.
--  · friendships has no grants: users read and change it only through the functions
--    below, which need an email account with a username.
--  · Leaderboards rank points earned by check-ins (redemptions do not lower them):
--    global (users with a username and points) or me + accepted friends.

alter table public.profiles add column username text unique
  check (username ~ '^[a-z0-9_]{3,20}$');

create table public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- The caller, if it may use friends: signed in, email account, username set.
create or replace function public.social_me()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if coalesce((select is_anonymous from auth.users where id = uid), true) then
    raise exception 'account_required';
  end if;
  if (select username from public.profiles where id = uid) is null then
    raise exception 'username_required';
  end if;
  return uid;
end
$$;

-- Another account by @username (guests never match).
create or replace function public.account_by_username(p_username text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p join auth.users u on u.id = p.id
  where p.username = lower(trim(both '@ ' from p_username)) and not coalesce(u.is_anonymous, true)
$$;

-- Sends a request, or accepts the one the other person already sent.
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.social_me();
  other uuid := public.account_by_username(p_username);
  f record;
begin
  if other is null then raise exception 'user_not_found'; end if;
  if other = me then raise exception 'self'; end if;
  select * into f from public.friendships
  where (requester = me and addressee = other) or (requester = other and addressee = me);
  if found then
    if f.status = 'accepted' then return 'already_friends'; end if;
    if f.requester = other then
      update public.friendships set status = 'accepted', accepted_at = now()
      where requester = other and addressee = me;
      return 'accepted';
    end if;
    return 'pending';
  end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'too_many_requests';
  end if;
  insert into public.friendships (requester, addressee) values (me, other);
  return 'sent';
end
$$;

create or replace function public.respond_friend_request(p_username text, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.social_me();
  other uuid := public.account_by_username(p_username);
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester = other and addressee = me and status = 'pending';
  else
    delete from public.friendships
    where requester = other and addressee = me and status = 'pending';
  end if;
  if not found then raise exception 'no_request'; end if;
end
$$;

-- Unfriend, cancel a sent request or reject a received one.
create or replace function public.remove_friend(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.social_me();
  other uuid := public.account_by_username(p_username);
begin
  delete from public.friendships
  where (requester = me and addressee = other) or (requester = other and addressee = me);
end
$$;

create or replace function public.my_friends()
returns table (username text, status text, incoming boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.username, f.status, f.addressee = auth.uid()
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.status, p.username
$$;

-- Top 50 plus the caller. p_scope: 'global' or 'friends'; p_since null = all time.
create or replace function public.leaderboard(p_scope text, p_since timestamptz default null)
returns table (rank bigint, username text, points bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with scores as (
    select l.user_id, sum(l.delta)::bigint as points
    from public.points_ledger l
    where l.reason = 'check_in' and (p_since is null or l.created_at >= p_since)
    group by l.user_id
  ),
  people as (
    select p.id, p.username
    from public.profiles p
    where p.username is not null
      and (p_scope = 'global'
           or p.id = auth.uid()
           or exists (
             select 1 from public.friendships f
             where f.status = 'accepted'
               and ((f.requester = auth.uid() and f.addressee = p.id)
                    or (f.addressee = auth.uid() and f.requester = p.id))))
  ),
  ranked as (
    select rank() over (order by coalesce(s.points, 0) desc) as rank,
           pe.username, coalesce(s.points, 0) as points, pe.id = auth.uid() as is_me
    from people pe
    left join scores s on s.user_id = pe.id
    where p_scope <> 'global' or s.points > 0 or pe.id = auth.uid()
  )
  select * from ranked where rank <= 50 or is_me order by rank, username
$$;

revoke execute on function public.social_me() from public, anon, authenticated;
revoke execute on function public.account_by_username(text) from public, anon, authenticated;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(text, boolean) from public, anon;
revoke execute on function public.remove_friend(text) from public, anon;
revoke execute on function public.my_friends() from public, anon;
revoke execute on function public.leaderboard(text, timestamptz) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.leaderboard(text, timestamptz) to authenticated;
