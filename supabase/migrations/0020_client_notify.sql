-- ============================================================================
-- 0020 -- "Tell me when a therapist joins"
--
-- A client who finishes the intake and finds nobody in their state can leave
-- one way to be reached. Until now that was stored in their own browser, so
-- nobody could actually act on it.
--
-- WHAT THIS DELIBERATELY DOES NOT HOLD
-- No user_id, no intake answers, no state, no needs, no diagnosis, nothing
-- about why they are waiting. An email stored beside "seeking help with
-- trauma" is health information; an email on its own is contact information.
-- Keeping them apart is what makes this safe to store before the BAA is
-- signed, and it is the same reasoning privacy.html already makes.
--
-- Client ACCOUNTS -- saved answers, saved therapists, a profile that follows
-- them between devices -- are a different thing and still wait on the BAA.
--
-- Insert-only for anon, exactly like events and therapist_leads: a visitor can
-- add their address and nobody anonymous can read the list back.
-- ============================================================================

create table if not exists client_notify (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  phone        text,
  contact_pref text,                    -- 'email' | 'text' | 'both'
  created_at   timestamptz not null default now()
);

alter table client_notify enable row level security;

drop policy if exists "insert only" on client_notify;
create policy "insert only" on client_notify for insert to anon, authenticated with check (true);

grant insert on client_notify to anon, authenticated;
grant select, insert, update, delete on client_notify to service_role;

-- No unique index on email on purpose. An upsert would behave differently for
-- an address already on the list, which is a way to test whether someone is
-- waiting for a therapist. Duplicates are deduped when the list is read.
create index if not exists client_notify_created_idx on client_notify (created_at desc);

-- ---------------------------------------------------------------------------
-- The list, for the admin queue. Deduped, newest first.
-- ---------------------------------------------------------------------------
create or replace function admin_notify_list()
returns table (email text, phone text, contact_pref text, first_asked timestamptz, times_asked bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(n.email), ''), '(phone only)') as email,
         max(n.phone)        as phone,
         max(n.contact_pref) as contact_pref,
         min(n.created_at)   as first_asked,
         count(*)            as times_asked
  from client_notify n
  group by coalesce(nullif(btrim(n.email), ''), '(phone only)')
  order by min(n.created_at) desc;
$$;

revoke all    on function admin_notify_list() from public, anon, authenticated;
grant  execute on function admin_notify_list() to service_role;

-- Surface the count alongside the therapist review numbers.
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
    'clients_waiting',   (select count(distinct coalesce(nullif(btrim(email), ''), phone)) from client_notify)
  );
$$;

revoke all    on function admin_review_counts() from public, anon, authenticated;
grant  execute on function admin_review_counts() to service_role;
