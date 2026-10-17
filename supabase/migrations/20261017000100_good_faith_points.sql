-- Good-faith attendance points.
--  · "Fui" on a performance gives 10 points, with no location check: there is nothing real
--    to redeem yet, so points are only for the ranking. Guests can earn too (they keep the
--    points when they confirm an email; rankings only show accounts with a username).
--  · Allowed from 1 hour before a timed performance starts until 7 days after it started
--    (exhibitions: while open, or closed at most 7 days ago), once per performance, and at
--    most 3 performances per day of the performance (so a week can be logged at once).
--  · The location columns of check_ins stay for the history of verified check-ins.
-- Next step when rewards become real: a QR code at the venue.

alter table public.check_ins
  alter column lat drop not null,
  alter column lng drop not null,
  alter column accuracy_m drop not null,
  alter column distance_m drop not null,
  alter column venue_id drop not null,
  add column attended_on date;

update public.check_ins ci
set attended_on = (o.starts_at at time zone 'America/Argentina/Buenos_Aires')::date
from public.occurrences o
where o.id = ci.occurrence_id and ci.attended_on is null;

drop function public.check_in(uuid, float8, float8, float8);

create or replace function public.check_in(p_occurrence_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o record;
  today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  day date;
  new_id uuid;
  points constant integer := 10;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- Serializes a user's check-ins so the per-day limit holds under concurrent calls.
  perform pg_advisory_xact_lock(hashtext('check_in:' || uid::text));

  select oc.id, oc.event_id, oc.kind, oc.status, oc.starts_at, oc.start_date, oc.end_date,
         coalesce(oc.venue_id, e.default_venue_id) as venue_id, e.title
    into o
  from public.occurrences oc
  join public.events e on e.id = oc.event_id and e.status = 'published'
  where oc.id = p_occurrence_id;
  if not found or o.status in ('cancelled', 'postponed', 'missing') then
    raise exception 'not_available';
  end if;
  if o.kind = 'timed' then
    if now() < o.starts_at - interval '1 hour' or o.starts_at < now() - interval '7 days' then
      raise exception 'outside_window';
    end if;
    day := (o.starts_at at time zone 'America/Argentina/Buenos_Aires')::date;
  else
    if today < o.start_date or o.end_date < today - 7 then
      raise exception 'outside_window';
    end if;
    day := least(today, o.end_date);
  end if;
  if (select count(*) from public.check_ins where user_id = uid and attended_on = day) >= 3 then
    raise exception 'daily_limit';
  end if;

  begin
    insert into public.check_ins (user_id, occurrence_id, event_id, venue_id, attended_on)
    values (uid, o.id, o.event_id, o.venue_id, day)
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

revoke execute on function public.check_in(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;
