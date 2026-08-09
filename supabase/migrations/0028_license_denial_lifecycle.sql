-- ============================================================================
-- 0028 -- What happens after we say no
--
-- Denying a licence had no exit. Three separate problems, one lifecycle.
--
-- 1. A DENIED THERAPIST NEVER LEAVES THE REVIEW QUEUE.
--    admin_review_counts.paying_but_hidden counts everyone published and not
--    fully verified. A denial does not change either of those, so a therapist
--    we have already reviewed and rejected sits in the queue forever, under a
--    card that says "someone has paid and can't be matched UNTIL YOU CHECK
--    their license". We checked. The ball is with them. The number that
--    should drive that card is the work still owed by us.
--
-- 2. A RESUBMISSION COULD NOT CLEAR THE DENIAL.
--    licenses_guard_verification() (0018) forces verified_at and rejected_at
--    back to their OLD values on any update the admin path did not make --
--    correctly, since otherwise a therapist could set verified_at and publish
--    themselves. But it also meant that correcting a rejected licence number
--    left rejected_at in place: the row stayed denied, never re-entered the
--    queue, and the therapist could never go live no matter what they typed.
--    The app grew a "fix my license" form earlier today that wrote into
--    exactly this dead end.
--
--    Now: changing the licence NUMBER or the EXPIRY clears the rejection and
--    puts the row back in the queue as unreviewed. verified_at is still
--    untouchable by anyone but the admin path -- resubmitting can only ever
--    ask again, never approve.
--
-- 3. NO WAY TO REMOVE SOMEONE OUTRIGHT.
--    Denial is "not yet". Removal is "not here" -- fraud, a fabricated
--    licence, someone who should not be listed at all. There was no
--    expression of that, so the only tool was a denial that they could
--    resubmit past indefinitely.
--
-- DEPENDS ON 0026 (therapist_licenses.expires_on).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Resubmitting reopens the review.
-- ---------------------------------------------------------------------------
create or replace function licenses_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    if TG_OP = 'INSERT' then
      new.verified_at := null; new.verified_by := null;
      new.rejected_at := null; new.rejected_reason := null;
    else
      -- Verification is admin-only, always. Nothing below relaxes this.
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;

      /* A CHANGED NUMBER OR EXPIRY IS A RESUBMISSION. Clearing the rejection
         is the only way back into the queue -- and it is safe, because
         clearing `rejected_at` cannot publish anybody. Only verified_at does
         that, and it is preserved above. Worst case a therapist toggles their
         own row back to "unreviewed", which is a request for our attention,
         not a grant of anything. */
      if new.license_number is distinct from old.license_number
         or new.expires_on is distinct from old.expires_on then
        new.rejected_at := null;
        new.rejected_reason := null;
      else
        new.rejected_at := old.rejected_at;
        new.rejected_reason := old.rejected_reason;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Removal: "not here", as distinct from "not yet".
--    Unpublishes and records why. Deliberately does NOT delete: the row is
--    evidence, the subscription may still need cancelling in Stripe by hand,
--    and a wrongly-removed therapist should be restorable without them
--    rebuilding a profile from nothing.
-- ---------------------------------------------------------------------------
alter table therapists add column if not exists removed_at     timestamptz;
alter table therapists add column if not exists removed_reason text;

comment on column therapists.removed_at is
  'Set when a human removed this therapist from the platform. Distinct from a licence denial, which is "not yet" and clears when they resubmit.';

create or replace function admin_remove_therapist(p_email text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'no such account'); end if;

  update therapists
     set published      = false,
         accepting      = false,
         removed_at     = now(),
         removed_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where user_id = v_user;

  return jsonb_build_object('ok', true, 'email', p_email,
    'note', 'Unpublished. Cancel their Stripe subscription separately — this does not touch billing.');
end;
$$;

revoke all     on function admin_remove_therapist(text, text) from public, anon, authenticated;
grant  execute on function admin_remove_therapist(text, text) to service_role;

