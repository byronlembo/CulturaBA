-- ─────────────────────────────────────────────────────────────────────────────
-- Local-only stub of what a Supabase project provides out of the box, so that
-- supabase/migrations/*.sql apply unchanged to a plain PostgreSQL 16 cluster.
--
-- NEVER run this against a real Supabase project: it already has all of this.
-- Applied by scripts/pg-local.sh and by CI before the migrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- Roles Supabase ships. service_role bypasses RLS, exactly like on Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

-- Supabase keeps extensions in their own schema and has it on the search_path.
create schema if not exists extensions;
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end
$$;
set search_path = "$user", public, extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase default privileges: every new object in public is usable by the API
-- roles; access is then restricted by RLS. Mirrored here so the explicit
-- revoke/grant step in the RLS migration behaves identically.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Minimal `auth` schema: just the parts our migrations and policies touch.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same contract as Supabase: reads the JWT claims injected by PostgREST
-- (or set with `set local request.jwt.claims = '{"sub": "...", "role": "..."}'`).
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
