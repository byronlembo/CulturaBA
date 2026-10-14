-- ── Institutions & venues ───────────────────────────────────────────────────

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  website_url text,
  created_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  institution_id uuid references public.institutions (id),
  name text not null,
  address text,
  neighborhood text,
  city text not null default 'CABA',
  lat double precision,
  lng double precision,
  -- Provenance of the address/coordinates: never invented, always traceable.
  address_source_url text,
  address_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint venues_coords_both_or_none check ((lat is null) = (lng is null))
);
create index venues_institution_idx on public.venues (institution_id);

-- ── Sources (where records come from) ───────────────────────────────────────

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  institution_id uuid references public.institutions (id),
  base_url text not null,
  kind public.source_kind not null,
  -- Higher wins editorial conflicts (institution site 100 > city aggregator 10).
  priority integer not null default 100,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Events (editorial entity) ───────────────────────────────────────────────

create table public.events (
  id uuid primary key default gen_random_uuid(),
  -- slugify(title) + '-' + first 6 hex of id. Never rotated: deep links stay stable.
  slug text not null unique,
  status public.event_status not null default 'candidate',
  candidate_reasons text[] not null default '{}',
  review_notes text,
  institution_id uuid not null references public.institutions (id),
  default_venue_id uuid references public.venues (id),
  primary_source_id uuid references public.sources (id),
  title text not null check (char_length(title) between 1 and 300),
  subtitle text,
  -- Original text from the organiser (plain) and its attribution.
  description text,
  description_html text,
  description_attribution text,
  primary_discipline text references public.disciplines (slug),
  -- "Qué esperar": generated, kept separate from the original text.
  ai_summary text,
  ai_summary_model text,
  ai_summary_source_hash text,
  ai_summary_generated_at timestamptz,
  image_url text,
  image_source public.image_source not null default 'fallback',
  image_credit text,
  official_url text,
  tickets_url text,
  price_text text,
  price_verified boolean not null default false,
  is_free boolean,
  language text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  age_rating text,
  tags text[] not null default '{}',
  dedup_key text not null,
  merged_into_event_id uuid references public.events (id),
  first_published_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector(
      'spanish',
      public.immutable_unaccent(
        coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(description, '')
      )
    )
  ) stored
);

create index events_status_idx on public.events (status);
create index events_institution_idx on public.events (institution_id);
create index events_dedup_idx on public.events (dedup_key, institution_id);
create index events_search_idx on public.events using gin (search_tsv);
create index events_title_trgm_idx on public.events
  using gin (public.immutable_unaccent(lower(title)) extensions.gin_trgm_ops);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_disciplines (
  event_id uuid not null references public.events (id) on delete cascade,
  discipline text not null references public.disciplines (slug),
  is_primary boolean not null default false,
  primary key (event_id, discipline)
);
create index event_disciplines_discipline_idx on public.event_disciplines (discipline);

-- ── Occurrences (a show's function, a workshop's date, an exhibition's span) ─

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  venue_id uuid references public.venues (id),
  room text,
  kind public.occurrence_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- Local (America/Argentina/Buenos_Aires) dates, computed by the worker because
  -- timezone() is STABLE and cannot back a generated column.
  start_date date not null,
  end_date date not null,
  is_all_day boolean not null default false,
  -- Original human text, e.g. "Martes a domingos de 11 a 20 h".
  schedule_text text,
  -- RFC 5545 RRULE when the source publishes a pattern instead of dates.
  recurrence_rule text,
  status public.occurrence_status not null default 'scheduled',
  previous_starts_at timestamptz,
  status_reason text,
  tickets_url text,
  price_text text,
  price_min numeric(12, 2),
  price_max numeric(12, 2),
  price_verified boolean not null default false,
  is_free boolean,
  -- Provenance.
  source_id uuid references public.sources (id),
  external_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  consecutive_misses integer not null default 0,
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occurrences_ends_after_starts check (ends_at is null or ends_at >= starts_at),
  constraint occurrences_dates_ordered check (end_date >= start_date),
  constraint occurrences_price_range check (
    price_min is null or price_max is null or price_max >= price_min
  ),
  constraint occurrences_unique_slot unique nulls not distinct (event_id, venue_id, starts_at)
);

create unique index occurrences_source_external_uidx
  on public.occurrences (source_id, external_id) where external_id is not null;
create index occurrences_event_starts_idx on public.occurrences (event_id, starts_at);
create index occurrences_starts_idx on public.occurrences (starts_at) where status <> 'missing';
create index occurrences_start_date_idx on public.occurrences (start_date);

create trigger occurrences_set_updated_at
  before update on public.occurrences
  for each row execute function public.set_updated_at();
