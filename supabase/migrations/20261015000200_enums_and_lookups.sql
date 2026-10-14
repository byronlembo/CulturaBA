-- ── Enums ───────────────────────────────────────────────────────────────────

-- candidate: incomplete or unclassified, pending review (never shown).
-- published: visible in the app.
-- suspended: disappeared from every source; hidden until it reappears.
-- archived: every occurrence is in the past (housekeeping job).
-- rejected: a reviewer decided it is not a real event.
create type public.event_status as enum ('candidate', 'published', 'suspended', 'archived', 'rejected');

create type public.occurrence_status as enum (
  'scheduled', 'rescheduled', 'cancelled', 'postponed', 'sold_out', 'missing'
);

-- timed: exact start instant. all_day: a whole local day. range: a span of days
-- (exhibitions) with opening hours in schedule_text.
create type public.occurrence_kind as enum ('timed', 'all_day', 'range');

create type public.run_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.run_trigger as enum ('manual', 'cron', 'fixture');
create type public.parse_status as enum ('ok', 'incomplete', 'invalid');

create type public.change_type as enum (
  'event_created',
  'event_published',
  'event_suspended',
  'event_reappeared',
  'field_changed',
  'occurrence_added',
  'occurrence_rescheduled',
  'occurrence_cancelled',
  'occurrence_status_changed',
  'occurrence_venue_changed',
  'occurrence_missing',
  'occurrence_reappeared'
);
create type public.change_severity as enum ('major', 'minor');

create type public.user_action as enum ('attending', 'recommend', 'save');

create type public.notification_kind as enum ('digest', 'new_match', 'event_changed', 'reminder');
create type public.notification_status as enum ('queued', 'sent', 'failed', 'skipped');

create type public.source_kind as enum ('html', 'json_api', 'jsonld', 'rss', 'browser');
create type public.image_source as enum ('source', 'fallback');

-- ── Lookups ─────────────────────────────────────────────────────────────────

-- A table rather than an enum so labels can change without a type migration.
-- Keep in sync with packages/shared/src/constants/disciplines.ts.
create table public.disciplines (
  slug text primary key,
  label_es text not null,
  short_label_es text not null,
  selectable boolean not null default true,
  sort_order integer not null default 100,
  fallback_image_key text not null
);

comment on table public.disciplines is
  'User-facing categories (9 selectable + internal "otros"). Mirrors shared/constants/disciplines.ts.';
