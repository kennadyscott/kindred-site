-- =============================================================================
-- Kindred — surface the traffic source on the rolled-up events view
--
-- The therapist emails now carry ?src=outreach, and the tracker records it in
-- props. events_daily did not select it, so HQ could see that someone opened
-- the signup page but not that the email is what sent them — which is the only
-- question the outreach is actually asking.
--
-- Coarse channel only. There is deliberately no per-recipient token: that would
-- turn an aggregate counts table into one that identifies people, and the whole
-- design rests on it not being able to.
-- =============================================================================

create or replace view public.events_daily
  with (security_invoker = on) as
select
  (created_at at time zone 'America/Denver')::date as day,
  event,
  props ->> 'plan' as plan,
  props ->> 'path' as path,
  props ->> 'src'  as src,
  count(*)         as n
from public.events
group by 1, 2, 3, 4, 5;

grant select on public.events_daily to authenticated;
