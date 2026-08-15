-- ============================================================================
-- 0050 -- Inquiry pulse for HQ, with no new endpoint
--
-- "Can I just see it in my HQ?" -- yes, and without a mail vendor, an
-- allowlist or a redeployed Edge Function. HQ already reads hq_kv, which is
-- gated on is_hq_member(), so a trigger writes an aggregate row there and HQ
-- reads it through the code path it already has.
--
-- ---------------------------------------------------------------------------
-- COUNTS ONLY. No email, no message, no therapist id -- and this is not
-- caution for its own sake, it is the rule HQ already follows. From
-- hq-cloud.js on the review queue: "HQ shows you that someone is waiting,
-- /review is where you look at who."
--
-- The same logic is stronger here. A therapist reading their own inquiries is
-- reading their own client's words. An operator dashboard showing every
-- client's email and their reason for seeking therapy is a categorically
-- wider disclosure, it is not needed to answer the question being asked
-- ("has anyone come through yet?"), and minimum-necessary says do not collect
-- the view you do not need. The content stays with the therapist it was sent
-- to.
-- ---------------------------------------------------------------------------
--
-- Recomputed in full on every write rather than incremented: a counter that
-- drifts is worse than no counter, and at this size the count is free. When
-- it stops being free, that is a happy problem and an index away.
-- ============================================================================

create or replace function hq_refresh_inquiry_pulse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'total',      count(*),
    'unread',     count(*) filter (where read_at is null),
    'open',       count(*) filter (where archived_at is null),
    'last_7d',    count(*) filter (where created_at > now() - interval '7 days'),
    'first_at',   min(created_at),
    'last_at',    max(created_at),
    'updated_at', now()
  ) into v
  from client_inquiries;

  insert into hq_kv (k, v) values ('inquiry_pulse', v)
  on conflict (k) do update set v = excluded.v;

  return null;   -- AFTER trigger; the return value is ignored
end;
$$;

comment on function hq_refresh_inquiry_pulse() is
  'Maintains hq_kv.inquiry_pulse: counts and timestamps only, never an email, a message or a therapist id. HQ answers "is anyone coming through"; the therapist portal is where the words live.';

/* Fires on delete too, so a removed inquiry cannot leave the number overstated
   -- a dashboard that only ever counts up is the kind of thing nobody notices
   is wrong. */
drop trigger if exists client_inquiries_hq_pulse on client_inquiries;
create trigger client_inquiries_hq_pulse
  after insert or update or delete on client_inquiries
  for each statement execute function hq_refresh_inquiry_pulse();

-- Seed it now so HQ shows a real zero rather than "never recorded", which
-- reads as broken.
insert into hq_kv (k, v)
select 'inquiry_pulse', jsonb_build_object(
  'total', count(*), 'unread', 0, 'open', 0, 'last_7d', 0,
  'first_at', null, 'last_at', null, 'updated_at', now())
from client_inquiries
on conflict (k) do nothing;

-- Proof (run separately):
--   select v from hq_kv where k = 'inquiry_pulse';   -- totals, no PHI
