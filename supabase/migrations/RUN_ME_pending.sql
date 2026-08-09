-- ============================================================================
-- KINDRED — PENDING MIGRATIONS (run in order)
--   0030  "a mix of both" answers either style request
--   0031  FIX: duplicate-key on therapists_slug_key when saving a profile
--   0032  free until March 2027 — a fixed date, replacing the rolling six
--         months from 0029
--
-- HOW: Supabase → SQL Editor → New query → paste → Run.
-- ============================================================================

-- ============================================================================
-- 0030 -- "A mix of both" should answer either request
--
-- The style bonus is an equality: `t.style = p_style`. A therapist who
-- answered "a mix of both" is stored as 'balanced', which never equals
-- 'gentle' or 'direct' — so the one answer that means "I can work either way"
-- earned the bonus for NEITHER kind of client. The most flexible therapists
-- were quietly the least matchable on style.
--
-- Style is a scoring signal, not a filter, so this never hid anyone. It cost
-- them rank — which is worse in the sense that nobody could see it happening.
--
-- CREDITED BELOW AN EXACT MATCH, deliberately. A therapist who says they are
-- specifically direct is a better answer for someone asking for direct than
-- one who does both. And if 'balanced' scored full marks it would become the
-- strictly dominant answer to the signup question — every therapist should
-- tick it — which turns an honest question into a formality. 6 of 10.
--
-- Mirrors styleFit() in app/app.js. If one changes, change both.
-- ============================================================================

create or replace function style_fit(p_therapist_style text, p_wanted text)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when p_wanted is null                     then 0
    when p_therapist_style = p_wanted         then 10   -- exactly what they asked for
    when p_therapist_style = 'balanced'       then 6    -- works either way
    else 0
  end;
$$;

comment on function style_fit(text, text) is
  'Style points out of 10. An exact match scores 10; a balanced therapist scores 6 against either gentle or direct, because "a mix of both" genuinely answers both without being the sharpest answer to either.';

grant execute on function style_fit(text, text) to anon, authenticated, service_role;

-- Only the one scoring line differs from 0029.
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
        -- "a mix of both" answers either request; see style_fit()
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
-- 0031 -- "duplicate key value violates unique constraint therapists_slug_key"
--         at the end of building a profile
--
-- WHAT HAPPENS
-- saveTherapistProfile() upserts:  INSERT ... ON CONFLICT (user_id) DO UPDATE.
-- A therapists row already exists by then — 0013 creates a stub the moment
-- someone has an account — so this is an update in intent.
--
-- But ON CONFLICT names ONE arbiter index: user_id. Postgres still inserts a
-- speculative tuple and checks EVERY unique index on the table. Before that
-- insert, the BEFORE INSERT trigger set_therapist_slug() runs with
-- tg_op = 'INSERT', sees new.slug IS NULL (the app never sends a slug), and
-- computes 'kennady-scott'. Its collision check is:
--
--     where slug = candidate and user_id <> new.user_id
--
-- The row it would collide with is the therapist's OWN existing row, so
-- `user_id <> new.user_id` is false and no suffix is added. The speculative
-- tuple then carries a slug that already exists — and a conflict on a
-- NON-arbiter unique index is not handled by ON CONFLICT (user_id). It raises
-- 23505 instead of taking the DO UPDATE path.
--
-- Whether it fires depends on which unique index Postgres checks first, which
-- is why this is intermittent rather than constant.
--
-- THE FIX
-- On INSERT, if a row already exists for this user_id, leave slug NULL. The
-- partial unique index is `where slug is not null`, so NULL cannot collide;
-- the upsert then resolves on user_id as intended, and because `slug` is not
-- in the payload it is not in the DO UPDATE SET list — the existing slug is
-- preserved untouched. Exactly the desired outcome, reached without ever
-- proposing a duplicate.
--
-- Two smaller holes closed while here:
--   * kindred_slugify can return ''. Empty string is NOT NULL, so it IS
--     indexed, and a second name that slugifies to nothing would collide.
--     Falls back to 'therapist' now.
--   * the suffix was tried ONCE. If base-<4 hex> were also taken it failed.
--     Now it widens the suffix until it finds a gap.
-- ============================================================================

