-- ============================================================================
-- 0029 -- Six months free. No paywall to sign up.
--
-- Until now `published` meant "Stripe says they are paying" -- it is written by
-- the webhook and nothing else, and the client-facing view required it. So
-- payment was not merely the first step of onboarding, it was the ONLY route
-- to being visible at all. Removing the paywall therefore cannot be done in
-- the app: with no payment, nothing would ever set published, and no therapist
-- would ever appear.
--
-- NEW MODEL. Entitlement to be listed comes from either side:
--     free_until is still in the future   OR   a subscription is active
-- and `published` stops being part of the visibility gate. It stays on the
-- table as the historical "has ever had an active subscription" flag the
-- webhook keeps writing -- it is simply no longer load-bearing.
--
-- WHEN THE SIX MONTHS START -- a judgement call, flagged for review.
-- Not at signup: a therapist waiting three weeks on a hand-checked licence
-- would burn an eighth of their free period sitting in a queue they cannot
-- influence. The clock starts the moment they become FINDABLE -- both
-- verifications passed -- which is when the thing they are being given
-- actually begins. Someone who never finishes verification never starts it.
--
-- NULL therefore means "not started yet", and null must count as entitled, or
-- the rule would deadlock: entitlement gates visibility, and the clock starts
-- at visibility, so a null that meant "not entitled" could never resolve.
-- ============================================================================

alter table therapists add column if not exists free_until timestamptz;

comment on column therapists.free_until is
  'End of the six-month free period. NULL = not started (never been findable). Set by trg_start_free_period the first time licence and identity are both verified.';

-- ---------------------------------------------------------------------------
-- One definition of "entitled to be listed", so the view, the matching
-- function and the admin counts cannot drift apart -- which is exactly how
-- this codebase produced a screen claiming a profile was both live and hidden.
-- ---------------------------------------------------------------------------
create or replace function listing_is_entitled(p_free_until timestamptz, p_status text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_free_until is null                        -- clock not started yet
      or p_free_until > now()                        -- inside the free period
      or coalesce(p_status, '') in ('active', 'trialing');
$$;

comment on function listing_is_entitled(timestamptz, text) is
  'Entitled to appear in matching: inside the free period, or paying. NULL free_until means the free period has not begun (they have never been findable) and counts as entitled.';

grant execute on function listing_is_entitled(timestamptz, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Start the clock at first go-live, once, and never restart it.
-- ---------------------------------------------------------------------------
create or replace function start_free_period()
returns trigger
language plpgsql
as $$
begin
  if new.free_until is null
     and new.license_verified
     and new.identity_verified then
    new.free_until := now() + interval '6 months';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_start_free_period on therapists;
create trigger trg_start_free_period
  before insert or update of license_verified, identity_verified on therapists
  for each row execute function start_free_period();

-- Anyone already verified today starts their six months now rather than
-- retroactively -- nobody should lose free time to the date this shipped.
update therapists
   set free_until = now() + interval '6 months'
 where free_until is null and license_verified and identity_verified;

-- ---------------------------------------------------------------------------
-- The client-facing view. `published` is GONE from the gate; entitlement
-- replaces it. Same drop/recreate dance (2BP01).
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
  where accepting = true
    and license_verified  = true
    and identity_verified = true
    and removed_at is null
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

-- match_therapists reads the table directly and needs the identical gate.
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

-- ---------------------------------------------------------------------------
-- The queue counted "published and not verified" -- i.e. paying and stuck.
-- Nobody pays to sign up any more, so that phrase no longer describes anyone.
-- What matters now is a therapist who has done their part and is waiting on us.
-- ---------------------------------------------------------------------------
create or replace function admin_review_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',             (select count(*) from therapists),
    'awaiting_license',  (select count(distinct user_id) from therapist_licenses
                          where verified_at is null and rejected_at is null),
    'awaiting_identity', (select count(*) from therapists where not identity_verified),
    'rejected',          (select count(distinct user_id) from therapist_licenses where rejected_at is not null),
    -- WAITING ON US: a licence sitting unreviewed. No longer conditioned on
    -- payment -- a free therapist stuck in the queue is the same problem, and
    -- since there is no paywall they are now the only kind there is.
    'paying_but_hidden', (select count(*) from therapists t
                          where not (t.license_verified and t.identity_verified)
                            and t.removed_at is null
                            and exists (select 1 from therapist_licenses l
                                        where l.user_id = t.user_id
                                          and l.verified_at is null
                                          and l.rejected_at is null)),
    'denied_awaiting_fix', (select count(*) from therapists t
                            where t.removed_at is null
                              and not t.license_verified
                              and exists (select 1 from therapist_licenses l
                                          where l.user_id = t.user_id and l.rejected_at is not null)
                              and not exists (select 1 from therapist_licenses l
                                              where l.user_id = t.user_id
                                                and l.verified_at is null
                                                and l.rejected_at is null)),
    'no_license_yet',    (select count(*) from therapists t
                          where t.removed_at is null
                            and not exists (select 1 from therapist_licenses l where l.user_id = t.user_id)),
    'removed',           (select count(*) from therapists where removed_at is not null),
    'live',              (select count(*) from therapists t
                          where t.accepting and t.license_verified and t.identity_verified
                            and t.removed_at is null
                            and listing_is_entitled(t.free_until, t.subscription_status)),
    -- The renewal pipeline: who is inside the free period, and who has fallen
    -- out of it without subscribing.
    'free_active',       (select count(*) from therapists
                          where free_until > now()
                            and coalesce(subscription_status,'') not in ('active','trialing')),
    'free_ending_30d',   (select count(*) from therapists
                          where free_until > now() and free_until <= now() + interval '30 days'
                            and coalesce(subscription_status,'') not in ('active','trialing')),
    'lapsed',            (select count(*) from therapists
                          where free_until is not null and free_until <= now()
                            and coalesce(subscription_status,'') not in ('active','trialing')
                            and removed_at is null),
    'paying',            (select count(*) from therapists
                          where coalesce(subscription_status,'') in ('active','trialing')),
    'clients_waiting',   (select count(distinct coalesce(nullif(btrim(email), ''), phone)) from client_notify),
    'newsletter',        (select count(distinct lower(btrim(email))) from newsletter_signups),
    'therapist_optin',   (select count(*) from therapists where marketing_opt_in)
  );
$$;

revoke all     on function admin_review_counts() from public, anon, authenticated;
grant  execute on function admin_review_counts() to service_role;

-- ---------------------------------------------------------------------------
-- Who to write to about keeping their profile, and when.
-- ---------------------------------------------------------------------------
create or replace function admin_free_period()
returns table (
  email        text,
  name         text,
  free_until   timestamptz,
  days_left    int,
  live         boolean,
  subscription_status text
)
language sql
security definer
set search_path = public, auth
as $$
  select u.email::text, t.name, t.free_until,
         (t.free_until::date - current_date)::int,
         (t.accepting and t.license_verified and t.identity_verified and t.removed_at is null),
         t.subscription_status
  from therapists t
  join auth.users u on u.id = t.user_id
  where t.free_until is not null
    and coalesce(t.subscription_status,'') not in ('active','trialing')
    and t.removed_at is null
  order by t.free_until asc;
$$;

revoke all     on function admin_free_period() from public, anon, authenticated;
grant  execute on function admin_free_period() to service_role;
