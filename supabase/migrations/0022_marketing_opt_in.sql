-- ============================================================================
-- 0022 -- Marketing consent for therapists
--
-- A therapist's email has always been captured -- it is how they sign in. But
-- that is a TRANSACTIONAL address: account, billing, licence verdicts, identity
-- results. Those send regardless of anything here and always will; you cannot
-- opt out of being told your licence was rejected.
--
-- What did not exist was permission to send anything ELSE. This is that
-- permission, recorded as its own fact with the moment it was given.
--
-- WHY A TIMESTAMP AND NOT JUST A BOOLEAN
-- "They agreed" is not defensible on its own. The question that gets asked
-- later is always "when, and to what?" -- so the moment is stored beside the
-- answer. Cleared when they opt back out, so the column never claims a consent
-- that has since been withdrawn.
--
-- DEFAULT IS FALSE, DELIBERATELY
-- A pre-ticked box is not consent under GDPR, and a therapist who finds
-- themselves on a mailing list they never joined is the fastest way to lose one.
-- Anyone who signed up before this migration gets false, which is correct: they
-- were never asked.
-- ============================================================================

alter table therapists add column if not exists marketing_opt_in    boolean not null default false;
alter table therapists add column if not exists marketing_opt_in_at timestamptz;

comment on column therapists.marketing_opt_in is
  'Permission for MARKETING email only. Transactional mail (billing, licence, identity) is unaffected and always sends.';
comment on column therapists.marketing_opt_in_at is
  'When consent was given. Null whenever marketing_opt_in is false.';

-- Keep the two honest with each other rather than trusting every writer to.
create or replace function therapists_sync_optin_ts()
returns trigger
language plpgsql
as $$
begin
  if new.marketing_opt_in and not coalesce(old.marketing_opt_in, false) then
    new.marketing_opt_in_at := now();          -- newly granted
  elsif not new.marketing_opt_in then
    new.marketing_opt_in_at := null;           -- withdrawn, or never given
  end if;
  return new;
end;
$$;

drop trigger if exists therapists_optin_ts on therapists;
create trigger therapists_optin_ts
  before insert or update of marketing_opt_in on therapists
  for each row execute function therapists_sync_optin_ts();

-- ---------------------------------------------------------------------------
-- The list, for whoever sends the mail. Opted-in only, newest consent first.
-- Service-role only: a marketing list is not something anon should be able to
-- read back, same rule as every other admin function here.
-- ---------------------------------------------------------------------------
create or replace function admin_marketing_list()
returns table (email text, name text, opted_in_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
  select u.email::text, t.name, t.marketing_opt_in_at
  from therapists t
  join auth.users u on u.id = t.user_id
  where t.marketing_opt_in
  order by t.marketing_opt_in_at desc nulls last;
$$;

revoke all     on function admin_marketing_list() from public, anon, authenticated;
grant  execute on function admin_marketing_list() to service_role;

-- Surface the count beside the other review numbers.
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
    'newsletter',        (select count(distinct lower(btrim(email))) from newsletter_signups),
    'therapist_optin',   (select count(*) from therapists where marketing_opt_in)
  );
$$;

revoke all     on function admin_review_counts() from public, anon, authenticated;
grant  execute on function admin_review_counts() to service_role;
