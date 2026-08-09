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
