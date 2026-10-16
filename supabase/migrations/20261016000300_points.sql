-- Attendance points and rewards.
--  · Points come only from a verified check-in: an email account (not a guest), at the
--    venue (venue coordinates published by the source, GPS within 300 m and accuracy
--    under 150 m), during the performance window, once per performance, max 3 a day.
--  · points_ledger is append-only: users read their own rows; only the functions below
--    write it. The balance is the sum of the ledger.
--  · rewards are loaded by the team (service role) once an institution agrees to one;
--    redeeming debits the ledger and issues a single-use code.
-- Known limit: GPS can be spoofed. A QR code at the venue is the next step.

create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8
language sql
immutable
parallel safe
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_id uuid not null references public.occurrences (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id uuid not null references public.venues (id),
  lat float8 not null,
  lng float8 not null,
  accuracy_m float8 not null,
  distance_m float8 not null,
  created_at timestamptz not null default now(),
  unique (user_id, occurrence_id)
);
create index check_ins_user_idx on public.check_ins (user_id, created_at desc);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions (id),
  title text not null,
  description text,
  terms text,
  cost integer not null check (cost > 0),
  stock integer check (stock >= 0),
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id uuid not null references public.rewards (id),
  code text not null unique,
  cost integer not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index redemptions_user_idx on public.redemptions (user_id, created_at desc);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('check_in', 'redeem', 'adjust')),
  note text,
  check_in_id uuid references public.check_ins (id),
  redemption_id uuid references public.redemptions (id),
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

create or replace function public.my_points()
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = auth.uid()
$$;

-- Errors are raised with a short key in the message (the app maps it to Spanish).
create or replace function public.check_in(
  p_occurrence_id uuid, p_lat float8, p_lng float8, p_accuracy_m float8
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o record;
  dist float8;
  today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  new_id uuid;
  points constant integer := 10;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if coalesce((select is_anonymous from auth.users where id = uid), true) then
    raise exception 'account_required';
  end if;
  -- Serializes a user's check-ins so the daily limit holds under concurrent calls.
  perform pg_advisory_xact_lock(hashtext('check_in:' || uid::text));

  select oc.id, oc.event_id, oc.kind, oc.status, oc.starts_at, oc.ends_at, oc.start_date,
         oc.end_date, v.id as venue_id, v.lat, v.lng, e.title
    into o
  from public.occurrences oc
  join public.events e on e.id = oc.event_id and e.status = 'published'
  join public.venues v on v.id = coalesce(oc.venue_id, e.default_venue_id)
  where oc.id = p_occurrence_id;
  if not found or o.status in ('cancelled', 'postponed', 'missing') then
    raise exception 'not_available';
  end if;
  if o.kind = 'timed' then
    if now() < o.starts_at - interval '1 hour'
       or now() > coalesce(o.ends_at, o.starts_at + interval '3 hours') + interval '30 minutes' then
      raise exception 'outside_window';
    end if;
  elsif today < o.start_date or today > o.end_date then
    raise exception 'outside_window';
  end if;
  if o.lat is null then raise exception 'venue_without_location'; end if;
  if p_lat is null or p_lng is null or p_accuracy_m is null or p_accuracy_m > 150 then
    raise exception 'low_accuracy';
  end if;
  dist := public.distance_m(p_lat, p_lng, o.lat, o.lng);
  if dist > 300 then raise exception 'too_far'; end if;
  if (select count(*) from public.check_ins
      where user_id = uid
        and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = today) >= 3 then
    raise exception 'daily_limit';
  end if;

  begin
    insert into public.check_ins (user_id, occurrence_id, event_id, venue_id, lat, lng, accuracy_m, distance_m)
    values (uid, o.id, o.event_id, o.venue_id, p_lat, p_lng, p_accuracy_m, dist)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'already_checked_in';
  end;
  insert into public.points_ledger (user_id, delta, reason, note, check_in_id)
  values (uid, points, 'check_in', o.title, new_id);

  return json_build_object('points', points,
    'balance', (select coalesce(sum(delta), 0) from public.points_ledger where user_id = uid));
end
$$;

create or replace function public.redeem_reward(p_reward_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
  balance integer;
  new_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  new_id uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if coalesce((select is_anonymous from auth.users where id = uid), true) then
    raise exception 'account_required';
  end if;
  -- One redemption at a time per user, so two taps cannot spend the same points.
  perform pg_advisory_xact_lock(hashtext('redeem:' || uid::text));

  select id, title, cost into r from public.rewards
  where id = p_reward_id and active
    and (valid_until is null or valid_until >= current_date)
    and (stock is null or stock > 0)
  for update;
  if not found then raise exception 'reward_unavailable'; end if;

  select coalesce(sum(delta), 0) into balance from public.points_ledger where user_id = uid;
  if balance < r.cost then raise exception 'not_enough_points'; end if;

  update public.rewards set stock = stock - 1 where id = r.id and stock is not null;
  insert into public.redemptions (user_id, reward_id, code, cost)
  values (uid, r.id, new_code, r.cost)
  returning id into new_id;
  insert into public.points_ledger (user_id, delta, reason, note, redemption_id)
  values (uid, -r.cost, 'redeem', r.title, new_id);

  return json_build_object('code', new_code, 'balance', balance - r.cost);
end
$$;

alter table public.check_ins enable row level security;
alter table public.points_ledger enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
revoke all on public.check_ins, public.points_ledger, public.rewards, public.redemptions
  from anon, authenticated;

grant select on public.check_ins, public.points_ledger, public.redemptions to authenticated;
create policy check_ins_own on public.check_ins
  for select to authenticated using (user_id = auth.uid());
create policy points_ledger_own on public.points_ledger
  for select to authenticated using (user_id = auth.uid());
create policy redemptions_own on public.redemptions
  for select to authenticated using (user_id = auth.uid());

grant select on public.rewards to anon, authenticated;
create policy rewards_public_read on public.rewards
  for select to anon, authenticated
  using (active and (valid_until is null or valid_until >= current_date));

revoke execute on function public.check_in(uuid, float8, float8, float8) from public, anon;
revoke execute on function public.redeem_reward(uuid) from public, anon;
revoke execute on function public.my_points() from public, anon;
grant execute on function public.check_in(uuid, float8, float8, float8) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.my_points() to authenticated;
