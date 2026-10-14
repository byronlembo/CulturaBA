-- ── Ingestion runs ──────────────────────────────────────────────────────────

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id),
  trigger public.run_trigger not null,
  status public.run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  git_sha text,
  fixture_set text,
  -- {discovered, fetched, parsed_ok, parsed_incomplete, parsed_invalid, events_created,
  --  events_updated, events_unchanged, occurrences_created, occurrences_updated,
  --  changes_major, changes_minor, missing_marked, http_requests, http_retries, duration_ms}
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  warnings text[] not null default '{}'
);
create index ingestion_runs_source_started_idx on public.ingestion_runs (source_id, started_at desc);

-- ── Source records: one row per (source, external item) ─────────────────────
-- This is the event ↔ source relation: an event has N records across sources,
-- each record points to at most one event.

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id),
  external_id text not null,
  url text not null,
  event_id uuid references public.events (id) on delete set null,
  parse_status public.parse_status not null,
  validation_errors jsonb,
  missing_fields text[] not null default '{}',
  -- Latest bounded fragment (html/json) for debugging; full pages live in fixtures.
  raw_payload jsonb,
  content_hash text,
  -- NormalizedEvent as produced by the parser (audit / replay).
  normalized jsonb,
  captured_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz,
  last_run_id uuid references public.ingestion_runs (id) on delete set null,
  consecutive_misses integer not null default 0,
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index source_records_event_idx on public.source_records (event_id);
create index source_records_source_seen_idx on public.source_records (source_id, last_seen_at);

create trigger source_records_set_updated_at
  before update on public.source_records
  for each row execute function public.set_updated_at();

alter table public.occurrences
  add column source_record_id uuid references public.source_records (id) on delete set null;
create index occurrences_source_record_idx on public.occurrences (source_record_id);

-- ── Change log (audit now, notification feed later) ─────────────────────────

create table public.event_changes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  occurrence_id uuid references public.occurrences (id) on delete cascade,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  type public.change_type not null,
  severity public.change_severity not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  detected_at timestamptz not null default now()
);
create index event_changes_event_idx on public.event_changes (event_id, detected_at desc);
create index event_changes_detected_idx on public.event_changes (detected_at desc);

-- ── Fuzzy matches that need a human decision ────────────────────────────────

create table public.event_duplicates (
  event_id uuid not null references public.events (id) on delete cascade,
  candidate_event_id uuid not null references public.events (id) on delete cascade,
  score numeric(4, 3) not null check (score >= 0 and score <= 1),
  status text not null default 'open' check (status in ('open', 'merged', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (event_id, candidate_event_id),
  constraint event_duplicates_distinct check (event_id <> candidate_event_id)
);
