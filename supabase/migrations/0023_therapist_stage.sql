-- ============================================================================
-- 0023 -- Where each therapist stopped
--
-- Onboarding is now: create an account -> build a profile (free) -> ACTIVATE
-- (the paywall) -> licence and identity checked -> live. Every one of those
-- boundaries is somewhere a person can stall, and each stall wants a different
-- email. This turns "read the rows and work it out" into one query.
--
-- STARTS FROM auth.users, NOT therapists, deliberately. Someone who creates an
-- account and closes the tab before the first Continue has no therapists row
-- at all -- and they are the single most recoverable group there is. Joining
-- the other way round would make them invisible, which is the exact blind spot
-- this exists to remove.
--
-- Service-role only, like every admin function here: this returns email
-- addresses beside how far someone got, which is not something anon should be
-- able to read back.
-- ============================================================================

create or replace function therapist_stage()
returns table (
  email        text,
  name         text,
  stage        text,
  stage_rank   int,
  signed_up_at timestamptz,
  days_stalled int,
  opted_in     boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    t.name,
    case
      -- paid AND both checks passed: visible to clients
      when t.published and t.license_verified and t.identity_verified then 'live'
      -- paid, still waiting on licence or identity
      when t.subscription_status in ('active', 'trialing')            then 'activated'
      -- finished the wizard: a name and at least one specialty is what it
      -- cannot be completed without
      when t.name is not null and btrim(t.name) <> ''
       and coalesce(array_length(t.specialties, 1), 0) > 0            then 'profile_built'
      -- a row exists, so they pressed Continue at least once
      when t.user_id is not null                                      then 'profile_started'
      -- account created, wizard never begun
      else 'account_only'
    end as stage,
    case
      when t.published and t.license_verified and t.identity_verified then 5
      when t.subscription_status in ('active', 'trialing')            then 4
      when t.name is not null and btrim(t.name) <> ''
       and coalesce(array_length(t.specialties, 1), 0) > 0            then 3
      when t.user_id is not null                                      then 2
      else 1
    end as stage_rank,
    u.created_at,
    -- how long they have been sitting where they are; the number that decides
    -- whether an email is a nudge or a pester
    greatest(0, extract(day from (now() - coalesce(t.updated_at, u.created_at)))::int) as days_stalled,
    coalesce(t.marketing_opt_in, false)
  from auth.users u
  left join therapists t on t.user_id = u.id
  -- clients have auth accounts too once that is switched on; a therapist is
  -- someone with a therapists row, or with nothing yet and no client data.
  where t.user_id is not null
     or not exists (select 1 from client_notify c where lower(c.email) = lower(u.email))
  order by 4 asc, u.created_at asc;
$$;

revoke all     on function therapist_stage() from public, anon, authenticated;
grant  execute on function therapist_stage() to service_role;

-- ---------------------------------------------------------------------------
-- The same thing counted, for a dashboard tile.
-- ---------------------------------------------------------------------------
create or replace function therapist_stage_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb)
  from (select stage, count(*) as n from therapist_stage() group by stage) x;
$$;

revoke all     on function therapist_stage_counts() from public, anon, authenticated;
grant  execute on function therapist_stage_counts() to service_role;
