-- ============================================================================
-- 0027 -- A name is not a profile
--
-- The publish gate has been `name is not null and btrim(name) <> ''` since
-- 0016. Everything else about a listing is optional as far as the database is
-- concerned, so a therapist could pay, pass both checks, go live, and be
-- shown to clients as a name, a "Specialties" heading with nothing under it,
-- and an empty "Get to Know Them" section.
--
-- Kindred's entire pitch to a client is that this is more than a specialty
-- filter -- that you are reading how someone works before you choose them.
-- A blank profile is a worse first impression than no profile, and it is
-- indistinguishable to the client from the product not working.
--
-- Three conditions added:
--   A PHOTO      the card's whole job is "can I picture talking to them"
--   SPECIALTIES  what matching filters on and what the card shows
--   A VOICE      at least one answered prompt, or a best_for line
--
-- WHAT "A VOICE" MEANS HERE, precisely: any ONE of best_for, prompt_fit,
-- persona.inOffice, persona.outOfOffice, an answered element of
-- optional_prompts, or an answered prompt block in `blocks`. Deliberately
-- generous, and it must stay in step with hasWrittenVoice() in app/app.js --
-- if the two disagree, one side calls a profile finished that the other hides.
-- A floor against emptiness, not an editor. Whitespace does not count.
--
-- THIS SUPERSEDES 0025. That migration bucketed gender in match_therapists;
-- rather than depend on the order they get run in, this file recreates
-- gender_bucket() and carries the same change. Running 0027 alone leaves both
-- correct; running 0025 first and then 0027 is also fine.
--
-- WHO THIS HIDES. Any currently published therapist missing a photo, a
-- specialty, or a written answer drops out of client results the moment this
-- runs. That is the intent, and at Kindred's current size it should be
-- nobody -- check before running:
--     select name, photo is not null as has_photo, specialties, best_for from therapists
--      where published and license_verified and identity_verified;
-- Their listing, subscription and data are untouched; the app shows them
-- exactly what is missing and they reappear as soon as they fill it in.
-- ============================================================================

-- Recreated here so 0027 stands alone -- see the note above.
create or replace function gender_bucket(g text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(g, ''))
    when 'woman'       then 'female'
    when 'man'         then 'male'
    when 'trans-woman' then 'female'
    when 'trans-man'   then 'male'
    when 'nonbinary'   then 'nonbinary'
    when 'female'      then 'female'
    when 'male'        then 'male'
    when 'non-binary'  then 'nonbinary'
    else null
  end;
$$;

grant execute on function gender_bucket(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The one definition of "this profile is fit to show a client". Both the view
-- and the matching function call it, so they cannot drift apart -- which is
-- exactly how the app ended up with two different answers to the same
-- question in the first place.
-- ---------------------------------------------------------------------------
-- Every column a therapist's own words can land in. Miss one and the database
-- hides someone the app has told is finished -- the same contradiction this
-- work started from, one field over. The app's profileGaps() checks exactly
-- this set; keep them together.
create or replace function profile_is_publishable(
  p_name             text,
  p_specialties      text[],
  p_best_for         text,
  p_optional_prompts jsonb,
  p_blocks           jsonb  default '[]'::jsonb,
  p_persona          jsonb  default '{}'::jsonb,
  p_prompt_fit       text   default null,
  p_photo            text   default null
) returns boolean
language sql
immutable
set search_path = public
as $$
  select
        p_name is not null and btrim(p_name) <> ''
    -- Initials on a coloured block are not a face. The client's real question
    -- is whether they can picture opening up to this person, and the card
    -- cannot answer it without one.
    and btrim(coalesce(p_photo, '')) <> ''
    and coalesce(array_length(p_specialties, 1), 0) > 0
    and (
          btrim(coalesce(p_best_for, ''))   <> ''
       or btrim(coalesce(p_prompt_fit, '')) <> ''
       or btrim(coalesce(p_persona->>'inOffice', ''))    <> ''
       or btrim(coalesce(p_persona->>'outOfOffice', '')) <> ''
       or exists (
            select 1
            from jsonb_array_elements(coalesce(p_optional_prompts, '[]'::jsonb)) e
            where btrim(coalesce(e->>'answer', '')) <> ''
          )
       or exists (
            select 1
            from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) b
            where b->>'type' = 'prompt' and btrim(coalesce(b->>'answer', '')) <> ''
          )
        );
$$;

comment on function profile_is_publishable(text, text[], text, jsonb, jsonb, jsonb, text, text) is
  'A profile is fit to show a client when it has a name, a photo, at least one specialty, and at least one thing written in the therapist''s own words (best_for, prompt_fit, either persona line, or any answered prompt or feed block).';

grant execute on function profile_is_publishable(text, text[], text, jsonb, jsonb, jsonb, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The client-facing view. search_therapists is `returns setof therapists_public`
-- so the view cannot be dropped while it exists (2BP01) -- drop the function
-- first, same dance as every other view change here.
-- ---------------------------------------------------------------------------
drop function if exists search_therapists(text, text, text, text, int);
drop view if exists therapists_public;

create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media, blocks,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         search_doc,
         license_verified, identity_verified,
         payment_options
  from therapists
  where published = true
    and accepting = true
    and license_verified  = true
    and identity_verified = true
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
    -- bucketed: a trans woman answers a request for a woman
    and (p_gender is null or gender_bucket(p.gender) = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- match_therapists reads the table directly, so it needs the same gate --
-- gating only the view would leave the primary matching path wide open.
-- Body is 0016's, with 0025's gender bucketing and the content condition.
-- ---------------------------------------------------------------------------
create or replace function match_therapists(
  p_needs           text[]  default '{}',
  p_modality        text    default null,
  p_style           text    default null,
  p_gender          text    default null,   -- a BUCKET: female | male | nonbinary
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
        (case when p_style     is not null and t.style     = p_style     then 10 else 0 end) +
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
    where t.published = true
      and t.accepting = true
      and t.license_verified  = true
      and t.identity_verified = true
      -- A paid, verified, EMPTY profile is still not something to show a
      -- client. Was a name check; now the same bar the view uses.
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

-- ---------------------------------------------------------------------------
-- Who is paying and held back by an empty profile -- the group most likely to
-- churn, and the one nothing could name before.
-- ---------------------------------------------------------------------------
create or replace function admin_incomplete_profiles()
returns table (
  email        text,
  name         text,
  has_photo    boolean,
  has_specialty boolean,
  has_voice    boolean,
  published    boolean,
  subscription_status text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    t.name,
    btrim(coalesce(t.photo, '')) <> '',
    coalesce(array_length(t.specialties, 1), 0) > 0,
    profile_is_publishable('x', array['x'], t.best_for, t.optional_prompts, t.blocks, t.persona, t.prompt_fit, 'x'),
    t.published,
    t.subscription_status
  from therapists t
  join auth.users u on u.id = t.user_id
  where not profile_is_publishable(t.name, t.specialties, t.best_for, t.optional_prompts, t.blocks, t.persona, t.prompt_fit, t.photo)
  order by (t.subscription_status in ('active','trialing')) desc, t.updated_at desc;
$$;

revoke all     on function admin_incomplete_profiles() from public, anon, authenticated;
grant  execute on function admin_incomplete_profiles() to service_role;
