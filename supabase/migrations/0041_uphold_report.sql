-- ============================================================================
-- 0041 -- Upholding a report has to KEEP the profile hidden
--
-- The HQ Reports queue has two buttons: Dismiss (no issue) and Uphold
-- (something is wrong). Against 0039/0040 as written, they do the same thing.
--
-- The hide is derived: match_therapists() skips anyone where
-- has_open_report() is true, and has_open_report() is "a report with
-- resolved_at is null". admin_resolve_report() sets resolved_at. So resolving
-- a report ALWAYS relists the therapist -- including the report you resolved
-- precisely because the profile contained nudity or abuse.
--
-- That derivation is good design and 0040 was right to prefer it to a flag:
-- resolving restores the profile automatically and the two states can never
-- disagree. It just has no way to express "reviewed, and the answer was no".
-- The queue could only be kept correct by never clearing it.
--
-- So Uphold gets its own function, and it does both halves in ONE statement
-- pair inside one transaction. Doing it as two calls from the Edge Function
-- would leave a window where the report is resolved and the therapist is not
-- yet hidden -- a live offending profile, produced by the button whose entire
-- job is to take it down.
--
-- Reversible on purpose: admin_restore_therapist() (0028) already undoes it,
-- because the answer to a wrong call must not be "recreate the account".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 -- removed_at was self-serve, which made any hold advisory
--
-- "update own profile" (0001) lets a therapist write ANY column of their own
-- row; only the verification columns are held back, by the guard trigger in
-- 0009/0011. removed_at and removed_reason were not on that list, so a removed
-- therapist could clear their own removal -- deliberately, or as a side effect
-- of the app saving a stale row it had loaded before the removal.
--
-- `published` is deliberately NOT guarded: pausing your own listing is a
-- therapist's decision to make. removed_at is ours, and match_therapists()
-- checks `removed_at is null` independently of published, so guarding this one
-- column is enough to make the hold real.
-- ---------------------------------------------------------------------------
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
    -- added in 0041: an admin hold the holder cannot lift
    new.removed_at           := old.removed_at;
    new.removed_reason       := old.removed_reason;
  end if;
  return new;
end;
$$;

comment on column therapists.removed_at is
  'Set when a human removed this therapist from the platform. Admin-only since 0041 -- the guard trigger reverts any write that is not inside a service_role function. Distinct from a licence denial, which is "not yet" and clears when they resubmit.';

-- ---------------------------------------------------------------------------
-- 2 -- Uphold: resolve the report AND keep the profile down, atomically
-- ---------------------------------------------------------------------------
create or replace function admin_uphold_report(p_id uuid, p_resolution text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_therapist uuid;
  v_n int;
begin
  -- Lock the report row so two admins clicking Uphold cannot both proceed.
  select therapist_id into v_therapist
    from profile_reports
   where id = p_id and resolved_at is null
   for update;

  if v_therapist is null then
    -- Already resolved, or never existed. Not an error worth failing on --
    -- the queue is shared and someone else may have just handled it.
    return jsonb_build_object('ok', false, 'error', 'not open');
  end if;

  -- Hide FIRST. If anything below fails the transaction rolls back and the
  -- report stays open, which keeps them hidden anyway -- the safe direction.
  perform set_config('kindred.verify_ok', 'on', true);   -- see the guard, above
  update therapists
     set published      = false,
         accepting      = false,
         removed_at     = coalesce(removed_at, now()),
         removed_reason = coalesce(nullif(btrim(p_resolution), ''), 'profile report upheld')
   where user_id = v_therapist;
  get diagnostics v_n = row_count;

  update profile_reports
     set resolved_at = now(),
         resolution  = coalesce(nullif(btrim(p_resolution), ''), 'upheld')
   where id = p_id;

  -- v_n = 0 means the therapist row is gone (they deleted the account after
  -- being reported -- the left join in admin_profile_reports() exists for
  -- exactly this). The report is still resolved: there is nothing to hide.
  return jsonb_build_object(
    'ok', true,
    'therapist_id', v_therapist,
    'hidden', v_n > 0,
    'note', case when v_n > 0
                 then 'Unpublished and held. Cancel their Stripe subscription separately -- this does not touch billing. admin_restore_therapist() reverses it.'
                 else 'Report resolved. No therapist row to hide -- the account was already gone.' end
  );
end;
$$;

revoke all     on function admin_uphold_report(uuid, text) from public, anon, authenticated;
grant  execute on function admin_uphold_report(uuid, text) to service_role;

comment on function admin_uphold_report(uuid, text) is
  'Resolve a report AND keep the therapist hidden, in one transaction. admin_resolve_report() is the Dismiss path and relists them; this is the Uphold path. Reverse with admin_restore_therapist().';

-- Proof:
--   -- dismiss relists:
--   select admin_resolve_report('<id>', 'no issue found');
--   select has_open_report('<therapist>');            -- false, and they match again
--
--   -- uphold does not:
--   select admin_uphold_report('<id>', 'nudity confirmed');
--   select has_open_report('<therapist>');            -- false (report is closed)
--   select removed_at is not null from therapists where user_id = '<therapist>';  -- true
--   -- and they do not come back from match_therapists()
--
--   -- the hold is not self-serve: as the therapist,
--   update therapists set removed_at = null where user_id = auth.uid();
--   select removed_at from therapists where user_id = auth.uid();   -- still set
