-- RLS smoke test. Runs inside a transaction that is rolled back, so it leaves
-- the database untouched. Fails loudly (non-zero psql exit) on any violation.
--
--   pnpm db:check-rls
\set ON_ERROR_STOP on
begin;

-- ── Fixtures (as the migration owner, bypassing RLS) ────────────────────────
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', null, true),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com', false),
  ('00000000-0000-4000-8000-00000000000c', 'c@example.com', false),
  ('00000000-0000-4000-8000-00000000000d', null, true);
-- A session whose profile is missing (created before the trigger or a schema reset).
delete from public.profiles where id = '00000000-0000-4000-8000-00000000000d';

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

-- Points: a performance happening now at a venue with published coordinates.
update public.venues set lat = -34.60106, lng = -58.38253 where slug = 'teatro-colon';
insert into public.occurrences (id, event_id, venue_id, kind, starts_at, ends_at, start_date, end_date, status) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '20 minutes',
    null, current_date, current_date, 'scheduled');
-- Good-faith "Fui": three more today (per-day limit), one 3 days ago, one 8 days ago.
insert into public.occurrences (id, event_id, venue_id, kind, starts_at, ends_at, start_date, end_date, status) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '21 minutes', null, current_date, current_date, 'scheduled'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '22 minutes', null, current_date, current_date, 'scheduled'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '23 minutes', null, current_date, current_date, 'scheduled'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '3 days', null, current_date - 3, current_date - 3, 'scheduled'),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000e1',
    (select id from public.venues where slug = 'teatro-colon'), 'timed', now() - interval '8 days', null, current_date - 8, current_date - 8, 'scheduled');
