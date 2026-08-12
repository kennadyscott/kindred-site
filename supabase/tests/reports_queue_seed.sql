-- ============================================================================
-- Seed ONE test therapist and TWO reports, so the HQ Reports queue has
-- something real in it and both buttons can be worked in the actual UI.
--
-- This one COMMITS. Cleanup is at the bottom of the file — run it when done.
--
-- Safety: the therapist is created with accepting = false, so they are in
-- neither match_therapists() nor therapists_public. No client can reach this
-- profile by searching or by link. The cost is that "See the profile" in HQ
-- will say profile not found for this row — that is expected here, not a bug.
--
-- The uuid is fixed and obviously fake, so cleanup can never hit a real row.
-- ============================================================================

begin;

-- license_verified / identity_verified are held back by the guard trigger
-- (0009/0011) unless this is on. Transaction-local, so it lapses at commit.
select set_config('kindred.verify_ok', 'on', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000dead',
  'authenticated', 'authenticated',
  'zz-reports-seed@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

insert into therapists (
  user_id, name, photo, specialties, best_for,
  accepting, published, license_verified, identity_verified,
  license_states, free_until
) values (
  '00000000-0000-4000-8000-00000000dead',
  'ZZ Test Profile (safe to delete)',
  'https://example.invalid/photo.jpg',
  array['anxiety'],
  'A seeded row for testing the reports queue. Not a real person.',
  false,   -- <- keeps them out of matching AND out of therapists_public
  true,
  true, true,
  array['TX'], timestamptz '2027-03-01'
);

-- Report 1: old and detailed. Backdated 12 calendar days so the age indicator
-- goes red — it is past the 5 business days we promise therapists.
insert into profile_reports (therapist_id, reason, detail, created_at) values (
  '00000000-0000-4000-8000-00000000dead',
  'nudity',
  'The photo on this profile shows a lot more than a headshot. Felt wrong for a therapy site.',
  now() - interval '12 days'
);

-- Report 2: fresh and bare. Exercises the "no detail given" copy and the
-- within-SLA countdown rather than the overdue state.
insert into profile_reports (therapist_id, reason, created_at) values (
  '00000000-0000-4000-8000-00000000dead',
  'other',
  now()
);

commit;

-- Confirm what you just made:
select r.reason, r.created_at::date, (r.detail is not null) as has_detail
  from profile_reports r
 where r.therapist_id = '00000000-0000-4000-8000-00000000dead'
 order by r.created_at;


-- ============================================================================
-- WHAT TO DO IN HQ
--   1. Reports should show 2 open, badge of 2 on the shield icon.
--   2. The nudity one should be red — "past the 5 we promised".
--   3. The other should say "No detail given" and show days left.
--   4. Dismiss one. It moves to Resolved with your email in the audit trail.
--   5. Uphold the other. Same, and it also unpublishes the therapist.
--   6. Both gone from Open, badge clears.
-- ============================================================================


-- ============================================================================
-- CLEANUP — run this when you are finished. Deleting the auth user cascades
-- to the therapists row; profile_reports has no FK on purpose, so it is
-- deleted explicitly.
-- ============================================================================
-- delete from profile_reports where therapist_id = '00000000-0000-4000-8000-00000000dead';
-- delete from auth.users        where id           = '00000000-0000-4000-8000-00000000dead';
--
-- Verify nothing is left:
-- select (select count(*) from profile_reports where therapist_id = '00000000-0000-4000-8000-00000000dead') as reports_left,
--        (select count(*) from therapists      where user_id      = '00000000-0000-4000-8000-00000000dead') as therapist_left,
--        (select count(*) from auth.users      where id           = '00000000-0000-4000-8000-00000000dead') as user_left;
