-- ============================================================================
-- Reports queue — end-to-end test of the hide / dismiss / uphold cycle
--
-- Paste the whole thing into the Supabase SQL editor and run it. It ends in
-- ROLLBACK, so nothing below survives: no throwaway therapist left published,
-- no auth user to clean up, no test row a real client could ever be shown.
-- That is why this is a transaction rather than a real signup — a test profile
-- you forget to delete is a stranger's face on a matching page.
--
-- It answers five questions:
--   1. does a report actually hide them from matching?
--   2. does Dismiss put them back?
--   3. does Uphold keep them down?          <- the whole point of 0041
--   4. can the therapist lift their own removal?
--   5. is the profile still reachable by direct link while "hidden"?
--
-- Read the `pass` column. Every row should be true EXCEPT step 6, which is
-- documenting a known gap rather than asserting a fix.
-- ============================================================================

begin;

create temp table t_res(
  n int, step text, expected text, got text, pass boolean
) on commit drop;

do $$
declare
  v_uid     uuid := gen_random_uuid();
  v_rep     uuid;
  v_matched boolean;
  v_public  boolean;
  v_removed timestamptz;
  v_res     jsonb;
  v_n       int := 0;

begin
  ---------------------------------------------------------------------------
  -- Setup: one therapist who genuinely qualifies for matching.
  -- Every clause of match_therapists()'s WHERE has to be satisfied or the
  -- test would "pass" step 2 for the wrong reason — invisible because the
  -- profile was never eligible, not because the report hid them.
  ---------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'zz-reports-test@example.invalid', '',
    now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  -- license_verified / identity_verified are held back by the guard trigger
  -- (0009/0011) unless this is set. Transaction-local.
  perform set_config('kindred.verify_ok', 'on', true);

  insert into therapists (
    user_id, name, photo, specialties, best_for,
    accepting, published, license_verified, identity_verified,
    license_states, free_until
  ) values (
    v_uid, 'ZZ Reports Test', 'https://example.invalid/photo.jpg',
    array['anxiety'], 'A throwaway row inside a transaction that rolls back.',
    true, true, true, true,
    array['TX'], timestamptz '2027-03-01'
  );

  perform set_config('kindred.verify_ok', 'off', true);

  ---------------------------------------------------------------------------
  -- 1. Baseline — they must be matchable, or nothing below proves anything.
  ---------------------------------------------------------------------------
  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  v_n := v_n + 1;
  insert into t_res values (v_n, 'Baseline: a clean profile is matchable',
    'true', v_matched::text, v_matched = true);

  ---------------------------------------------------------------------------
  -- 2. A single report hides them from matching, immediately.
  ---------------------------------------------------------------------------
  insert into profile_reports (therapist_id, reason, detail)
  values (v_uid, 'nudity', 'test report — rolled back')
  returning id into v_rep;

  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  v_n := v_n + 1;
  insert into t_res values (v_n, 'One report hides them from matching',
    'false', v_matched::text, v_matched = false);

  ---------------------------------------------------------------------------
  -- 3. Dismiss relists them. This is the path that was always correct.
  ---------------------------------------------------------------------------
  perform admin_resolve_report(v_rep, 'dismissed — test');
  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  v_n := v_n + 1;
  insert into t_res values (v_n, 'Dismiss puts them back into matching',
    'true', v_matched::text, v_matched = true);

  ---------------------------------------------------------------------------
  -- 4. Uphold. The one that mattered: before 0041 this relisted them too,
  --    because the hide is derived from "has an unresolved report" and
  --    resolving is exactly what clears it.
  ---------------------------------------------------------------------------
  insert into profile_reports (therapist_id, reason, detail)
  values (v_uid, 'nudity', 'second test report — rolled back')
  returning id into v_rep;

  select admin_uphold_report(v_rep, 'upheld — test') into v_res;

  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  v_n := v_n + 1;
  insert into t_res values (v_n, 'Uphold keeps them OUT of matching',
    'false', v_matched::text, v_matched = false);

  v_n := v_n + 1;
  insert into t_res values (v_n, 'Uphold closed the report (queue clears)',
    'true',
    (select (resolved_at is not null)::text from profile_reports where id = v_rep),
    (select resolved_at is not null from profile_reports where id = v_rep));

  v_n := v_n + 1;
  insert into t_res values (v_n, 'Uphold reported back hidden=true',
    'true', coalesce(v_res->>'hidden', 'null'), (v_res->>'hidden') = 'true');

  ---------------------------------------------------------------------------
  -- 5. The hold has to survive the therapist. admin_uphold_report() is a
  --    security definer that turns the guard off with set_config(...,is_local
  --    => true) -- which lasts to the END OF THE TRANSACTION, not the end of
  --    the function. In production every API call is its own transaction so
  --    this never bites, but here it would let the update below through and
  --    the test would report a hole that does not exist. Turn it back off.
  ---------------------------------------------------------------------------
  perform set_config('kindred.verify_ok', 'off', true);

  update therapists
     set removed_at = null, published = true, accepting = true
   where user_id = v_uid;

  select removed_at into v_removed from therapists where user_id = v_uid;
  v_n := v_n + 1;
  insert into t_res values (v_n, 'Therapist cannot lift their own removal',
    'still set', coalesce(v_removed::text, 'CLEARED'), v_removed is not null);

  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  v_n := v_n + 1;
  insert into t_res values (v_n, '...and still cannot get back into matching',
    'false', v_matched::text, v_matched = false);

  ---------------------------------------------------------------------------
  -- 6. KNOWN GAP, not a fix. While a report is open the profile is out of
  --    matching but still readable at profile.html?id=<uuid>, because
  --    therapists_public is published+accepting and nothing else. That is
  --    what lets HQ review the thing that was reported -- and it means
  --    "clients stop seeing it" is not true for anyone holding the link.
  ---------------------------------------------------------------------------
  perform set_config('kindred.verify_ok', 'on', true);
  update therapists set removed_at = null, published = true, accepting = true
   where user_id = v_uid;
  perform set_config('kindred.verify_ok', 'off', true);

  insert into profile_reports (therapist_id, reason) values (v_uid, 'nudity');

  select exists (select 1 from match_therapists() m where m.user_id = v_uid) into v_matched;
  select exists (select 1 from therapists_public   p where p.user_id = v_uid) into v_public;

  v_n := v_n + 1;
  insert into t_res values (v_n,
    'GAP: reported profile is out of matching but still live by direct link',
    'matching=false, direct=true',
    'matching=' || v_matched::text || ', direct=' || v_public::text,
    (v_matched = false and v_public = true));
end $$;

select n as "#", step, expected, got,
       case when pass then 'PASS' else '*** FAIL ***' end as result
  from t_res
 order by n;

-- Nothing above is kept. Remove this line only if you want the test data to
-- persist, and then you own cleaning it up.
rollback;
