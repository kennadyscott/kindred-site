-- ============================================================================
-- 0037 -- match_therapists() was withholding three columns the client reads
--
-- THE BUG THAT MATTERS
-- Everything a therapist builds in "Get to know you" -- the drag-to-arrange
-- feed, up to four photos, the hello video, the ORDER they chose -- is stored
-- in therapists.blocks. profileFeedHtml() renders it from t.blocks.
--
-- match_therapists() never returned that column. So a client's row arrived
-- with no blocks, dbRowToTherapist() omitted the key, and getToKnowBlocks()
-- quietly rebuilt a DEFAULT arrangement out of optional_prompts instead.
--
-- The therapist sees their feed in preview, because their own row is loaded
-- with select=*. The client sees the lead photo and some text in an order
-- nobody chose. No error, no warning, and the two views disagree by design of
-- the accident. Every feed photo uploaded so far has been invisible.
--
-- TWO MORE, SAME CAUSE
--   license_verified  -- the "License verified" badge could never render on a
--                        matched card. You pay a human to establish that fact
--                        and then drop it before the one person it is for.
--   payment_options   -- hasSlidingScale() reads it (0035-era consolidation),
--                        so "Sliding scale available" never showed to a
--                        client, and any future payment fact would not either.
--
-- THE REAL PROBLEM IS STRUCTURAL
-- This function hard-codes a column list that has to agree with what
-- dbRowToTherapist() reads, 4,000 lines away in app.js, with nothing checking.
-- Fields were added to therapists (blocks in 0024, payment_options in 0019)
-- without being added here, and nothing failed loudly. The app now asserts the
-- contract at boot -- see assertMatchRowContract() -- so the next omission
-- shows up in the console instead of as missing photos.
--
-- NOT ADDED, deliberately:
--   ideal_client              private by design; the whole point is clients
--                             never see it
--   license_number,
--   license_rejected_reason   admin-only
--   subscription_status,
--   free_until, published,
--   accepting                 gating fields. match_therapists() already
--                             filters on them, so a row that comes back has
--                             passed. Shipping them would leak billing state
--                             to clients for no gain.
--
-- Identical to 0030 except the three added columns. Scoring, filtering and
-- style_fit() are untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DROP FIRST. `create or replace` cannot change a function's return type --
-- Postgres raises 42P13 -- and adding three OUT columns is exactly that.
-- The full argument list is required because the name alone is ambiguous.
--
-- Safe here: dropping and recreating happens inside one transaction in the
-- SQL editor, so there is no window where a client can call a missing
-- function. The grant at the end restores execute permission, which the drop
-- takes with it.
-- ---------------------------------------------------------------------------
drop function if exists match_therapists(
  text[], text, text, text, text, boolean, text[], text[], text, text,
  text, text, text, text, text, boolean, text[], integer, integer
);

create or replace function match_therapists(
  p_needs           text[]  default '{}',
  p_modality        text    default null,
  p_style           text    default null,
  p_gender          text    default null,
  p_ethnicity       text    default null,
  p_lgbtq           boolean default false,
  p_affinities      text[]  default '{}',
  p_faith           text[]  default '{}',
  p_language        text    default null,
  p_format          text    default null,
  p_insurance       text    default null,
  p_state           text    default null,
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
  -- added in 0037
  blocks jsonb, license_verified boolean, payment_options text[],
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
        style_fit(t.style, p_style) +
        (case when p_gender    is not null and gender_bucket(t.gender) = p_gender then 10 else 0 end) +
        (case when p_ethnicity is not null and t.ethnicity = p_ethnicity then 10 else 0 end) +
        (case when p_lgbtq and t.lgbtq_affirming then 10 else 0 end) +
        (case when cardinality(p_affinities) > 0 and t.affinities && p_affinities then 10 else 0 end) +
        (case when cardinality(p_faith)      > 0 and t.faith      && p_faith      then 10 else 0 end) +
        (case when p_language  is not null and t.languages @> array[p_language]  then 10 else 0 end) +
        (case when p_format    is not null and t.formats   @> array[p_format]    then 10 else 0 end) +
        (case when p_insurance is not null and t.insurance @> array[p_insurance] then 10 else 0 end)
      ) as pref_earned,
      ideal_fit(t.ideal_client, p_age_band, p_self_gender, p_field,
                p_needs, p_modality, p_has_insurance) as ideal_score,
      prev_experience_fit(p_prev_experience, t.style, t.modalities, t.specialties) as prev_score
    from therapists t
    where t.accepting = true
      and t.license_verified  = true
      and t.identity_verified = true
      and t.removed_at is null
      and listing_is_entitled(t.free_until, t.subscription_status)
      and profile_is_publishable(t.name, t.specialties, t.best_for, t.optional_prompts, t.blocks, t.persona, t.prompt_fit, t.photo)
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
    -- added in 0037: the feed itself, the badge, and the payment facts
    s.blocks, s.license_verified, s.payment_options,
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

comment on function match_therapists is
  'Scored, filtered match results. Returns the PUBLIC profile including blocks (the ordered feed), license_verified (the badge) and payment_options. Deliberately excludes ideal_client, licence identifiers and all billing state. If you add a public column to therapists that the app renders, add it here too -- assertMatchRowContract() in app.js will complain if you forget.';

grant execute on function match_therapists to anon, authenticated, service_role;

-- Proof: a returned row now carries the feed.
--   select blocks is not null as has_feed, license_verified, payment_options
--     from match_therapists() limit 1;
