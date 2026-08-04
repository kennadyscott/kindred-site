-- ============================================================================
-- 0021 -- Newsletter signups
--
-- A footer form on every page, so the list has to be safe to fill from an
-- anonymous browser on any page of the site.
--
-- WHAT THIS DELIBERATELY DOES NOT HOLD
-- An email address and nothing else. No user_id, no page they signed up from,
-- no intake answers, no state, no reason. Exactly the reasoning 0020 makes for
-- client_notify: an email stored beside "seeking help with trauma" is health
-- information, an email on its own is contact information. That is what makes
-- this safe to collect before the BAA is signed.
--
-- Kept SEPARATE from client_notify on purpose. That list is people waiting for
-- a therapist in their state -- an operational queue someone has to work
-- through. This is a marketing list. Merging them would mean either mailing a
-- newsletter to people waiting on a match, or losing the waiting list inside
-- the mailing list. Two different promises, two different tables.
--
-- Insert-only for anon, like events, therapist_leads and client_notify: a
-- visitor can add their address and nobody anonymous can read the list back.
-- ============================================================================

create table if not exists newsletter_signups (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,                   -- which page's footer, for nothing more than knowing what works
  created_at timestamptz not null default now()
);

alter table newsletter_signups enable row level security;

drop policy if exists "insert only" on newsletter_signups;
create policy "insert only" on newsletter_signups
  for insert to anon, authenticated with check (true);

grant insert                          on newsletter_signups to anon, authenticated;
grant select, insert, update, delete  on newsletter_signups to service_role;

-- No unique index on email, same reasoning as 0020: an upsert behaves
-- differently for an address already on the list, which turns the form into a
-- way to test whether a given person subscribed. Duplicates are deduped on read.
create index if not exists newsletter_created_idx on newsletter_signups (created_at desc);

-- ---------------------------------------------------------------------------
-- The list, for the admin queue. Deduped, newest first.
-- ---------------------------------------------------------------------------
create or replace function admin_newsletter_list()
returns table (email text, first_signed timestamptz, times_signed bigint, sources text[])
language sql
security definer
set search_path = public
as $$
  select lower(btrim(n.email))                     as email,
         min(n.created_at)                         as first_signed,
         count(*)                                  as times_signed,
         array_agg(distinct n.source) filter (where n.source is not null) as sources
  from newsletter_signups n
  group by lower(btrim(n.email))
  order by min(n.created_at) desc;
$$;

revoke all     on function admin_newsletter_list() from public, anon, authenticated;
grant  execute on function admin_newsletter_list() to service_role;

-- Surface the count alongside the therapist review numbers and clients_waiting.
create or replace function admin_review_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',             (select count(*) from therapists),
    'awaiting_license',  (select count(distinct user_id) from therapist_licenses
                          where verified_at is null and rejected_at is null),
    'awaiting_identity', (select count(*) from therapists where not identity_verified),
    'rejected',          (select count(distinct user_id) from therapist_licenses where rejected_at is not null),
    'paying_but_hidden', (select count(*) from therapists
                          where published and not (license_verified and identity_verified)),
    'live',              (select count(*) from therapists
                          where published and license_verified and identity_verified),
    'clients_waiting',   (select count(distinct coalesce(nullif(btrim(email), ''), phone)) from client_notify),
    'newsletter',        (select count(distinct lower(btrim(email))) from newsletter_signups)
  );
$$;

revoke all     on function admin_review_counts() from public, anon, authenticated;
grant  execute on function admin_review_counts() to service_role;
