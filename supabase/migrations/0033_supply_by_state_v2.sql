-- =============================================================================
-- Kindred — therapist supply by state, sourced from declared licences
--
-- 0032 read therapists.license_states, which a trigger derives from VERIFIED
-- licences only. With nothing verified yet every therapist fell into '??' and
-- the by-state view — the whole point — was empty.
--
-- therapist_licenses carries the state from the moment a therapist types it in,
-- so it answers the marketing question ("where are they coming from") as well
-- as the readiness one ("where can a client actually be matched"). Both are
-- reported, because they are different decisions:
--
--   claimed   licence entered, whatever its status  -> where interest is
--   verified  we have checked it                    -> where the queue is
--   live      verified + published + accepting      -> where clients are served
--
-- Counts only. No names, no emails, no licence numbers.
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
  with per_state as (
    select
      upper(trim(l.state))                  as st,
      l.user_id,
      l.verified_at,
      coalesce(t.published, false)          as published,
      coalesce(t.accepting, false)          as accepting,
      coalesce(t.identity_verified, false)  as identity_verified,
      t.subscription_status,
      t.created_at
    from public.therapist_licenses l
    join public.therapists t on t.user_id = l.user_id
    where nullif(trim(coalesce(l.state, '')), '') is not null
      and l.rejected_at is null          -- a rejected licence is not supply
  ),
  -- Anyone who has paid or signed up but entered no licence at all still needs
  -- to be visible: they are the ones stuck in the funnel.
  unplaced as (
    select
      '??'::text as st, t.user_id, null::timestamptz as verified_at,
      coalesce(t.published, false) as published,
      coalesce(t.accepting, false) as accepting,
      coalesce(t.identity_verified, false) as identity_verified,
      t.subscription_status, t.created_at
    from public.therapists t
    where not exists (
      select 1 from public.therapist_licenses l
      where l.user_id = t.user_id and l.rejected_at is null
    )
  ),
  all_rows as (select * from per_state union all select * from unplaced)
  select
    st                                                                    as state,
    count(*)                                                              as therapists,
    count(*) filter (where subscription_status in ('active','trialing'))  as paying,
    count(*) filter (where verified_at is not null)                       as verified,
    count(*) filter (where verified_at is not null and identity_verified
                       and published and accepting)                       as live,
    count(*) filter (where created_at > now() - interval '30 days')       as new_30d
  from all_rows
  group by st
  order by live desc, verified desc, therapists desc, st;
$$;

revoke all on function admin_supply_by_state() from public, anon, authenticated;
