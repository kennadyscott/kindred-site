-- ============================================================================
-- 0032 -- Free until March 2027, for everyone
--
-- 0029 gave each therapist a rolling six months starting the day they first
-- went live. That was my inference, and it was wrong: the offer is a FIXED
-- DATE. Kindred is free for therapists until March 2027 — the same date
-- whoever you are and whenever you joined.
--
-- Better in every way that matters here. It is one sentence instead of a rule
-- ("free until March 2027", not "six months from whenever you happen to be
-- verified"), it is the same promise on the website as in the app without
-- either having to compute anything, and it cannot drift per therapist.
--
-- The column stays per-row rather than becoming a constant, because a date is
-- something you will eventually want to vary — extending it for a founding
-- cohort, or giving someone who had a bad onboarding another few months —
-- and a per-row value makes that an UPDATE rather than a deploy.
-- ============================================================================

-- Everyone, including rows created before this ran.
alter table therapists
  alter column free_until set default timestamptz '2027-03-01 00:00:00+00';

update therapists
   set free_until = timestamptz '2027-03-01 00:00:00+00'
 where free_until is null
    or free_until <> timestamptz '2027-03-01 00:00:00+00';

comment on column therapists.free_until is
  'End of the free period. A fixed 2027-03-01 for the founding cohort, per-row so it can be extended for an individual without a deploy. NULL is still treated as entitled by listing_is_entitled().';

-- ---------------------------------------------------------------------------
-- The go-live trigger from 0029 no longer has a job. The clock is not started
-- by anything a therapist does; the date is simply the date.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_start_free_period on therapists;
drop function if exists start_free_period();

-- listing_is_entitled() is unchanged and still correct: free_until in the
-- future, or a live subscription. It keeps treating NULL as entitled, which
-- now only matters if someone clears the column by hand.
