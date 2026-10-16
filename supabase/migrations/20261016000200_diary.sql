-- Diary ("Fui"): the performances a user went to, with an optional 1–5 rating and a
-- short review. Private: only the owner reads it.
-- The event's title, slug, discipline and venue are copied at insert time, so an
-- entry still reads right after the event is archived (archived events are not public).

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  occurrence_id uuid references public.occurrences (id) on delete set null,
  attended_on date not null,
  rating smallint check (rating between 1 and 5),
  review text check (char_length(review) <= 2000),
  event_title text not null,
  event_slug text not null,
  discipline text,
  venue_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id, attended_on)
);
create index diary_entries_user_idx on public.diary_entries (user_id, attended_on desc);

create trigger diary_entries_set_updated_at
  before update on public.diary_entries
  for each row execute function public.set_updated_at();

create or replace function public.diary_entry_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only events that are or were public; never candidates or rejected ones.
  select e.title, e.slug, e.primary_discipline,
         coalesce(ov.name, dv.name)
    into new.event_title, new.event_slug, new.discipline, new.venue_name
  from public.events e
  left join public.venues dv on dv.id = e.default_venue_id
  left join public.occurrences o on o.id = new.occurrence_id and o.event_id = e.id
  left join public.venues ov on ov.id = o.venue_id
  where e.id = new.event_id and e.status in ('published', 'archived');
  if not found then
    raise exception 'event % is not available', new.event_id using errcode = '23503';
  end if;
  if new.occurrence_id is not null
     and not exists (select 1 from public.occurrences o
                     where o.id = new.occurrence_id and o.event_id = new.event_id) then
    raise exception 'occurrence % is not of event %', new.occurrence_id, new.event_id
      using errcode = '23503';
  end if;
  return new;
end
$$;

create trigger diary_entries_snapshot
  before insert on public.diary_entries
  for each row execute function public.diary_entry_snapshot();

alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from anon, authenticated;
-- Column grants: the snapshot columns are written only by the trigger.
grant select, delete on public.diary_entries to authenticated;
grant insert (user_id, event_id, occurrence_id, attended_on, rating, review)
  on public.diary_entries to authenticated;
grant update (attended_on, rating, review) on public.diary_entries to authenticated;
create policy diary_entries_own on public.diary_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
