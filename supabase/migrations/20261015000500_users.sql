-- ── Profiles (1:1 with auth.users) ──────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_anonymous boolean not null default true,
  locale text not null default 'es-AR',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Interests ───────────────────────────────────────────────────────────────

create table public.user_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  discipline text not null references public.disciplines (slug),
  weight integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, discipline)
);

-- ── Push devices (schema only in Etapa 1) ───────────────────────────────────

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  notifications_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index user_devices_user_idx on public.user_devices (user_id);

-- ── Social actions: idempotent and reversible by construction ───────────────

create table public.user_event_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  action public.user_action not null,
  -- Reserved for a future per-function "Asistiré".
  occurrence_id uuid references public.occurrences (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id, action)
);
create index user_event_actions_user_idx on public.user_event_actions (user_id, action, created_at desc);
create index user_event_actions_event_idx on public.user_event_actions (event_id, action);

create trigger user_event_actions_set_updated_at
  before update on public.user_event_actions
  for each row execute function public.set_updated_at();

-- ── Notification preferences ────────────────────────────────────────────────

create table public.user_notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  digest_enabled boolean not null default true,
  digest_hour_local integer not null default 9 check (digest_hour_local between 0 and 23),
  instant_changes boolean not null default true,
  reminders_enabled boolean not null default true,
  muted_disciplines text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger user_notification_prefs_set_updated_at
  before update on public.user_notification_prefs
  for each row execute function public.set_updated_at();
