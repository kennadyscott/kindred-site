-- ============================================================================
-- 0017 -- A real "deny", not just "undo"
--
-- The queue had two states: verified, or not. Un-verifying someone returned
-- them to license_verified = false, which is indistinguishable from a therapist
-- nobody has looked at yet -- so a rejected applicant sat in "Needs review"
-- forever and got re-checked every time the queue was opened. There was also
-- nowhere to record WHY, so the reason lived only in the admin's memory.
--
-- Three states now: pending / verified / rejected.
--   pending  = license_verified false, no rejection recorded
--   verified = license_verified true
--   rejected = rejection recorded, license_verified false
--
-- license_verified stays the single gate on visibility. Rejection is triage
-- information; it does not need its own check in the view or in
-- match_therapists, because a rejected therapist is by definition not verified.
--
-- The reason is shown to the THERAPIST, not just kept for the admin. Being
-- rejected with no explanation and no idea what to fix is the worst version of
-- this, and they have paid.
-- ============================================================================

alter table therapists add column if not exists license_rejected_at     timestamptz;
alter table therapists add column if not exists license_rejected_reason text;
alter table therapists add column if not exists license_rejected_by     text;

-- Guarded like every other verification column (0011): admins only.
create or replace function therapists_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    new.license_verified        := old.license_verified;
    new.license_verified_at     := old.license_verified_at;
    new.license_verified_by     := old.license_verified_by;
    new.identity_verified       := old.identity_verified;
    new.identity_verified_at    := old.identity_verified_at;
    new.stripe_identity_session_id := old.stripe_identity_session_id;
    new.license_rejected_at     := old.license_rejected_at;
    new.license_rejected_reason := old.license_rejected_reason;
    new.license_rejected_by     := old.license_rejected_by;
  end if;
  return new;
end;
$$;

create or replace function therapists_guard_verification_insert()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    new.license_verified        := false;
    new.license_verified_at     := null;
    new.license_verified_by     := null;
    new.identity_verified       := false;
    new.identity_verified_at    := null;
    new.stripe_identity_session_id := null;
    new.license_rejected_at     := null;
    new.license_rejected_reason := null;
    new.license_rejected_by     := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deny, with a reason.
-- ---------------------------------------------------------------------------
create or replace function reject_therapist_license(
  p_email    text,
  p_reason   text,
  p_verifier text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account_for_email');
  end if;

  perform set_config('kindred.verify_ok', 'on', true);

  update therapists
     set license_verified        = false,
         license_verified_at     = null,
         license_rejected_at     = now(),
         license_rejected_reason = btrim(p_reason),
         license_rejected_by     = p_verifier
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Verifying clears any prior rejection: the two states are exclusive, and a
-- stale rejection reason would otherwise still be shown to a verified
-- therapist.
create or replace function verify_therapist_license(
  p_email    text,
  p_license  text default null,
  p_verifier text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account_for_email');
  end if;

  perform set_config('kindred.verify_ok', 'on', true);

  update therapists
     set license_verified        = true,
         license_verified_at     = now(),
         license_verified_by     = p_verifier,
         license_number          = coalesce(p_license, license_number),
         license_rejected_at     = null,
         license_rejected_reason = null,
         license_rejected_by     = null
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue: rejected rows leave "Needs review" and get their own tab.
-- Return type changes, so drop before recreating.
-- ---------------------------------------------------------------------------
drop function if exists admin_review_queue(text);
create function admin_review_queue(p_filter text default 'pending')
returns table (
  user_id             uuid,
  name                text,
  email               text,
  license_number      text,
  license_states      text[],
  license_verified    boolean,
  license_verified_at timestamptz,
  identity_verified   boolean,
  published           boolean,
  subscription_status text,
  created_at          timestamptz,
  rejected_at         timestamptz,
  rejected_reason     text
)
language sql
security definer
set search_path = public
as $$
  select t.user_id, t.name, u.email::text, t.license_number, t.license_states,
         t.license_verified, t.license_verified_at, t.identity_verified,
         t.published, t.subscription_status, t.created_at,
         t.license_rejected_at, t.license_rejected_reason
  from therapists t
  left join auth.users u on u.id = t.user_id
  where case
          when p_filter = 'pending'  then not t.license_verified
                                          and t.license_rejected_at is null
          when p_filter = 'verified' then t.license_verified and t.identity_verified
          when p_filter = 'rejected' then t.license_rejected_at is not null
          else true
        end
  order by t.created_at desc;
$$;

create or replace function admin_review_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',             count(*),
    'awaiting_license',  count(*) filter (where not license_verified and license_rejected_at is null),
    'awaiting_identity', count(*) filter (where not identity_verified),
    'rejected',          count(*) filter (where license_rejected_at is not null),
    'paying_but_hidden', count(*) filter (where published and not (license_verified and identity_verified)),
    'live',              count(*) filter (where published and license_verified and identity_verified)
  )
  from therapists;
$$;

revoke all    on function reject_therapist_license(text, text, text) from public, anon, authenticated;
grant  execute on function reject_therapist_license(text, text, text) to service_role;
revoke all    on function admin_review_queue(text)                   from public, anon, authenticated;
grant  execute on function admin_review_queue(text)                  to service_role;
revoke all    on function admin_review_counts()                      from public, anon, authenticated;
grant  execute on function admin_review_counts()                     to service_role;
revoke all    on function verify_therapist_license(text, text, text) from public, anon, authenticated;
grant  execute on function verify_therapist_license(text, text, text) to service_role;

-- Therapists need to see why they were rejected. This is their OWN row only --
-- the "read own profile" policy already restricts it -- so no new exposure.
comment on column therapists.license_rejected_reason is
  'Shown to the therapist in their portal. Write it as something they can act on.';
