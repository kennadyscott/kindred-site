-- ============================================================================
-- 0014 -- Give service_role EXECUTE back on the privileged functions
--
-- THE BUG
-- Every privileged function in 0008-0013 ends with
--
--     revoke all on function ... from public, anon, authenticated;
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and that
-- default was the ONLY grant any of these had. Revoking from PUBLIC therefore
-- stripped it from every role without an explicit grant -- including
-- service_role. service_role bypasses RLS; it does NOT bypass function
-- privileges. So the revoke locked out the one role that is supposed to call
-- them.
--
-- Symptom: any service-role call returns
--     42501 permission denied for function <name>
-- which is indistinguishable from the anon key being correctly refused. The
-- lockdown looked like it was working.
--
-- WHAT IT WOULD HAVE COST
-- This was found via the admin review queue, but the same fault sat on
-- stripe_activate_listing: the first real payment would have returned 42501,
-- the webhook would have logged ACTIVATION NEEDS MANUAL REVIEW, and the money
-- would have vanished from our side exactly as 0013 was written to prevent.
--
-- THE FIX
-- Grant EXECUTE explicitly to service_role. anon and authenticated stay
-- revoked, so the security property is unchanged: a therapist still cannot
-- publish or verify themselves. Only the intended caller regains access.
-- ============================================================================

grant execute on function stripe_activate_listing(text, text, text, text)  to service_role;
grant execute on function stripe_sync_subscription(text, text, text)       to service_role;
grant execute on function verify_therapist_license(text, text, text)       to service_role;
grant execute on function unverify_therapist_license(text, text)           to service_role;
grant execute on function stripe_mark_identity_verified(text, text)        to service_role;
grant execute on function stripe_attach_identity_session(uuid, text)       to service_role;
grant execute on function admin_review_queue(text)                         to service_role;
grant execute on function admin_review_counts()                            to service_role;

-- Belt and braces: confirm anon/authenticated are still shut out. These are
-- no-ops if the earlier revokes held, and repair them if anything re-granted.
revoke execute on function stripe_activate_listing(text, text, text, text)  from public, anon, authenticated;
revoke execute on function stripe_sync_subscription(text, text, text)       from public, anon, authenticated;
revoke execute on function verify_therapist_license(text, text, text)       from public, anon, authenticated;
revoke execute on function unverify_therapist_license(text, text)           from public, anon, authenticated;
revoke execute on function stripe_mark_identity_verified(text, text)        from public, anon, authenticated;
revoke execute on function stripe_attach_identity_session(uuid, text)       from public, anon, authenticated;
revoke execute on function admin_review_queue(text)                         from public, anon, authenticated;
revoke execute on function admin_review_counts()                            from public, anon, authenticated;
