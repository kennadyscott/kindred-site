-- ============================================================================
-- 0010 -- Stripe Identity: is this person who they say they are?
--
-- Pairs with 0009. Two different questions, two different checks:
--   license_verified   the credential is real   (admin checks the state board)
--   identity_verified  the PERSON is real       (Stripe Identity, this file)
--
-- Neither substitutes for the other. A state board registry is public, so a
-- license number alone proves nothing about who is typing it -- someone can
-- look up a real therapist and register as them. Identity closes that gap.
--
-- FLOW
--   therapist pays -> stripe-webhook publishes them
--   therapist verifies ID -> Stripe fires identity.verification_session.verified
--     -> stripe_mark_identity_verified() flips the flag -> they become matchable
--
-- Same guard as 0009: these columns are service-role only. The therapist's
-- table-wide UPDATE grant would otherwise let them PATCH identity_verified
-- straight onto their own row.
-- ============================================================================

alter table therapists add column if not exists identity_verified         boolean not null default false;
alter table therapists add column if not exists identity_verified_at      timestamptz;
alter table therapists add column if not exists stripe_identity_session_id text;

create index if not exists therapists_identity_session_idx
  on therapists (stripe_identity_session_id) where stripe_identity_session_id is not null;

-- ---------------------------------------------------------------------------
-- Extend the 0009 guards to cover the identity columns too. Redefining the
-- functions is enough -- the triggers already point at them.
-- ---------------------------------------------------------------------------
create or replace function therapists_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    new.license_verified     := old.license_verified;
    new.license_verified_at  := old.license_verified_at;
    new.license_verified_by  := old.license_verified_by;
    new.identity_verified    := old.identity_verified;
    new.identity_verified_at := old.identity_verified_at;
    -- the session id is set by the Edge Function (service role) too
    new.stripe_identity_session_id := old.stripe_identity_session_id;
  end if;
  return new;
end;
$$;

create or replace function therapists_guard_verification_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    new.license_verified     := false;
    new.license_verified_at  := null;
    new.license_verified_by  := null;
    new.identity_verified    := false;
    new.identity_verified_at := null;
    new.stripe_identity_session_id := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Called by the webhook on identity.verification_session.* events.
-- Keyed on the session id, which the Edge Function stored when it created the
-- session -- Stripe does not send us an email on these events.
-- ---------------------------------------------------------------------------
create or replace function stripe_mark_identity_verified(
  p_session_id text,
  p_status     text default 'verified'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_session_id is null or p_session_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_session_id');
  end if;

  v_ok := p_status = 'verified';

  update therapists
     set identity_verified    = v_ok,
         identity_verified_at = case when v_ok then now() else null end
   where stripe_identity_session_id = p_session_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_for_session', 'session', p_session_id);
  end if;
  return jsonb_build_object('ok', true, 'identity_verified', v_ok);
end;
$$;

-- Records which session belongs to which therapist. Called by the Edge
-- Function with the service role right after creating the session.
create or replace function stripe_attach_identity_session(
  p_user_id    uuid,
  p_session_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update therapists
     set stripe_identity_session_id = p_session_id
   where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function stripe_mark_identity_verified(text, text)  from public, anon, authenticated;
revoke all on function stripe_attach_identity_session(uuid, text)  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- THE GATE. Applied in BOTH places a client can reach a therapist:
--   1. therapists_public (browse / search / profile pages)
--   2. match_therapists  (the matching algorithm -- reads the TABLE, not the
--      view, so it needs its own predicate)
-- Missing either one would leave a route to an unverified therapist.
-- ---------------------------------------------------------------------------
drop function if exists search_therapists(text, text, text, text, int);
drop view if exists therapists_public;

create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         search_doc,
         license_verified, identity_verified
  from therapists
  where published = true
    and accepting = true
    and license_verified  = true
    and identity_verified = true;

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
    and (p_gender is null or p.gender = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- match_therapists, reproduced from 0003 with the trust gate added. Keep the
-- two in sync if either changes.
-- ---------------------------------------------------------------------------
create or replace function match_therapists(
  p_needs           text[]  default '{}',
  p_modality        text    default null,   -- null / 'open' = no preference
  p_style           text    default null,   -- 'gentle' | 'direct'
  p_gender          text    default null,
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
        (case when p_gender    is not null and t.gender    = p_gender    then 10 else 0 end) +
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