create or replace function admin_restore_therapist(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'no such account'); end if;
  /* Clears the removal only. Publishing still depends on an active
     subscription, a verified licence, a verified identity and a publishable
     profile -- restoring does not skip any of them. */
  update therapists
     set removed_at = null, removed_reason = null, accepting = true
   where user_id = v_user;
  return jsonb_build_object('ok', true, 'email', p_email);
end;
$$;

revoke all     on function admin_restore_therapist(text) from public, anon, authenticated;
grant  execute on function admin_restore_therapist(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The queue counts work WE owe.
--
-- paying_but_hidden drives a card that says "until you check their license".
-- It now means exactly that: paying, hidden, and there is something in front
-- of us. Someone we have already denied is waiting on THEM and moves to
-- denied_awaiting_fix, which is visible without being an action item.
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
    -- WAITING ON US: published, not yet matchable, and at least one licence
    -- sitting unreviewed. Excludes anyone removed, and anyone whose only
    -- outstanding licence we have already rejected.
    'paying_but_hidden', (select count(*) from therapists t
                          where t.published
                            and not (t.license_verified and t.identity_verified)
                            and t.removed_at is null
                            and exists (select 1 from therapist_licenses l
                                        where l.user_id = t.user_id
                                          and l.verified_at is null
                                          and l.rejected_at is null)),
    -- WAITING ON THEM: denied and not yet resubmitted. Shown, never chased.
    'denied_awaiting_fix', (select count(*) from therapists t
                            where t.published
                              and t.removed_at is null
                              and not t.license_verified
                              and exists (select 1 from therapist_licenses l
                                          where l.user_id = t.user_id and l.rejected_at is not null)
                              and not exists (select 1 from therapist_licenses l
                                              where l.user_id = t.user_id
                                                and l.verified_at is null
                                                and l.rejected_at is null)),
    -- Paying, hidden, and hasn't given us a licence to look at at all.
    'no_license_yet',    (select count(*) from therapists t
                          where t.published and t.removed_at is null
                            and not exists (select 1 from therapist_licenses l where l.user_id = t.user_id)),
    'removed',           (select count(*) from therapists where removed_at is not null),
    'live',              (select count(*) from therapists
                          where published and license_verified and identity_verified
                            and removed_at is null),
    'clients_waiting',   (select count(distinct coalesce(nullif(btrim(email), ''), phone)) from client_notify),
    'newsletter',        (select count(distinct lower(btrim(email))) from newsletter_signups),
    'therapist_optin',   (select count(*) from therapists where marketing_opt_in)
  );
$$;

revoke all     on function admin_review_counts() from public, anon, authenticated;
grant  execute on function admin_review_counts() to service_role;

-- ---------------------------------------------------------------------------
-- A removed therapist is not a listing. Same drop/recreate dance (2BP01).
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
    and removed_at is null
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

-- match_therapists reads the table directly, so it needs the same exclusion.
-- Only the where-clause differs from 0027; everything else is identical.
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
    where t.published = true
      and t.accepting = true
      and t.license_verified  = true
      and t.identity_verified = true
      and t.removed_at is null
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
-- Who is denied and what we told them, so the group waiting on themselves is
-- visible somewhere rather than merely absent from the queue.
-- ---------------------------------------------------------------------------
create or replace function admin_denied_therapists()
returns table (
  email      text,
  name       text,
  state      text,
  license_number text,
  reason     text,
  denied_at  timestamptz,
  days_since int
)
language sql
security definer
set search_path = public, auth
as $$
  select u.email::text, t.name, l.state, l.license_number,
         l.rejected_reason, l.rejected_at,
         greatest(0, extract(day from (now() - l.rejected_at))::int)
  from therapist_licenses l
  join therapists t on t.user_id = l.user_id
  join auth.users  u on u.id     = l.user_id
  where l.rejected_at is not null
    and t.removed_at is null
  order by l.rejected_at desc;
$$;

revoke all     on function admin_denied_therapists() from public, anon, authenticated;
grant  execute on function admin_denied_therapists() to service_role;
