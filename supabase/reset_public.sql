-- ─────────────────────────────────────────────────────────────────────────────
-- PELIGRO: borra TODO el esquema `public` del proyecto (tablas, vistas, tipos,
-- funciones) y lo recrea vacío con los permisos que Supabase espera. Pensado para
-- arrancar de cero en un proyecto viejo en desuso. No toca auth, storage ni
-- supabase_migrations; por eso también limpia el registro de migraciones para
-- que `supabase db push` vuelva a aplicarlas todas.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- Vaciar el registro de migraciones del CLI (si alguna vez se usó).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
  ) then
    delete from supabase_migrations.schema_migrations;
  end if;
end
$$;

commit;