insert into public.rewards (id, title, cost, stock) values
  ('00000000-0000-4000-8000-0000000000a1', 'Recompensa de prueba', 10, 1);

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
  if n <> 7 then raise exception 'anon should see 7 visible occurrences (not missing, published event), saw %', n; end if;

  select count(*) into n from public.event_disciplines;
  if n <> 2 then raise exception 'anon should see 2 discipline rows of the published event, saw %', n; end if;

  select * into v from public.v_events_public;
  if v.slug <> 'rls-published-0000e1' then raise exception 'v_events_public wrong row'; end if;
  if v.disciplines <> array['opera_clasica', 'danza'] then raise exception 'v_events_public disciplines = %', v.disciplines; end if;
  if v.upcoming_count <> 1 then raise exception 'v_events_public upcoming_count = %', v.upcoming_count; end if;
  if v.next_starts_at is null then raise exception 'v_events_public next_starts_at is null'; end if;

  select count(*) into n from public.v_occurrences_public;
  if n <> 7 then raise exception 'v_occurrences_public should expose 7 rows, saw %', n; end if;

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

  begin
    perform 1 from public.diary_entries;
    raise exception 'anon must not read diary_entries';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.rewards;
  if n <> 1 then raise exception 'anon should see the active reward, saw %', n; end if;
  begin
    perform public.check_in('00000000-0000-4000-8000-0000000000f1');
    raise exception 'anon must not check in';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.points_ledger;
    raise exception 'anon must not read points_ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.leaderboard('global');
    raise exception 'anon must not read leaderboards';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ensure_profile();
    raise exception 'anon must not call ensure_profile';
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

  -- diary: private, snapshot written by the trigger, only public events
  insert into public.diary_entries (user_id, event_id, attended_on, rating, review)
  values (auth.uid(), e1, current_date, 5, 'Hermosa');
  select count(*) into n from public.diary_entries
  where event_title = 'Evento publicado de prueba' and event_slug = 'rls-published-0000e1';
  if n <> 1 then raise exception 'diary snapshot should copy the event title and slug'; end if;
  begin
    insert into public.diary_entries (user_id, event_id, attended_on)
    values (auth.uid(), '00000000-0000-4000-8000-0000000000e2', current_date);
    raise exception 'a candidate event must not enter the diary';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.diary_entries set event_title = 'otro' where event_id = e1;
    raise exception 'snapshot columns must not be writable by users';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.diary_entries (user_id, event_id, attended_on, rating)
    values (auth.uid(), e1, current_date - 1, 6);
    raise exception 'rating must be 1 to 5';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', user_b, true);
  select count(*) into n from public.diary_entries;
  if n <> 0 then raise exception 'user B must not see user A diary, saw %', n; end if;
  perform set_config('request.jwt.claims', user_a, true);

  -- points ("Fui", good faith): guests earn too; from 1 h before a performance until 7 days
  -- after it, once per performance, at most 3 performances per day
  if (public.check_in('00000000-0000-4000-8000-0000000000f1') ->> 'balance')::int <> 10 then
    raise exception 'a guest should earn 10 points';
  end if;
  perform public.check_in('00000000-0000-4000-8000-0000000000f2');
  perform public.check_in('00000000-0000-4000-8000-0000000000f3');
  begin
    perform public.check_in('00000000-0000-4000-8000-0000000000f4');
    raise exception 'a fourth performance on the same day must not count';
  exception when raise_exception then
    if sqlerrm <> 'daily_limit' then raise; end if;
  end;
  if (public.check_in('00000000-0000-4000-8000-0000000000f5') ->> 'balance')::int <> 40 then
    raise exception 'a performance 3 days ago should count';
  end if;
  begin
    perform public.check_in('00000000-0000-4000-8000-0000000000f6');
    raise exception 'a performance 8 days ago must not count';
  exception when raise_exception then
    if sqlerrm <> 'outside_window' then raise; end if;
  end;
  begin
    perform public.check_in((select id from public.occurrences where event_id = e1 and status = 'scheduled'
      and starts_at > now() + interval '1 day'));
    raise exception 'a performance in two days must not count';
  exception when raise_exception then
    if sqlerrm <> 'outside_window' then raise; end if;
  end;
  perform set_config('request.jwt.claims', user_b, true);
  if (public.check_in('00000000-0000-4000-8000-0000000000f1') ->> 'balance')::int <> 10 then
    raise exception 'first check-in should give 10 points';
  end if;
  begin
    perform public.check_in('00000000-0000-4000-8000-0000000000f1');
    raise exception 'second check-in to the same performance must not count';
  exception when raise_exception then
    if sqlerrm <> 'already_checked_in' then raise; end if;
  end;
  if public.my_points() <> 10 then raise exception 'balance should be 10'; end if;
  begin
    insert into public.points_ledger (user_id, delta, reason) values (auth.uid(), 1000, 'adjust');
    raise exception 'users must not write the ledger';
  exception when insufficient_privilege then null;
  end;
  -- rewards: redeem debits the ledger once, stock runs out
  if length(public.redeem_reward('00000000-0000-4000-8000-0000000000a1') ->> 'code') <> 12 then
    raise exception 'redeem should return a 12-character code';
  end if;
  if public.my_points() <> 0 then raise exception 'balance should be 0 after redeeming'; end if;
  begin
    perform public.redeem_reward('00000000-0000-4000-8000-0000000000a1');
    raise exception 'a reward out of stock must not be redeemed';
  exception when raise_exception then
    if sqlerrm <> 'reward_unavailable' then raise; end if;
  end;
  select count(*) into n from public.redemptions;
  if n <> 1 then raise exception 'user B should see its redemption'; end if;

  -- friends and leaderboards: username required, requests, accept, rankings
  begin
    perform public.send_friend_request('carla');
    raise exception 'friends need a username first';
  exception when raise_exception then
    if sqlerrm <> 'username_required' then raise; end if;
  end;
  begin
    update public.profiles set username = 'Bea Bad' where id = auth.uid();
    raise exception 'usernames are lowercase letters, digits and _';
  exception when check_violation then null;
  end;
  update public.profiles set username = 'bea' where id = auth.uid();
  begin
    perform public.send_friend_request('carla');
    raise exception 'unknown usernames must not match';
  exception when raise_exception then
    if sqlerrm <> 'user_not_found' then raise; end if;
  end;
  begin
    perform 1 from public.friendships;
    raise exception 'friendships are only reachable through functions';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
  begin
    update public.profiles set username = 'bea' where id = auth.uid();
    raise exception 'usernames are unique';
  exception when unique_violation then null;
  end;
  update public.profiles set username = 'carla' where id = auth.uid();
  perform set_config('request.jwt.claims', user_b, true);
  if public.send_friend_request('@Carla') <> 'sent' then raise exception 'request should be sent'; end if;
  if public.send_friend_request('carla') <> 'pending' then raise exception 'second request should stay pending'; end if;
  if (select count(*) from public.leaderboard('friends')) <> 1 then
    raise exception 'a pending request is not a friend yet';
  end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
  if not (select incoming from public.my_friends() where username = 'bea') then
    raise exception 'carla should see an incoming request from bea';
  end if;
  perform public.respond_friend_request('bea', true);
  if (select string_agg(username || ':' || points || ':' || rank, ',') from public.leaderboard('friends')) <> 'bea:10:1,carla:0:2' then
    raise exception 'friends leaderboard = %', (select string_agg(username || ':' || points, ',') from public.leaderboard('friends'));
  end if;
  if (select string_agg(username, ',') from public.leaderboard('global')) <> 'bea,carla' then
    raise exception 'global leaderboard should list bea with points and carla as me';
  end if;
  if (select count(*) from public.leaderboard('global', now() + interval '1 day')) <> 1 then
    raise exception 'a period with no check-ins should only list me';
  end if;
  perform public.remove_friend('bea');
  if exists (select 1 from public.my_friends()) then raise exception 'remove_friend should unfriend'; end if;
  perform set_config('request.jwt.claims', user_a, true);
  begin
    perform public.send_friend_request('bea');
    raise exception 'guests cannot add friends';
  exception when raise_exception then
    if sqlerrm <> 'account_required' then raise; end if;
  end;
  perform set_config('request.jwt.claims', user_b, true);
  perform set_config('request.jwt.claims', user_a, true);
  select count(*) into n from public.points_ledger where user_id <> auth.uid();
  if n <> 0 then raise exception 'user A must not see user B points, saw %', n; end if;

  -- ensure_profile: recreates a missing profile so writes work again; false for a gone user
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
  if not public.ensure_profile() then raise exception 'ensure_profile should recreate the profile'; end if;
  insert into public.user_event_actions (user_id, event_id, action) values (auth.uid(), e1, 'save');
  if not public.ensure_profile() then raise exception 'ensure_profile should be idempotent'; end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
  if public.ensure_profile() then raise exception 'ensure_profile should be false for a deleted user'; end if;

  execute 'reset role';
  raise notice 'authenticated checks passed';
end
$$;

-- Deleting an account removes its points, check-ins and redemptions.
delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';

rollback;
\echo 'RLS smoke test: OK'
