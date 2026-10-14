-- ── Public, identity-free aggregates ────────────────────────────────────────

create table public.event_stats (
  event_id uuid primary key references public.events (id) on delete cascade,
  attending_count integer not null default 0 check (attending_count >= 0),
  recommend_count integer not null default 0 check (recommend_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  updated_at timestamptz not null default now()
);

-- Maintained by trigger. SECURITY DEFINER so regular users (who cannot write
-- event_stats) still update the counters through their own actions.
create or replace function public.apply_event_action_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer;
  target_event uuid;
  target_action public.user_action;
begin
  if tg_op = 'INSERT' then
    delta := 1; target_event := new.event_id; target_action := new.action;
  elsif tg_op = 'DELETE' then
    delta := -1; target_event := old.event_id; target_action := old.action;
  else
    -- UPDATE of event_id/action: treat as delete + insert.
    if old.event_id = new.event_id and old.action = new.action then
      return new;
    end if;
    perform public.bump_event_stat(old.event_id, old.action, -1);
    perform public.bump_event_stat(new.event_id, new.action, 1);
    return new;
  end if;

  perform public.bump_event_stat(target_event, target_action, delta);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.bump_event_stat(
  p_event_id uuid,
  p_action public.user_action,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_stats (event_id, attending_count, recommend_count, save_count, updated_at)
  values (
    p_event_id,
    case when p_action = 'attending' then greatest(p_delta, 0) else 0 end,
    case when p_action = 'recommend' then greatest(p_delta, 0) else 0 end,
    case when p_action = 'save' then greatest(p_delta, 0) else 0 end,
    now()
  )
  on conflict (event_id) do update set
    attending_count = greatest(public.event_stats.attending_count + case when p_action = 'attending' then p_delta else 0 end, 0),
    recommend_count = greatest(public.event_stats.recommend_count + case when p_action = 'recommend' then p_delta else 0 end, 0),
    save_count = greatest(public.event_stats.save_count + case when p_action = 'save' then p_delta else 0 end, 0),
    updated_at = now();
end
$$;

-- Only the trigger may call these.
revoke execute on function public.apply_event_action_stats() from public, anon, authenticated;
revoke execute on function public.bump_event_stat(uuid, public.user_action, integer) from public, anon, authenticated;

create trigger user_event_actions_stats
  after insert or update or delete on public.user_event_actions
  for each row execute function public.apply_event_action_stats();

-- ── Public read model (security_invoker: RLS of the base tables applies) ────

create view public.v_events_public
with (security_invoker = true)
as
select
  e.id,
  e.slug,
  e.title,
  e.subtitle,
  e.description,
  e.description_attribution,
  e.primary_discipline,
  e.ai_summary,
  e.image_url,
  e.image_source,
  e.image_credit,
  e.official_url,
  e.tickets_url,
  e.price_text,
  e.price_verified,
  e.is_free,
  e.tags,
  e.language,
  e.duration_minutes,
  e.age_rating,
  e.first_published_at,
  e.last_verified_at,
  e.updated_at,
  i.id as institution_id,
  i.slug as institution_slug,
  i.name as institution_name,
  v.id as venue_id,
  v.name as venue_name,
  v.address as venue_address,
  v.neighborhood as venue_neighborhood,
  v.lat as venue_lat,
  v.lng as venue_lng,
  coalesce(d.disciplines, '{}'::text[]) as disciplines,
  o.next_starts_at,
  o.last_ends_at,
  coalesce(o.upcoming_count, 0) as upcoming_count,
  coalesce(o.is_ongoing, false) as is_ongoing,
  coalesce(s.attending_count, 0) as attending_count,
  coalesce(s.recommend_count, 0) as recommend_count,
  coalesce(s.save_count, 0) as save_count,
  e.search_tsv
from public.events e
join public.institutions i on i.id = e.institution_id
left join public.venues v on v.id = e.default_venue_id
left join lateral (
  select array_agg(ed.discipline order by ed.is_primary desc, ed.discipline) as disciplines
  from public.event_disciplines ed
  where ed.event_id = e.id
) d on true
left join lateral (
  -- "next" = the earliest moment the event can still be attended: an ongoing
  -- exhibition counts as now, a future show as its start.
  select
    min(greatest(oc.starts_at, now())) filter (where coalesce(oc.ends_at, oc.starts_at) >= now()) as next_starts_at,
    max(coalesce(oc.ends_at, oc.starts_at)) as last_ends_at,
    (count(*) filter (where coalesce(oc.ends_at, oc.starts_at) >= now()))::int as upcoming_count,
    bool_or(oc.starts_at <= now() and coalesce(oc.ends_at, oc.starts_at) >= now()) as is_ongoing
  from public.occurrences oc
  where oc.event_id = e.id
    and oc.status not in ('missing', 'cancelled')
) o on true
left join public.event_stats s on s.event_id = e.id
where e.status = 'published';

create view public.v_occurrences_public
with (security_invoker = true)
as
select
  oc.id,
  oc.event_id,
  e.slug as event_slug,
  e.title as event_title,
  e.primary_discipline,
  coalesce(d.disciplines, '{}'::text[]) as disciplines,
  e.image_url,
  e.image_source,
  oc.kind,
  oc.starts_at,
  oc.ends_at,
  oc.start_date,
  oc.end_date,
  oc.is_all_day,
  oc.schedule_text,
  oc.status,
  oc.previous_starts_at,
  oc.status_reason,
  oc.tickets_url,
  oc.price_text,
  oc.price_verified,
  oc.is_free,
  oc.room,
  v.id as venue_id,
  v.name as venue_name,
  v.address as venue_address,
  v.lat as venue_lat,
  v.lng as venue_lng,
  i.name as institution_name
from public.occurrences oc
join public.events e on e.id = oc.event_id
join public.institutions i on i.id = e.institution_id
left join public.venues v on v.id = coalesce(oc.venue_id, e.default_venue_id)
left join lateral (
  select array_agg(ed.discipline order by ed.is_primary desc, ed.discipline) as disciplines
  from public.event_disciplines ed
  where ed.event_id = e.id
) d on true
where e.status = 'published'
  and oc.status <> 'missing';

-- Which official page(s) an event comes from, and when we last saw it there.
-- Column-level grants on source_records keep raw payloads private.
create view public.v_event_sources_public
with (security_invoker = true)
as
select
  sr.event_id,
  s.slug as source_slug,
  s.name as source_name,
  sr.url as source_url,
  sr.last_seen_at
from public.source_records sr
join public.sources s on s.id = sr.source_id
join public.events e on e.id = sr.event_id
where e.status = 'published';
