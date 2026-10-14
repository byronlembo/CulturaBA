-- RLS smoke test. Runs inside a transaction that is rolled back, so it leaves
-- the database untouched. Fails loudly (non-zero psql exit) on any violation.
--
--   pnpm db:check-rls
\set ON_ERROR_STOP on
begin;

-- ── Fixtures (as the migration owner, bypassing RLS) ────────────────────────
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', null, true),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com', false);

insert into public.events (id, slug, status, institution_id, default_venue_id, title, dedup_key, official_url, primary_discipline, candidate_reasons)
values
  ('00000000-0000-4000-8000-0000000000e1', 'rls-published-0000e1', 'published',
    (select id from public.institutions where slug = 'teatro-colon'),
    (select id from public.venues where slug = 'teatro-colon'),
    'Evento publicado de prueba', 'evento publicado de prueba|teatro-colon', 'https://example.org/e1', 'opera_clasica', '{}'),
  ('00000000-0000-4000-8000-0000000000e2', 'rls-candidate-0000e2', 'candidate',
    (select id from public.institutions where slug = 'mnba'),
    (select id from public.venues where slug = 'mnba'),
    'Evento candidato de prueba', 'evento candidato de prueba|mnba', 'https://example.org/e2', null, '{missing:discipline}');

insert into public.event_disciplines (event_id, discipline, is_primary) values
  ('00000000-0000-4000-8000-0000000000e1', 'opera_clasica', true),
  ('00000000-0000-4000-8000-0000000000e1', 'danza', false);

insert into public.occurrences (event_id, venue_id, kind, starts_at, ends_at, start_date, end_date, status) values
  ('00000000-0000-4000-8000-0000000000e1', (select id from public.venues where slug = 'teatro-colon'),
    'timed', now() + interval '2 days', null, (now() + interval '2 days')::date, (now() + interval '2 days')::date, 'scheduled'),
  ('00000000-0000-4000-8000-0000000000e1', (select id from public.venues where slug = 'teatro-colon'),
    'timed', now() + interval '3 days', null, (now() + interval '3 days')::date, (now() + interval '3 days')::date, 'missing'),
  ('00000000-0000-4000-8000-0000000000e2', (select id from public.venues where slug = 'mnba'),
    'range', now() - interval '1 day', now() + interval '30 days', (now() - interval '1 day')::date, (now() + interval '30 days')::date, 'scheduled');

insert into public.source_records (source_id, external_id, url, event_id, parse_status, raw_payload, captured_at) values
  ((select id from public.sources where slug = 'teatro-colon'), 'rls-x1', 'https://example.org/e1', '00000000-0000-4000-8000-0000000000e1', 'ok', '{"secret": true}', now()),
  ((select id from public.sources where slug = 'mnba'), 'rls-x2', 'https://example.org/e2', '00000000-0000-4000-8000-0000000000e2', 'incomplete', '{}', now());

insert into public.ingestion_runs (source_id, trigger, status) values
  ((select id from public.sources where slug = 'teatro-colon'), 'fixture', 'succeeded');

-- ── anon: published catalog only, no ingestion internals ────────────────────
do $$
declare
  n integer;
  v record;
