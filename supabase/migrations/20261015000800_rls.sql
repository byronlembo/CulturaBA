-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security. Principles:
--  · The worker writes with the postgres/service role (bypasses RLS) and never
--    runs inside the mobile app.
--  · anon/authenticated can read only the published catalog.
--  · Users read and write only their own rows.
--  · Ingestion internals (raw payloads, runs, change log) are not readable by
--    the API roles at all.
-- ─────────────────────────────────────────────────────────────────────────────

-- Start from zero: Supabase default privileges grant ALL on new tables.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.disciplines enable row level security;
alter table public.institutions enable row level security;
alter table public.venues enable row level security;
alter table public.sources enable row level security;
alter table public.events enable row level security;
alter table public.event_disciplines enable row level security;
alter table public.occurrences enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.source_records enable row level security;
alter table public.event_changes enable row level security;
alter table public.event_duplicates enable row level security;
alter table public.profiles enable row level security;
alter table public.user_interests enable row level security;
alter table public.user_devices enable row level security;
alter table public.user_event_actions enable row level security;
alter table public.user_notification_prefs enable row level security;
alter table public.notifications enable row level security;
alter table public.reminders enable row level security;
alter table public.event_stats enable row level security;

-- ── Public catalog (read-only) ──────────────────────────────────────────────

grant select on public.disciplines to anon, authenticated;
create policy disciplines_public_read on public.disciplines
  for select to anon, authenticated using (true);

grant select on public.institutions to anon, authenticated;
create policy institutions_public_read on public.institutions
  for select to anon, authenticated using (true);

grant select on public.venues to anon, authenticated;
create policy venues_public_read on public.venues
  for select to anon, authenticated using (true);

-- Sources: only descriptive columns (config may hold connector internals).
grant select (id, slug, name, institution_id, base_url, kind, enabled) on public.sources
  to anon, authenticated;
create policy sources_public_read on public.sources
  for select to anon, authenticated using (enabled);

grant select on public.events to anon, authenticated;
create policy events_public_read on public.events
  for select to anon, authenticated using (status = 'published');

grant select on public.event_disciplines to anon, authenticated;
create policy event_disciplines_public_read on public.event_disciplines
  for select to anon, authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

grant select on public.occurrences to anon, authenticated;
create policy occurrences_public_read on public.occurrences
  for select to anon, authenticated using (
    status <> 'missing'
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

-- Provenance footer ("Fuente oficial · Última verificación"): a few columns,
-- only for records linked to published events. Raw payloads stay private.
grant select (id, source_id, external_id, url, event_id, last_seen_at) on public.source_records
  to anon, authenticated;
create policy source_records_public_read on public.source_records
  for select to anon, authenticated using (
    event_id is not null
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

grant select on public.event_stats to anon, authenticated;
create policy event_stats_public_read on public.event_stats
  for select to anon, authenticated using (true);

grant select on public.v_events_public, public.v_occurrences_public, public.v_event_sources_public
  to anon, authenticated;

-- ingestion_runs, event_changes, event_duplicates: RLS enabled, no policies,
-- no grants → invisible to the API roles.

-- ── User-owned rows ─────────────────────────────────────────────────────────

grant select, insert, update on public.profiles to authenticated;
create policy profiles_own_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_own_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_own_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update, delete on public.user_interests to authenticated;
create policy user_interests_own on public.user_interests
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_devices to authenticated;
create policy user_devices_own on public.user_devices
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_event_actions to authenticated;
create policy user_event_actions_own on public.user_event_actions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_notification_prefs to authenticated;
create policy user_notification_prefs_own on public.user_notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.notifications to authenticated;
create policy notifications_own_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.reminders to authenticated;
create policy reminders_own on public.reminders
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
