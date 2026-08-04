-- ============================================================================
-- 0018 -- One licence per state, each verified separately
--
-- THE MODEL WAS WRONG
-- therapists had ONE license_number and an ARRAY of license_states. A therapist
-- licensed in TX and CA holds two different licence numbers, so the number
-- could only ever describe one of them.
--
-- Worse, it was an integrity hole. license_states was NOT covered by the guard
-- trigger, and match_therapists filters on it:
--
--     and (p_state is null or t.license_states @> array[p_state])
--
-- So a therapist verified once, in one state, could PATCH the other 49 onto
-- their own row and be matched with clients anywhere. license_verified is a
-- single boolean; it never knew WHICH state had been checked.
--
-- THE SHAPE NOW
-- therapist_licenses: one row per (therapist, state), each with its own number
-- and its own verification. therapists.license_states is no longer written by
-- anyone -- a trigger recomputes it from VERIFIED licences only, so matching
-- keeps working unchanged and can only ever reach a state we actually checked.
-- license_verified becomes "has at least one verified state".
-- ============================================================================

create table if not exists therapist_licenses (
  user_id         uuid not null references therapists(user_id) on delete cascade,
  state           text not null,
  license_number  text not null,
  created_at      timestamptz not null default now(),
  -- admin-only, same guarantees as the columns on therapists
  verified_at     timestamptz,
  verified_by     text,
  rejected_at     timestamptz,
  rejected_reason text,
  primary key (user_id, state)
);

alter table therapist_licenses enable row level security;

-- A therapist manages their own licences; nobody reads anyone else's.
drop policy if exists "read own licenses"   on therapist_licenses;
drop policy if exists "insert own licenses" on therapist_licenses;
drop policy if exists "update own licenses" on therapist_licenses;
drop policy if exists "delete own licenses" on therapist_licenses;
create policy "read own licenses"   on therapist_licenses for select to authenticated using (user_id = auth.uid());
create policy "insert own licenses" on therapist_licenses for insert to authenticated with check (user_id = auth.uid());
create policy "update own licenses" on therapist_licenses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own licenses" on therapist_licenses for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on therapist_licenses to authenticated;
grant select, insert, update, delete on therapist_licenses to service_role;

-- ---------------------------------------------------------------------------
-- Carry existing data across, BEFORE the guard trigger exists -- it would null
-- out the verified_at values we are migrating. Anyone already verified keeps
-- their verification on the states they had claimed; the rest arrive pending.
-- ---------------------------------------------------------------------------
insert into therapist_licenses (user_id, state, license_number, verified_at, verified_by)
select t.user_id,
       s.state,
       coalesce(nullif(btrim(t.license_number), ''), 'unknown') as license_number,
       case when t.license_verified then coalesce(t.license_verified_at, now()) end,
       case when t.license_verified then coalesce(t.license_verified_by, 'migrated') end
from therapists t
cross join lateral unnest(coalesce(t.license_states, '{}')) as s(state)
on conflict (user_id, state) do nothing;

-- A licence number with no state at all still needs to reach the queue.
insert into therapist_licenses (user_id, state, license_number)
select t.user_id, 'UNSPECIFIED', btrim(t.license_number)
from therapists t
where coalesce(btrim(t.license_number), '') <> ''
  and coalesce(array_length(t.license_states, 1), 0) = 0
on conflict (user_id, state) do nothing;

-- ---------------------------------------------------------------------------
-- Verification columns are admin-only, exactly like the ones on therapists.
-- ---------------------------------------------------------------------------
create or replace function licenses_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    if TG_OP = 'INSERT' then
      new.verified_at := null; new.verified_by := null;
      new.rejected_at := null; new.rejected_reason := null;
    else
      new.verified_at := old.verified_at; new.verified_by := old.verified_by;
      new.rejected_at := old.rejected_at; new.rejected_reason := old.rejected_reason;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists licenses_guard_trg on therapist_licenses;
create trigger licenses_guard_trg
  before insert or update on therapist_licenses
  for each row execute function licenses_guard_verification();

-- ---------------------------------------------------------------------------
-- therapists.license_states is now DERIVED. Nobody writes it directly; it is
-- recomputed from verified licences, so matching cannot reach an unverified
-- state even if someone tampers with the therapist row.
-- ---------------------------------------------------------------------------
create or replace function sync_therapist_licensure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  perform set_config('kindred.verify_ok', 'on', true);   -- writing guarded columns
  update therapists t
     set license_states = coalesce((
           select array_agg(l.state order by l.state)
           from therapist_licenses l
           where l.user_id = v_user and l.verified_at is not null), '{}'),
         license_verified = exists (
           select 1 from therapist_licenses l
           where l.user_id = v_user and l.verified_at is not null)
   where t.user_id = v_user;
  return null;
end;
$$;

drop trigger if exists sync_licensure_trg on therapist_licenses;
create trigger sync_licensure_trg
  after insert or update or delete on therapist_licenses
  for each row execute function sync_therapist_licensure();

