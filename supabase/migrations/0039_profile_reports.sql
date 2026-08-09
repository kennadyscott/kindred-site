-- ============================================================================
-- 0039 -- "Report this profile"
--
-- Therapist profiles carry free text and (soon) photos uploaded to a public
-- bucket. There is a placeholder/profanity check on the text at publish time,
-- but that only catches words on a list, and it cannot look at an image at
-- all. The backstop for everything it misses is a person saying so.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE
-- No reporter identity: no user id, no email, no IP, no session. Reports come
-- from CLIENTS, and Kindred holds no client data server-side until a BAA is
-- signed. A report is not clinical information, but "this person was looking
-- at that therapist and objected" is exactly the kind of inference the BAA
-- gate exists to prevent, and it would be a strange thing to start collecting
-- one migration before deciding the policy.
--
-- The cost is real and accepted: no way to contact a reporter for detail, no
-- way to rate-limit one person, and no way to weight a trusted reporter over
-- a malicious one. All three are solvable later; none is worth holding client
-- identity for today.
--
-- `detail` is free text written by a stranger about a named therapist. It is
-- admin-only for that reason -- never rendered to another client, never shown
-- on the profile.
-- ============================================================================

create table if not exists profile_reports (
  id           uuid primary key default gen_random_uuid(),
  therapist_id uuid not null,          -- NOT a FK on purpose; see below
  reason       text not null,
  detail       text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolution   text                    -- what was done, set by hand
);

/* No foreign key to therapists(user_id). delete_my_therapist_account() (0036)
   hard-deletes the row, and `on delete cascade` would erase the report at
   exactly the moment it mattered most -- a profile removed right after being
   reported is the case you most want a record of. An orphaned therapist_id is
   the correct outcome here. */

comment on table profile_reports is
  'Client reports about a therapist profile. Holds NO reporter identity by design (see 0039). detail is untrusted free text and is admin-only.';

-- Cheap guard rails at the database, not just in the UI: a reason from the
-- fixed list, and a bounded detail so a single POST cannot dump megabytes.
alter table profile_reports drop constraint if exists profile_reports_reason_chk;
alter table profile_reports add  constraint profile_reports_reason_chk
  check (reason in ('profanity', 'nudity', 'harassment', 'not-a-therapist', 'other'));

alter table profile_reports drop constraint if exists profile_reports_detail_len;
alter table profile_reports add  constraint profile_reports_detail_len
  check (detail is null or char_length(detail) <= 2000);

create index if not exists profile_reports_open_idx
  on profile_reports (created_at desc) where resolved_at is null;
create index if not exists profile_reports_therapist_idx
  on profile_reports (therapist_id);

alter table profile_reports enable row level security;

/* Insert-only for the public, mirroring client_notify (0020). Anyone can file
   a report; nobody but service_role can read one back. Without the read
   restriction, a report naming a therapist would itself be a public accusation
   readable by anyone with the anon key. */
drop policy if exists "report insert only" on profile_reports;
create policy "report insert only" on profile_reports
  for insert to anon, authenticated with check (true);

revoke all    on table profile_reports from anon, authenticated;
grant  insert on table profile_reports to anon, authenticated;
grant  select, insert, update, delete on table profile_reports to service_role;

-- ---------------------------------------------------------------------------
-- Admin view for the HQ queue. service_role only, same as admin_notify_list().
-- ---------------------------------------------------------------------------
create or replace function admin_profile_reports()
returns table (
  id uuid, therapist_id uuid, therapist_name text, reason text,
  detail text, created_at timestamptz, resolved_at timestamptz, resolution text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.therapist_id, t.name, r.reason,
         r.detail, r.created_at, r.resolved_at, r.resolution
    from profile_reports r
    left join therapists t on t.user_id = r.therapist_id   -- left: the row may be gone
   order by (r.resolved_at is null) desc, r.created_at desc;
$$;

revoke all    on function admin_profile_reports() from public, anon, authenticated;
grant  execute on function admin_profile_reports() to service_role;

-- Proof:
--   select * from admin_profile_reports();          -- service_role only
--   insert into profile_reports (therapist_id, reason) values (gen_random_uuid(), 'nope');
--     -> should fail the reason check constraint
