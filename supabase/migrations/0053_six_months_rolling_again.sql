-- ============================================================================
-- 0053 -- Six months free, rolling again. Reverts 0032's fixed date.
--
-- 0029 gave each therapist six months starting the day they first went live.
-- 0032 replaced that with "free until March 2027, for everyone", on the
-- reasoning that a fixed date is one sentence rather than a rule.
--
-- That reasoning was sound about clarity and wrong about how it lands. A date
-- is a deadline: it counts down, it shortens every week you wait, and a
-- therapist reading it in January 2027 is being offered eight weeks. "Your
-- first six months are free" is the same offer described as a gift instead of
-- a sentence, and it does not decay while they think about it.
--
-- ---------------------------------------------------------------------------
-- NOTE ON GENEROSITY, so nobody is surprised: six months from the date this
-- ships lands mid-February 2027 -- marginally EARLIER than the fixed March
-- date it replaces. The rolling offer only becomes the better one for people
-- arriving from roughly September 2026. This is deliberate and accepted; the
-- point of the change is framing, not size.
-- ---------------------------------------------------------------------------
--
-- 0032 also dropped the trigger and its function outright, so this cannot just
-- flip the column default back -- both have to be recreated.
--
-- Written to be safe whether or not 0032 was ever applied: every statement is
-- idempotent, and nothing here can shorten a free period that already exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stop stamping a fixed date on every new row.
--    While this default stood, the trigger below could never fire: it guards
--    on `free_until is null`, and the default guaranteed it never was.
-- ---------------------------------------------------------------------------
alter table therapists alter column free_until drop default;

-- ---------------------------------------------------------------------------
-- 2. Restore 0029's clock.
--
--    It starts at FIRST GO-LIVE, not signup. A therapist waiting on a
--    hand-checked licence would otherwise burn part of their free period
--    sitting in a queue they cannot influence. Someone who never finishes
--    verification never starts it.
--
--    Once, and never restarted: the `is null` guard means re-verification --
--    adding a second state licence, say -- cannot hand out another six months.
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

comment on function start_free_period() is
  'Starts a therapist''s six free months the moment they first become findable (both verifications passed). Guarded on free_until IS NULL so the clock starts once and is never restarted by a later re-verification.';

drop trigger if exists trg_start_free_period on therapists;
create trigger trg_start_free_period
  before insert or update of license_verified, identity_verified on therapists
  for each row execute function start_free_period();

-- ---------------------------------------------------------------------------
-- 3. Clear the fixed date ONLY for therapists who have not yet gone live.
--
--    0032 stamped 2027-03-01 on every row including unverified ones. Left
--    alone, those rows are permanently non-null, so the trigger's guard would
--    never fire and they would keep a date that no longer matches anything the
--    website says.
--
--    ANYONE ALREADY LIVE KEEPS WHAT THEY HAVE. Desirae is verified and holds
--    2027-03-01; this leaves her untouched. Never move an existing therapist's
--    free period earlier than what they were already promised.
-- ---------------------------------------------------------------------------
update therapists
   set free_until = null
 where free_until is not null
   and not (coalesce(license_verified, false) and coalesce(identity_verified, false));

comment on column therapists.free_until is
  'End of this therapist''s six free months. NULL means the clock has not started -- they have never been findable -- which listing_is_entitled() treats as entitled. Set once by trg_start_free_period at first go-live. Per-row on purpose: extending a founding cohort, or making good on a bad onboarding, should be an UPDATE and not a deploy.';

-- listing_is_entitled() is unchanged and still correct: free_until in the
-- future, or an active subscription, or NULL for "not started".

-- Proof (run separately):
--   select adsrc is null from pg_attrdef d join pg_attribute a
--     on a.attrelid = d.adrelid and a.attnum = d.adnum
--    where a.attrelid = 'therapists'::regclass and a.attname = 'free_until';
--     -- 0 rows = the default is gone
--   select tgname from pg_trigger where tgname = 'trg_start_free_period';   -- 1 row
--   select name, free_until, license_verified, identity_verified from therapists;
--     -- verified therapists keep their date; unverified ones are NULL
