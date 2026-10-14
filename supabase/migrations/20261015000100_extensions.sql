-- Extensions live in the `extensions` schema (Supabase convention).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() is STABLE because the dictionary could change; pinning the
-- dictionary makes it safe to use in generated columns and indexes.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

comment on function public.immutable_unaccent(text) is
  'unaccent() with a pinned dictionary so it can back generated columns and indexes.';

-- Generic updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