begin
  execute 'set local role anon';

  select count(*) into n from public.events;
  if n <> 1 then raise exception 'anon should see exactly 1 published event, saw %', n; end if;

  select count(*) into n from public.occurrences;
  if n <> 1 then raise exception 'anon should see 1 visible occurrence (not missing, published event), saw %', n; end if;

  select count(*) into n from public.event_disciplines;
  if n <> 2 then raise exception 'anon should see 2 discipline rows of the published event, saw %', n; end if;

  select * into v from public.v_events_public;
  if v.slug <> 'rls-published-0000e1' then raise exception 'v_events_public wrong row'; end if;
  if v.disciplines <> array['opera_clasica', 'danza'] then raise exception 'v_events_public disciplines = %', v.disciplines; end if;
  if v.upcoming_count <> 1 then raise exception 'v_events_public upcoming_count = %', v.upcoming_count; end if;
  if v.next_starts_at is null then raise exception 'v_events_public next_starts_at is null'; end if;

  select count(*) into n from public.v_occurrences_public;
  if n <> 1 then raise exception 'v_occurrences_public should expose 1 row, saw %', n; end if;

  select count(*) into n from public.v_event_sources_public;
  if n <> 1 then raise exception 'v_event_sources_public should expose 1 row, saw %', n; end if;

  select count(*) into n from public.source_records;
  if n <> 1 then raise exception 'anon should see 1 source_record (published only), saw %', n; end if;

  begin
    perform raw_payload from public.source_records;
    raise exception 'anon must not read source_records.raw_payload';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.ingestion_runs;
    raise exception 'anon must not read ingestion_runs';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.event_changes;
    raise exception 'anon must not read event_changes';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.profiles;
    raise exception 'anon must not read profiles';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.user_event_actions (user_id, event_id, action)
    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000e1', 'save');
    raise exception 'anon must not insert user_event_actions';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'anon checks passed';
end
$$;

-- ── authenticated: own rows only; counters via trigger; idempotent actions ──
do $$
declare
  n integer;
  user_a constant text := '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';
  user_b constant text := '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';
  e1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', user_a, true);

  if auth.uid() <> '00000000-0000-4000-8000-00000000000a' then raise exception 'auth.uid() mismatch'; end if;

  -- profile created by the auth.users trigger, readable only by its owner
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'user A should see exactly its own profile, saw %', n; end if;

  insert into public.user_event_actions (user_id, event_id, action) values (auth.uid(), e1, 'save');
  insert into public.user_event_actions (user_id, event_id, action) values (auth.uid(), e1, 'save')
    on conflict (user_id, event_id, action) do nothing;  -- idempotent
  insert into public.user_event_actions (user_id, event_id, action) values (auth.uid(), e1, 'attending');

  select save_count into n from public.event_stats where event_id = e1;
  if n <> 1 then raise exception 'save_count should be 1 after idempotent double insert, is %', n; end if;
  select attending_count into n from public.event_stats where event_id = e1;
  if n <> 1 then raise exception 'attending_count should be 1, is %', n; end if;

  begin
    insert into public.user_event_actions (user_id, event_id, action) values (auth.uid(), e1, 'save');
    raise exception 'duplicate action must violate the unique constraint';
  exception when unique_violation then null;
  end;

  begin
    insert into public.user_event_actions (user_id, event_id, action)
    values ('00000000-0000-4000-8000-00000000000b', e1, 'save');
    raise exception 'user A must not insert rows for user B';
  exception when insufficient_privilege then null;
  end;

  -- switch to user B
  perform set_config('request.jwt.claims', user_b, true);
  select count(*) into n from public.user_event_actions;
  if n <> 0 then raise exception 'user B must not see user A actions, saw %', n; end if;
  select count(*) into n from public.user_interests;
  if n <> 0 then raise exception 'user B interests should be empty'; end if;
  select save_count into n from public.event_stats where event_id = e1;
  if n <> 1 then raise exception 'user B should still read public counters'; end if;

  insert into public.user_interests (user_id, discipline) values (auth.uid(), 'cine'), (auth.uid(), 'danza');
  select count(*) into n from public.user_interests;
  if n <> 2 then raise exception 'user B should see its 2 interests'; end if;

  -- back to A: reversible
  perform set_config('request.jwt.claims', user_a, true);
  delete from public.user_event_actions where event_id = e1 and action = 'save';
  select save_count into n from public.event_stats where event_id = e1;
  if n <> 0 then raise exception 'save_count should be 0 after delete, is %', n; end if;
  select count(*) into n from public.user_interests;
  if n <> 0 then raise exception 'user A must not see user B interests, saw %', n; end if;

  execute 'reset role';
  raise notice 'authenticated checks passed';
end
$$;

rollback;
\echo 'RLS smoke test: OK'
