-- ============================================================================
-- 0036 -- Let a therapist actually delete their own account
--
-- "Delete My Account" in therapist Settings did nothing. It showed a sheet,
-- said "Your account has been deleted", and logged out. There was no server
-- call in the path at all -- the row stayed exactly as it was, with
-- removed_at NULL and accepting = true, which means a therapist who thought
-- they had deleted their account STAYED IN match_therapists() and kept
-- receiving client inquiries, with no way to see it because they believed the
-- account was gone.
--
-- admin_remove_therapist() (0028) exists but is service_role only. That is
-- correct for what it is -- an admin removing somebody after a licence denial
-- -- and it is not reachable from the app. This is the self-service half.
--
-- WHY A HARD DELETE RATHER THAN removed_at
-- A tombstone would keep them out of matching, but the app never reads
-- removed_at, so on their next login they would see their whole profile
-- intact and still be told it was deleted. Worse, if they rebuilt it,
-- removed_at would still be set and they would silently never match again.
-- Deleting the row is the only version where what the button says and what
-- happens are the same thing. The app already handles a missing row: it
-- routes to signup with a blank wizard, which is exactly right for someone
-- coming back after deleting.
--
-- therapist_licenses is `on delete cascade` (0018), so it goes with the row.
-- Nothing else references therapists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Billing has to outlive the row, or deleting the account silently keeps
-- charging the card.
--
-- Nobody is billed today (free until 2027-03-01, no paywall) which is exactly
-- why this is cheap to add now: the first therapist with a live subscription
-- who deletes their account would otherwise keep paying for a profile that no
-- longer exists, and the ids needed to cancel it would be gone with the row.
--
-- Deliberately holds NO personal data -- no name, no email. Stripe ids only,
-- which is the minimum needed to stop a payment, so this stays a deletion
-- rather than a quiet archive of the person.
-- ---------------------------------------------------------------------------
create table if not exists deleted_therapists (
  user_id                uuid primary key,
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,
  deleted_at             timestamptz not null default now(),
  cancelled_at           timestamptz          -- set by hand once the sub is cancelled
);

comment on table deleted_therapists is
  'Billing tombstones for self-deleted therapists. Stripe ids only, no PII. A row here with stripe_subscription_id set and cancelled_at null is a subscription still running for an account that no longer exists -- cancel it, then stamp cancelled_at.';

alter table deleted_therapists enable row level security;
-- No policies: RLS on with zero policies denies anon and authenticated
-- outright. service_role bypasses RLS, so admin tooling still reads it.
revoke all on table deleted_therapists from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The RPC. Takes NO arguments on purpose: it can only ever act on the caller's
-- own auth.uid(), so there is no parameter to tamper with and no way to aim it
-- at another therapist. security definer is needed to write the tombstone,
-- which authenticated cannot touch.
-- ---------------------------------------------------------------------------
create or replace function delete_my_therapist_account()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   int  := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into deleted_therapists (user_id, stripe_customer_id, stripe_subscription_id, subscription_status)
  select t.user_id, t.stripe_customer_id, t.stripe_subscription_id, t.subscription_status
    from therapists t
   where t.user_id = uid
  on conflict (user_id) do update
     set stripe_customer_id     = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         subscription_status    = excluded.subscription_status,
         deleted_at             = now();

  delete from therapists where user_id = uid;   -- licences cascade
  get diagnostics n = row_count;

  -- Returned so the caller can tell a real deletion from a no-op. The app only
  -- claims success on >= 1; otherwise it says so instead of logging the person
  -- out on a lie, which is the whole bug this migration exists to fix.
  return n;
end;
$$;

comment on function delete_my_therapist_account() is
  'Self-service account deletion for the signed-in therapist. Records a billing tombstone, deletes the therapists row (licences cascade), returns rows deleted. Cannot target anyone but the caller.';

revoke all     on function delete_my_therapist_account() from public, anon;
grant  execute on function delete_my_therapist_account() to authenticated;

-- ---------------------------------------------------------------------------
-- NOT handled here, on purpose: the auth.users row survives. Deleting a user
-- needs the Auth admin API (service_role), which belongs in an Edge Function,
-- not in a SQL function reachable from a browser. The practical effect is that
-- the email can still sign in -- and lands in the signup wizard with no
-- profile, because the therapists row is gone. That is the correct experience
-- for someone returning after deleting; it just is not a full erasure of the
-- login. Worth closing before launch if a therapist ever asks for one under
-- CCPA/GDPR.
--
-- Proof:
--   select count(*) from therapists where user_id = '<uid>';        -- 0
--   select * from deleted_therapists where user_id = '<uid>';       -- 1 row
-- ---------------------------------------------------------------------------
