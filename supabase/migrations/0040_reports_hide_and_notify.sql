-- ============================================================================
-- 0040 -- An open report hides the profile, and the therapist is told
--
-- Builds on 0039. Three parts:
--   1. match_therapists() skips anyone with an unresolved report
--   2. my_review_status() lets a therapist see they are under review
--   3. admin_resolve_report() puts them back
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE OPENING TO CLIENTS
--
-- Reports carry no identity (0039, deliberately) and the anon key is public by
-- design. So ANY caller can POST a report, and after this migration a single
-- POST delists a therapist instantly. A trivial script could delist the entire
-- roster in one pass, and nothing here would slow it down or say who did it.
--
-- That is a real exposure and it is being accepted knowingly: hiding first is
-- the right instinct when the alternative is leaving possible nudity or abuse
-- in front of clients, and today the roster is empty so the risk is theoretical.
-- Before real clients arrive, one of these should be in place:
--     * a threshold (hide on N distinct reports rather than 1), or
--     * a captcha/Turnstile token required on the insert, or
--     * client accounts, so a report has an author who can be rate-limited
-- The per-therapist burst cap below is a speed bump, not a solution: it stops
-- one profile being buried under a thousand rows, not one attacker walking the
-- roster.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 -- The hide. Derived from open reports rather than a flag on therapists,
--      so resolving a report restores the profile automatically and the two
--      can never disagree -- the failure mode this codebase keeps producing.
-- ---------------------------------------------------------------------------
create or replace function has_open_report(p_therapist uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from profile_reports
     where therapist_id = p_therapist
       and resolved_at is null
  );
$$;

grant execute on function has_open_report(uuid) to anon, authenticated, service_role;

-- A speed bump, not a defence. See the warning above.
create or replace function profile_reports_burst_guard() returns trigger
language plpgsql as $$
begin
  if (select count(*) from profile_reports
       where therapist_id = new.therapist_id
         and created_at > now() - interval '1 hour') >= 20 then
    -- Silently accept and drop: telling a caller their report was refused
    -- teaches them exactly how to tune around the limit.
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_reports_burst on profile_reports;
create trigger trg_profile_reports_burst
  before insert on profile_reports
  for each row execute function profile_reports_burst_guard();

-- ---------------------------------------------------------------------------
-- 2 -- What the therapist sees. Says THAT they are under review, never the
--      reason and never the text: an anonymous accusation quoted back to the
--      accused invites retaliation against whoever they guess sent it, and
--      naming the category teaches someone how to game the next submission.
-- ---------------------------------------------------------------------------
create or replace function my_review_status()
returns table (under_review boolean, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from profile_reports r
             where r.therapist_id = auth.uid() and r.resolved_at is null),
    (select min(r.created_at) from profile_reports r
      where r.therapist_id = auth.uid() and r.resolved_at is null);
$$;

revoke all     on function my_review_status() from public, anon;
grant  execute on function my_review_status() to authenticated;

comment on function my_review_status() is
  'Whether the CALLING therapist has an unresolved report. Returns no reason and no detail, on purpose -- see 0040.';

-- ---------------------------------------------------------------------------
-- 3 -- Clearing it. service_role only; this is the human review step.
-- ---------------------------------------------------------------------------
create or replace function admin_resolve_report(p_id uuid, p_resolution text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update profile_reports
     set resolved_at = now(), resolution = coalesce(p_resolution, 'reviewed')
   where id = p_id and resolved_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all     on function admin_resolve_report(uuid, text) from public, anon, authenticated;
grant  execute on function admin_resolve_report(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4 -- match_therapists(), identical to 0037 plus ONE where-clause line.
--      Drop first: 0037 already had to, and the signature is unchanged here,
--      but replacing in place is fine since the return type is not changing.
-- ---------------------------------------------------------------------------
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
      and not has_open_report(t.user_id)          -- added in 0040
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

grant execute on function match_therapists to anon, authenticated, service_role;

-- Proof:
--   insert into profile_reports (therapist_id, reason)
--     select user_id, 'nudity' from therapists limit 1;
--   select count(*) from match_therapists();      -- that therapist is gone
--   select admin_resolve_report(id, 'no issue found') from profile_reports;
--   select count(*) from match_therapists();      -- back