create or replace function set_therapist_slug() returns trigger
language plpgsql as $$
declare
  base      text;
  candidate text;
  suffix    text;
  n         int := 0;
begin
  if new.name is null or btrim(new.name) = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.slug is not null then
      return new;                      -- caller supplied one; respect it
    end if;
    /* THE FIX. This "insert" is really the speculative half of an upsert for
       somebody who already has a row. Proposing their existing slug trips the
       slug index before ON CONFLICT (user_id) can resolve. Leave it null:
       null cannot collide, the upsert lands on the user_id arbiter, and the
       existing slug survives because slug is not in the payload. */
    if exists (select 1 from therapists where user_id = new.user_id) then
      new.slug := null;
      return new;
    end if;
  else
    if new.slug is not null and new.name is not distinct from old.name then
      return new;                      -- nothing relevant changed
    end if;
  end if;

  base := kindred_slugify(new.name);
  -- '' is not null, so it would be indexed and collide with the next one.
  if base is null or base = '' then
    base := 'therapist';
  end if;

  candidate := base;
  suffix := replace(new.user_id::text, '-', '');
  while exists (
    select 1 from therapists
     where slug = candidate
       and user_id is distinct from new.user_id
  ) loop
    n := n + 1;
    exit when n > 8;                   -- 12 hex chars in; give up and let it be
    candidate := base || '-' || left(suffix, 3 + n);
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anyone whose slug never got set because the insert failed part-way. Uses the
-- same rules; the trigger will not touch a row that already has one.
-- ---------------------------------------------------------------------------
update therapists t
   set slug = case
     when exists (
       select 1 from therapists x
        where x.user_id <> t.user_id
          and x.slug = coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
     )
     then coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
          || '-' || left(replace(t.user_id::text, '-', ''), 4)
     else coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
   end
 where slug is null
   and name is not null and btrim(name) <> '';


-- ============================================================================
-- 0032 -- Free until March 2027, for everyone
--
-- 0029 gave each therapist a rolling six months starting the day they first
-- went live. That was my inference, and it was wrong: the offer is a FIXED
-- DATE. Kindred is free for therapists until March 2027 — the same date
-- whoever you are and whenever you joined.
--
-- Better in every way that matters here. It is one sentence instead of a rule
-- ("free until March 2027", not "six months from whenever you happen to be
-- verified"), it is the same promise on the website as in the app without
-- either having to compute anything, and it cannot drift per therapist.
--
-- The column stays per-row rather than becoming a constant, because a date is
-- something you will eventually want to vary — extending it for a founding
-- cohort, or giving someone who had a bad onboarding another few months —
-- and a per-row value makes that an UPDATE rather than a deploy.
-- ============================================================================

-- Everyone, including rows created before this ran.
alter table therapists
  alter column free_until set default timestamptz '2027-03-01 00:00:00+00';

update therapists
   set free_until = timestamptz '2027-03-01 00:00:00+00'
 where free_until is null
    or free_until <> timestamptz '2027-03-01 00:00:00+00';

comment on column therapists.free_until is
  'End of the free period. A fixed 2027-03-01 for the founding cohort, per-row so it can be extended for an individual without a deploy. NULL is still treated as entitled by listing_is_entitled().';

-- ---------------------------------------------------------------------------
-- The go-live trigger from 0029 no longer has a job. The clock is not started
-- by anything a therapist does; the date is simply the date.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_start_free_period on therapists;
drop function if exists start_free_period();

-- listing_is_entitled() is unchanged and still correct: free_until in the
-- future, or a live subscription. It keeps treating NULL as entitled, which
-- now only matters if someone clears the column by hand.
