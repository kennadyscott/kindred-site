-- ============================================================================
-- KINDRED — PENDING MIGRATIONS (run in order)
--   0025  gender identity — bucketed match scoring       (not urgent)
--   0026  license expiry date + expiring-licence report  (not urgent)
-- Neither is required for the app to work correctly today; both are
-- 42703-resilient or scoring-only. HOW: Supabase → SQL Editor → paste → Run.
-- ============================================================================

-- ============================================================================
-- 0025 -- Gender identity, and matching that survives it
--
-- Therapists now describe their gender in six answers rather than three:
--   woman | man | trans-woman | trans-man | nonbinary | prefer-not
-- Clients still state a preference in three buckets -- female | male |
-- nonbinary -- because that is what an intake question can sensibly ask, and
-- what every stored intake already says.
--
-- The join between those two vocabularies is the whole point of this file.
-- match_therapists scored gender with `t.gender = p_gender`, so the moment a
-- therapist answered "Transgender Woman" she stopped earning the 10 points a
-- client who asked for a woman intended her to have. Nothing would error; she
-- would just quietly rank lower forever. A trans woman IS a woman, so she is
-- scored as one.
--
-- SAFE TO RUN LATE. The app does not depend on this being applied: it buckets
-- gender itself for filtering, and search_therapists is no longer sent
-- p_gender at all. Until this runs, the only effect is that server-side
-- ORDERING under-credits trans therapists. After it runs, ordering is right.
--
-- search_therapists is left exactly as 0024 left it, deliberately. Its
-- p_gender is now unused by the client, and rewriting it would mean the
-- drop-view / recreate-function dance (2BP01) for a parameter nobody passes.
-- ============================================================================

-- The one place the two vocabularies meet. Immutable so it can be used in an
-- index later if gender filtering ever needs one.
create or replace function gender_bucket(g text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(g, ''))
    -- today's vocabulary
    when 'woman'       then 'female'
    when 'man'         then 'male'
    when 'trans-woman' then 'female'
    when 'trans-man'   then 'male'
    when 'nonbinary'   then 'nonbinary'
    -- what rows written before this migration hold; they map to themselves
    when 'female'      then 'female'
    when 'male'        then 'male'
    when 'non-binary'  then 'nonbinary'
    -- 'prefer-not', '', anything unrecognised: matches no stated preference
    else null
  end;
$$;

comment on function gender_bucket(text) is
  'Maps a therapist gender identity onto the three buckets a client preference can name. Null means "no bucket" -- a therapist who declined to answer is not a match for any specific gender preference.';

