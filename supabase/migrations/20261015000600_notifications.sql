-- Schema only in Etapa 1: populated by the notification worker in Etapa 2.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  event_id uuid references public.events (id) on delete cascade,
  occurrence_id uuid references public.occurrences (id) on delete cascade,
  change_id bigint references public.event_changes (id) on delete set null,
  -- digest:<user>:<yyyy-mm-dd> | new_match:<user>:<event> | changed:<user>:<change_id>
  -- | reminder:<user>:<occurrence>:<offset>
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status public.notification_status not null default 'queued',
  expo_ticket_id text,
  expo_receipt jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_queue_idx on public.notifications (status, scheduled_for);

create table public.reminders (
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurrence_id uuid not null references public.occurrences (id) on delete cascade,
  remind_at timestamptz not null,
  notification_id uuid references public.notifications (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, occurrence_id, remind_at)
);
