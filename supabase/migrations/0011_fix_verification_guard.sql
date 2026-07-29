-- ============================================================================
-- 0011 -- Fix the verification guard (0009 / 0010 were self-defeating)
--
-- THE BUG
-- The guard trigger asked "is current_user service_role?". Every function that
-- legitimately writes those columns -- verify_therapist_license,
-- stripe_mark_identity_verified, stripe_attach_identity_session -- is SECURITY
-- DEFINER, so inside them current_user is the function OWNER (postgres), not
-- service_role. The guard therefore reverted the writes it was supposed to
-- allow, and did it silently: the functions returned ok:true having changed
-- nothing.
--
-- Left alone, an admin would verify a therapist, see success, and the therapist
-- would stay invisible with no error anywhere.
--
-- THE FIX
-- Stop inferring intent from the role. The three privileged functions now
-- announce themselves with a transaction-local setting, and the trigger honours
-- only that. This is strictly tighter than the role check: even a direct
-- service-role PATCH cannot set these columns now -- the only way through is
-- one of the three audited functions.
--
-- Clients cannot forge the setting: PostgREST exposes only functions in the
-- public schema, and set_config lives in pg_catalog. There is no request shape
-- that reaches it.
-- ============================================================================

create or replace function therapists_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    new.license_verified     := old.license_verified;
    new.license_verified_at  := old.license_verified_at;
    new.license_verified_by  := old.license_verified_by;
    new.identity_verified    := old.identity_verified;
    new.identity_verified_at := old.identity_verified_at;
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
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
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
-- The three writers, each now granting itself permission for the length of its
-- own transaction (the `true` argument to set_config makes it transaction-local,
-- so it cannot leak into another statement on a pooled connection).
-- ---------------------------------------------------------------------------
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
     set license_verified    = true,
         license_verified_at = now(),
         license_verified_by = p_verifier,
         license_number      = coalesce(p_license, license_number)
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_user_id);
end;
$$;

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

  perform set_config('kindred.verify_ok', 'on', true);

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

create or replace function stripe_attach_identity_session(
  p_user_id    uuid,
  p_session_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('kindred.verify_ok', 'on', true);

  update therapists
     set stripe_identity_session_id = p_session_id
   where user_id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function verify_therapist_license(text, text, text)   from public, anon, authenticated;
revoke all on function stripe_mark_identity_verified(text, text)    from public, anon, authenticated;
revoke all on function stripe_attach_identity_session(uuid, text)   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin escape hatch: un-verify someone (lapsed license, failed re-check).
-- Same guard, same service-role-only access.
-- ---------------------------------------------------------------------------
create or replace function unverify_therapist_license(
  p_email  text,
  p_reason text default null
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
     set license_verified    = false,
         license_verified_at = null,
         license_verified_by = coalesce(p_reason, 'unverified by admin')
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function unverify_therapist_license(text, text) from public, anon, authenticated;
