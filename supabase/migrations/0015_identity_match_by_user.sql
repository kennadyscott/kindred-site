-- ============================================================================
-- 0015 -- Match identity results by USER, not just by session id
--
-- THE PROBLEM
-- identity-session overwrites therapists.stripe_identity_session_id every time
-- it runs. A therapist who retries -- blurry photo, timeout, wrong document --
-- leaves the row pointing at their newest attempt, so the verdict for any
-- earlier attempt matches nothing and is dropped.
--
-- Seen live on the first test: two sessions three minutes apart, the FIRST
-- verified and the SECOND left requiring input. The row held the second id, so
-- the "verified" event for the first was logged UNMATCHED and the therapist
-- stayed unverified despite having passed.
--
-- THE FIX
-- identity-session already stamps every session with
-- metadata.kindred_user_id. Matching on that is stable across retries, where a
-- session id is not. The session id stays as a fallback for any verification
-- created before this change.
--
-- Retries also mean events can arrive out of order (a later "requires_input"
-- after an earlier "verified"). Once someone is verified we do not un-verify
-- them on a stale failure -- only an explicit cancel/deletion should do that,
-- and that path goes through the admin, not this function.
-- ============================================================================

create or replace function stripe_mark_identity_verified(
  p_session_id text,
  p_status     text default 'verified',
  p_user_id    uuid default null          -- from metadata.kindred_user_id
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok      boolean;
  v_already boolean;
begin
  if p_session_id is null and p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_identifier');
  end if;

  v_ok := p_status = 'verified';

  -- Prefer the user id: stable across retries. Fall back to the session id for
  -- verifications created before this migration.
  select t.identity_verified into v_already
    from therapists t
   where (p_user_id is not null and t.user_id = p_user_id)
      or (p_user_id is null and t.stripe_identity_session_id = p_session_id)
   limit 1;

  if v_already is null then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_for_identity',
                              'session', p_session_id, 'user', p_user_id);
  end if;

  -- Already verified and this is a failure arriving late? Leave them alone.
  if v_already and not v_ok then
    return jsonb_build_object('ok', true, 'identity_verified', true, 'note', 'stale_failure_ignored');
  end if;

  perform set_config('kindred.verify_ok', 'on', true);

  update therapists
     set identity_verified    = v_ok,
         identity_verified_at = case when v_ok then now() else identity_verified_at end
   where (p_user_id is not null and user_id = p_user_id)
      or (p_user_id is null and stripe_identity_session_id = p_session_id);

  return jsonb_build_object('ok', true, 'identity_verified', v_ok);
end;
$$;

revoke all    on function stripe_mark_identity_verified(text, text, uuid) from public, anon, authenticated;
grant  execute on function stripe_mark_identity_verified(text, text, uuid) to service_role;

-- The two-argument version from 0010/0011 is now unreachable from the webhook
-- and would silently keep the old, retry-fragile behaviour if anything called
-- it. Drop it so there is exactly one.
drop function if exists stripe_mark_identity_verified(text, text);
