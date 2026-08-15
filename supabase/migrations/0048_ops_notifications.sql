-- ============================================================================
-- 0048 -- ops_notifications: send-once bookkeeping for alert emails
--
-- The first-client tripwire has to fire exactly once, ever. "Is this the first
-- row?" answered by counting is not that: two inquiries arriving in the same
-- second both count 1, a webhook retry counts again, and a deleted row makes
-- the second client look like the first.
--
-- So the fact that an alert was sent is itself a row, with a unique key. The
-- notify-inquiry function inserts on conflict do nothing and sends only when
-- the insert actually happened -- which the database makes atomic and
-- therefore exactly-once, retries and races included.
--
-- NO PHI. Keys are 'first_client' and 'inquiry:<uuid>'. The uuid is the
-- inquiry's own id, which says nothing about a person on its own, and this
-- table is never read by anything client-facing.
-- ============================================================================

create table if not exists ops_notifications (
  key     text primary key,
  sent_at timestamptz not null default now()
);

comment on table ops_notifications is
  'One row per alert email already sent. Exists so the first-client tripwire fires exactly once and webhook retries do not re-send. Service role only.';

alter table ops_notifications enable row level security;

-- Deliberately no policies. RLS with no policy denies everyone; the Edge
-- Function reaches it with the service role, which bypasses RLS. anon and
-- authenticated must never see or touch this.

-- Proof (run separately):
--   select * from ops_notifications;   -- 0 rows, and stays empty until an alert sends
