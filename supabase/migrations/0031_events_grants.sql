-- =============================================================================
-- Kindred — fix the grants on events
--
-- 0030 created the RLS policies but relied on default table privileges, and
-- 0005_grants.sql had already revoked SELECT from anon/authenticated in public.
-- Two consequences:
--
--   1. events_daily is declared security_invoker, so reading the view runs as
--      the caller and needs SELECT on public.events as well. Only the view was
--      granted, so an hq_member reading it got "permission denied for table
--      events" and the Analytics tab would have shown an error, not data.
--   2. anon needs INSERT and nothing else — it must never read the table back.
--
-- Grants are the coarse gate; RLS is the fine one. Both have to line up.
-- =============================================================================

-- Visitors: write only. No select, ever — the whole point is that the counts
-- are not readable by the people being counted, or by anyone unauthenticated.
grant insert on public.events to anon, authenticated;
grant usage, select on sequence public.events_id_seq to anon, authenticated;
revoke select on public.events from anon;

-- HQ: readable, but still filtered by the events_select_members policy, so a
-- signed-in therapist gets zero rows rather than the dashboard.
grant select on public.events to authenticated;
grant select on public.events_daily to authenticated;

-- Sanity: a therapist account is authenticated but not an hq_member, and must
-- see nothing. That is enforced by the policy in 0030, not by these grants.
