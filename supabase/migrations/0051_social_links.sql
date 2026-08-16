-- ============================================================================
-- 0051 -- Social links: instagram and linkedin beside the website
--
-- A raw URL on a swipe card is noise. Desirae's Instagram rendered as
-- "www.instagram.com/balancedintherapy/" -- four times longer than her rate,
-- her location and her format put together, and less legible than an icon
-- anyone would recognise instantly.
--
-- Two text columns rather than a jsonb blob: these are three specific,
-- long-lived fields with three specific icons, not an open set. A blob would
-- also mean every consumer parsing it, and the match function returning it,
-- for no gain.
--
-- The match function has to be rewritten to add them to its RETURNS TABLE --
-- but its body was copied verbatim from 0037 by script rather than retyped,
-- with exactly two insertions: the two columns in the signature and the two
-- in the final projection. The inner CTE is `select t.*`, so the values flow
-- through untouched. Nothing else about matching changed, and nothing else
-- could have.
--
-- ONE PASTE. The 2BP01 dance is the same as every other view change here:
-- search_therapists returns setof therapists_public, so it goes first.
-- ============================================================================

alter table therapists
  add column if not exists instagram text not null default '',
  add column if not exists linkedin  text not null default '';

comment on column therapists.instagram is 'Instagram handle or URL. Shown as an icon on the card, never as raw text.';
comment on column therapists.linkedin  is 'LinkedIn URL. Shown as an icon on the card, never as raw text.';

-- ---------------------------------------------------------------------------
-- The public view
-- ---------------------------------------------------------------------------
drop function if exists search_therapists(text, text, text, text, int);
drop view     if exists therapists_public;

create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, website, instagram, linkedin, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media, blocks,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         search_doc,
         license_verified, identity_verified,
         payment_options, site
    from therapists
   where website_live = true
     and license_verified  = true
     and identity_verified = true
     and removed_at is null
     and not has_open_report(user_id)
     and listing_is_entitled(free_until, subscription_status)
     and profile_is_publishable(name, specialties, best_for, optional_prompts, blocks, persona, prompt_fit, photo);

grant select on therapists_public to anon, authenticated;

create or replace function search_therapists(
  p_query  text,
  p_state  text default null,
  p_gender text default null,
  p_format text default null,
  p_limit  int  default 30
)
returns setof therapists_public
language sql
stable
set search_path = public
as $$
  select p.*
  from therapists_public p
  where (p_query is null or p_query = ''
         or p.search_doc @@ plainto_tsquery('english', p_query))
    and (p_state  is null or p.license_states @> array[p_state])
    and (p_gender is null or gender_bucket(p.gender) = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function search_therapists to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The match function. Body copied from 0037; only the two columns are new.
-- drop first: 42P13 forbids changing a return type with create or replace.
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
  -- added in 0051
  instagram text, linkedin text,
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
    s.instagram, s.linkedin,
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