grant execute on function gender_bucket(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- match_therapists, unchanged from 0016 except for the one scoring line.
-- Reproduced whole because `create or replace` needs the entire body.
-- ---------------------------------------------------------------------------
create or replace function match_therapists(
  p_needs           text[]  default '{}',
  p_modality        text    default null,   -- null / 'open' = no preference
  p_style           text    default null,   -- 'gentle' | 'direct'
  p_gender          text    default null,   -- a BUCKET: female | male | nonbinary
  p_ethnicity       text    default null,
  p_lgbtq           boolean default false,
  p_affinities      text[]  default '{}',
  p_faith           text[]  default '{}',
  p_language        text    default null,
  p_format          text    default null,   -- 'video' | 'in-person'
  p_insurance       text    default null,
  p_state           text    default null,   -- therapist must be licensed here
  -- about the client themselves — feeds the therapist's private ideal boost
  p_age_band        text    default null,
  p_self_gender     text    default null,
  p_field           text    default null,
  p_has_insurance   boolean default null,
  p_prev_experience text[]  default '{}',
  p_limit           int     default 20,
  p_offset          int     default 0
)
returns table (
  user_id uuid, name text, credentials text[], pronouns text, show_pronouns boolean,
  license_states text[], website text, photo text,
  traits text[], specialties text[], modalities text[], style text, practice_type text,
  gender text, lgbtq_affirming boolean, ethnicity text, affinities text[], faith text[],
  prompt_style text, prompt_fit text, prompt_first_session text, optional_prompts jsonb,
  best_for text, persona jsonb, media jsonb,
  formats text[], insurance text[], languages text[], rate_min int, location jsonb,
  match_score int,
  is_ideal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      t.*,
      -- core: overlap with what they need help with (worth 40)
      case when cardinality(p_needs) = 0 then 0 else 40 end as need_possible,
      case
        when cardinality(p_needs) = 0 then 0
        when t.specialties && p_needs then
          least(40, 24 + (cardinality(array(
            select unnest(t.specialties) intersect select unnest(p_needs)
          )) * 8))
        when t.practice_type = 'generalist' then 22
        else 0
      end as need_earned,

      -- each stated preference is worth 10
      (
        (case when coalesce(p_modality,'open') <> 'open' then 10 else 0 end) +
        (case when p_style     is not null then 10 else 0 end) +
        (case when p_gender    is not null then 10 else 0 end) +
        (case when p_ethnicity is not null then 10 else 0 end) +
        (case when p_lgbtq                 then 10 else 0 end) +
        (case when cardinality(p_affinities) > 0 then 10 else 0 end) +
        (case when cardinality(p_faith)      > 0 then 10 else 0 end) +
        (case when p_language  is not null then 10 else 0 end) +
        (case when p_format    is not null then 10 else 0 end) +
        (case when p_insurance is not null then 10 else 0 end)
      ) as pref_possible,
      (
        (case when coalesce(p_modality,'open') <> 'open' and t.modalities @> array[p_modality] then 10 else 0 end) +
        (case when p_style     is not null and t.style     = p_style     then 10 else 0 end) +
        -- THE CHANGE: bucket, don't compare. "Transgender Woman" earns the
        -- points a client asking for a woman meant her to have.
        (case when p_gender    is not null and gender_bucket(t.gender) = p_gender then 10 else 0 end) +
        (case when p_ethnicity is not null and t.ethnicity = p_ethnicity then 10 else 0 end) +
        (case when p_lgbtq and t.lgbtq_affirming then 10 else 0 end) +
        (case when cardinality(p_affinities) > 0 and t.affinities && p_affinities then 10 else 0 end) +
        (case when cardinality(p_faith)      > 0 and t.faith      && p_faith      then 10 else 0 end) +
        (case when p_language  is not null and t.languages @> array[p_language]  then 10 else 0 end) +
        (case when p_format    is not null and t.formats   @> array[p_format]    then 10 else 0 end) +
        (case when p_insurance is not null and t.insurance @> array[p_insurance] then 10 else 0 end)
      ) as pref_earned,

      -- boost 1: does this client match the therapist's PRIVATE ideal?
      ideal_fit(t.ideal_client, p_age_band, p_self_gender, p_field,
                p_needs, p_modality, p_has_insurance) as ideal_score,
      -- boost 2: what a returning client wants different this time
      prev_experience_fit(p_prev_experience, t.style, t.modalities, t.specialties) as prev_score
    from therapists t
    where t.published = true
      and t.accepting = true
      -- Trust gate: unverified therapists are not matchable. This must live
      -- HERE as well as in therapists_public -- match_therapists reads the
      -- table directly, so gating only the view would leave the primary
      -- matching path open.
      and t.license_verified  = true
      and t.identity_verified = true
      -- A paid, verified, EMPTY profile is still not something to show a
      -- client. Stub rows exist since 0013, so completeness is now its own
      -- condition rather than an accident of a row existing at all.
      and t.name is not null and btrim(t.name) <> ''
      -- licensure is a legal constraint, not a preference, so it filters
      and (p_state is null or t.license_states @> array[p_state])
  )
  select
    s.user_id, s.name, s.credentials, s.pronouns, s.show_pronouns,
    s.license_states, s.website, s.photo,
    s.traits, s.specialties, s.modalities, s.style, s.practice_type,
    s.gender, s.lgbtq_affirming, s.ethnicity, s.affinities, s.faith,
    s.prompt_style, s.prompt_fit, s.prompt_first_session, s.optional_prompts,
    s.best_for, s.persona, s.media,
    s.formats, s.insurance, s.languages, s.rate_min, s.location,
    least(98,
      round(
        62 + (case when (s.need_possible + s.pref_possible) = 0 then 0
                   else (s.need_earned + s.pref_earned)::numeric
                        / (s.need_possible + s.pref_possible) end) * 36
        + s.ideal_score * 6
        + s.prev_score  * 5
      )
    )::int as match_score,
    (s.ideal_score >= 0.8) as is_ideal
  from scored s
  order by match_score desc, s.name asc
  limit  greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;


-- ============================================================================
-- 0026 -- When a licence expires
--
-- therapist_licenses records the number and the state and whether a human has
-- checked it, but not the one fact that stops being true on its own. A licence
-- verified in August is still marked verified in December after it lapsed, and
-- nothing in the system knows to look again.
--
-- Kindred's whole promise to a client is "this person is licensed, and we
-- checked by hand". That promise quietly expires with the licence unless the
-- date is stored beside it.
--
-- NULLABLE, deliberately. Every licence already in the table was entered
-- without one, and a NOT NULL column would mean either inventing dates or
-- blocking the therapists who are already verified. Null means "not told yet",
-- which is honest, and the app asks for it on the next edit.
--
-- SAFE TO RUN LATE. The app sends expires_on only if the column accepts it:
-- PostgREST answers an unknown column with PGRST204 / 42703, and saveLicense
-- retries once without the field. So licences keep saving before this runs,
-- just without the date.
-- ============================================================================

alter table therapist_licenses add column if not exists expires_on date;

comment on column therapist_licenses.expires_on is
  'Expiry printed on the licence. Null means the therapist has not supplied it yet -- rows predating 0026, which is most of them.';

-- The admin review queue should see a lapsed licence before a client does.
create or replace function admin_expiring_licenses(p_within_days int default 60)
returns table (
  email       text,
  name        text,
  state       text,
  license_number text,
  expires_on  date,
  days_left   int,
  verified    boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    t.name,
    l.state,
    l.license_number,
    l.expires_on,
    (l.expires_on - current_date)::int as days_left,
    (l.verified_at is not null)        as verified
  from therapist_licenses l
  join therapists t on t.user_id = l.user_id
  join auth.users  u on u.id     = l.user_id
  where l.expires_on is not null
    and l.expires_on <= current_date + greatest(0, p_within_days)
  -- already lapsed first, then soonest
  order by l.expires_on asc;
$$;

revoke all     on function admin_expiring_licenses(int) from public, anon, authenticated;
grant  execute on function admin_expiring_licenses(int) to service_role;
