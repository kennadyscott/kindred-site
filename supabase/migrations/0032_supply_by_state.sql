-- =============================================================================
-- Kindred — therapist supply by state
--
-- Where the marketing money should go. Counts only: no names, no emails, no
-- licence numbers. HQ needs to know Colorado has four live therapists and
-- Florida none — not who they are.
--
-- Follows the same shape as admin_review_counts: a security definer function,
-- revoked from anon and authenticated, callable only by the admin-api Edge
-- Function which has already verified the caller against ADMIN_EMAILS. HQ has
-- no direct read on therapists and this does not give it one.
--
-- A therapist licensed in several states counts once per state, because supply
-- is a per-state question — someone licensed in CO and NM is real coverage in
-- both. The distinct-therapist total is therefore lower than the sum of the
-- rows, which is correct rather than a bug.
--
-- Anyone with no licence state at all lands in '??' so the gap is visible.
-- =============================================================================

create or replace function admin_supply_by_state()
returns table (
  state       text,
  therapists  bigint,
  paying      bigint,
  verified    bigint,
  live        bigint,
  new_30d     bigint
)
language sql
security definer
set search_path = public
as $$
  with expanded as (
    select
      t.user_id,
      upper(trim(s)) as st,
      coalesce(t.published, false)         as published,
      coalesce(t.accepting, false)         as accepting,
      coalesce(t.license_verified, false)  as license_verified,
      coalesce(t.identity_verified, false) as identity_verified,
      t.subscription_status,
      t.created_at
    from public.therapists t
    cross join lateral unnest(
      -- license_states is the only source: 0002_scale copied the old singular
      -- license_state into it and dropped that column. '??' keeps a therapist
      -- with no state on the books rather than silently dropping them — an
      -- unassigned profile is a data problem worth seeing, not hiding.
      case
        when coalesce(array_length(t.license_states, 1), 0) > 0 then t.license_states
        else array['??']
      end
    ) as s
    where nullif(trim(coalesce(s, '')), '') is not null
  )
  select
    st                                                                    as state,
    count(*)                                                              as therapists,
    count(*) filter (where subscription_status in ('active','trialing'))  as paying,
    count(*) filter (where license_verified and identity_verified)        as verified,
    -- "live" is the only number a client can actually benefit from:
    -- verified, published and open to new clients.
    count(*) filter (where published and accepting
                       and license_verified and identity_verified)        as live,
    count(*) filter (where created_at > now() - interval '30 days')       as new_30d
  from expanded
  group by st
  order by live desc, therapists desc, st;
$$;

revoke all on function admin_supply_by_state() from public, anon, authenticated;
