-- ============================================================================
-- 0012 -- Admin review queue
--
-- Onboarding a therapist means checking two things by hand:
--   1. their license, against the state board's public registry
--   2. that they are who they say (Stripe Identity does this one)
-- This exposes what an admin needs to do (1) in one place, and to see who is
-- waiting.
--
-- WHY THESE ARE SECURITY DEFINER + SERVICE-ROLE ONLY
-- The queue joins auth.users for the therapist's email. Nothing anonymous or
-- merely-authenticated may read that, so these functions are revoked from
-- anon/authenticated like every other privileged function in 0008-0011. The
-- ONLY caller is the admin-api Edge Function, which verifies the caller's JWT
-- and checks their email against an allowlist before it uses the service key.
--
-- The service_role key still must never reach a browser: admin.html calls the
-- Edge Function, never PostgREST directly.
-- ============================================================================

-- Everything an admin needs to make a verification decision, in one row per
-- therapist. Deliberately NOT a view: a view would be reachable via PostgREST
-- and would need its own RLS story for a table that contains emails.
create or replace function admin_review_queue(p_filter text default 'pending')
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
  created_at          timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.user_id,
         t.name,
         u.email::text,
         t.license_number,
         t.license_states,
         t.license_verified,
         t.license_verified_at,
         t.identity_verified,
         t.published,
         t.subscription_status,
         t.created_at
  from therapists t
  left join auth.users u on u.id = t.user_id
  where case
          when p_filter = 'pending'  then not (t.license_verified and t.identity_verified)
          when p_filter = 'verified' then (t.license_verified and t.identity_verified)
          else true
        end
  order by t.created_at desc;
$$;

-- Counts for the dashboard badge. Cheap enough to call on every page load.
create or replace function admin_review_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',              count(*),
    -- the queue that actually needs a human
    'awaiting_license',   count(*) filter (where not license_verified),
    'awaiting_identity',  count(*) filter (where not identity_verified),
    -- the state worth watching: paying, and still invisible
    'paying_but_hidden',  count(*) filter (where published and not (license_verified and identity_verified)),
    'live',               count(*) filter (where published and license_verified and identity_verified)
  )
  from therapists;
$$;

revoke all on function admin_review_queue(text) from public, anon, authenticated;
revoke all on function admin_review_counts()   from public, anon, authenticated;