-- license_states must not be writable by the therapist any more.
create or replace function therapists_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    new.license_verified        := old.license_verified;
    new.license_verified_at     := old.license_verified_at;
    new.license_verified_by     := old.license_verified_by;
    new.identity_verified       := old.identity_verified;
    new.identity_verified_at    := old.identity_verified_at;
    new.stripe_identity_session_id := old.stripe_identity_session_id;
    new.license_rejected_at     := old.license_rejected_at;
    new.license_rejected_reason := old.license_rejected_reason;
    new.license_rejected_by     := old.license_rejected_by;
    new.license_states          := old.license_states;   -- derived; see sync trigger
  end if;
  return new;
end;
$$;

create or replace function therapists_guard_verification_insert()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kindred.verify_ok', true), 'off') <> 'on' then
    new.license_verified        := false;
    new.license_verified_at     := null;
    new.license_verified_by     := null;
    new.identity_verified       := false;
    new.identity_verified_at    := null;
    new.stripe_identity_session_id := null;
    new.license_rejected_at     := null;
    new.license_rejected_reason := null;
    new.license_rejected_by     := null;
    new.license_states          := '{}';
  end if;
  return new;
end;
$$;

-- One-time rebuild now that the table is populated and the triggers exist.
do $sync$
begin
  perform set_config('kindred.verify_ok', 'on', true);
  update therapists t
     set license_states = coalesce((
           select array_agg(l.state order by l.state)
           from therapist_licenses l
           where l.user_id = t.user_id and l.verified_at is not null), '{}'),
         license_verified = exists (
           select 1 from therapist_licenses l
           where l.user_id = t.user_id and l.verified_at is not null);
end
$sync$;

-- ---------------------------------------------------------------------------
-- Admin actions are now per-state.
-- ---------------------------------------------------------------------------
create or replace function verify_therapist_license(
  p_email    text,
  p_state    text,
  p_verifier text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account_for_email');
  end if;

  perform set_config('kindred.verify_ok', 'on', true);

  update therapist_licenses
     set verified_at = now(), verified_by = p_verifier,
         rejected_at = null,  rejected_reason = null
   where user_id = v_user_id and state = upper(btrim(p_state));

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_license_for_state', 'state', p_state);
  end if;
  return jsonb_build_object('ok', true, 'state', upper(btrim(p_state)));
end;
$$;

create or replace function reject_therapist_license(
  p_email    text,
  p_state    text,
  p_reason   text,
  p_verifier text default 'admin'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account_for_email');
  end if;

  perform set_config('kindred.verify_ok', 'on', true);

  update therapist_licenses
     set verified_at = null, verified_by = null,
         rejected_at = now(), rejected_reason = btrim(p_reason)
   where user_id = v_user_id and state = upper(btrim(p_state));

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_license_for_state', 'state', p_state);
  end if;
  return jsonb_build_object('ok', true, 'state', upper(btrim(p_state)));
end;
$$;

-- The old single-argument shapes would silently do nothing now.
drop function if exists verify_therapist_license(text, text, text);
drop function if exists reject_therapist_license(text, text, text);
drop function if exists unverify_therapist_license(text, text);

-- ---------------------------------------------------------------------------
-- Queue: each therapist carries their licences, so the admin can act per state.
-- ---------------------------------------------------------------------------
drop function if exists admin_review_queue(text);
create function admin_review_queue(p_filter text default 'pending')
returns table (
  user_id             uuid,
  name                text,
  email               text,
  license_verified    boolean,
  identity_verified   boolean,
  published           boolean,
  subscription_status text,
  created_at          timestamptz,
  licenses            jsonb
)
language sql
security definer
set search_path = public
as $$
  with lic as (
    select l.user_id,
           jsonb_agg(jsonb_build_object(
             'state', l.state, 'number', l.license_number,
             'verified_at', l.verified_at, 'rejected_at', l.rejected_at,
             'rejected_reason', l.rejected_reason
           ) order by l.state) as items,
           count(*) filter (where l.verified_at is null and l.rejected_at is null) as pending_count
    from therapist_licenses l group by l.user_id
  )
  select t.user_id, t.name, u.email::text,
         t.license_verified, t.identity_verified, t.published,
         t.subscription_status, t.created_at,
         coalesce(lic.items, '[]'::jsonb)
  from therapists t
  left join auth.users u on u.id = t.user_id
  left join lic on lic.user_id = t.user_id
  where case
          when p_filter = 'pending'  then coalesce(lic.pending_count, 0) > 0
                                          or not t.identity_verified
          when p_filter = 'verified' then t.license_verified and t.identity_verified
          when p_filter = 'rejected' then exists (select 1 from therapist_licenses r
                                                  where r.user_id = t.user_id and r.rejected_at is not null)
          else true
        end
  order by t.created_at desc;
$$;

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
                          where published and license_verified and identity_verified)
  );
$$;

revoke all    on function verify_therapist_license(text, text, text)       from public, anon, authenticated;
grant  execute on function verify_therapist_license(text, text, text)      to service_role;
revoke all    on function reject_therapist_license(text, text, text, text) from public, anon, authenticated;
grant  execute on function reject_therapist_license(text, text, text, text) to service_role;
revoke all    on function admin_review_queue(text)                         from public, anon, authenticated;
grant  execute on function admin_review_queue(text)                        to service_role;
revoke all    on function admin_review_counts()                            from public, anon, authenticated;
grant  execute on function admin_review_counts()                           to service_role;
