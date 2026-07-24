-- ============================================================================
-- 0005 — Table-level grants
--
-- LEARNED IN PRODUCTION (2026-07-23): RLS policies alone are not enough.
-- PostgREST also requires ordinary GRANTs on each table — the policy decides
-- WHICH rows a role may touch, the grant decides WHETHER it may touch the
-- table at all. This project's defaults did not auto-grant to anon/authed.
--
-- Note the asymmetry, which is deliberate:
--   vocab           → SELECT only (reference data, world-readable)
--   events          → INSERT only (analytics goes in; nobody anonymous reads it back)
--   therapist_leads → INSERT only (same: signups go in, admin reads via service role)
--   therapists      → authenticated only; RLS then narrows to the owner's row
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select on vocab to anon, authenticated;
grant insert on events to anon, authenticated;
grant insert on therapist_leads to anon, authenticated;
grant select, insert, update on therapists to authenticated;

-- identity-column sequences (harmless if already implied)
grant usage on all sequences in schema public to anon, authenticated;
