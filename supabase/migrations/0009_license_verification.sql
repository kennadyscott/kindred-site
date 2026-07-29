-- ============================================================================
-- 0009 — Real license verification
--
-- WHY THIS EXISTS
-- The app showed clients "License verified via Stripe Identity" on every
-- therapist profile. Nothing backed it:
--   * the verification modal was a setTimeout that always succeeded
--   * no Stripe Identity call existed anywhere in the codebase
--   * the flag was derived as `!!license_number` — typing any string into the
--     license field produced a verified badge
-- Clients choosing a therapist for mental health care were being shown a
-- credential claim nobody had checked.
--
-- (Stripe Identity could not have backed it either: it verifies government ID
-- documents, not professional licenses against state boards. That is a
-- different problem and Stripe does not sell it.)
--
-- WHAT THIS DOES
-- Adds a real flag that only an admin can set, after actually looking the
-- license up on the state board's public registry.
--
-- SECURITY — read this before changing the grants
-- `grant select, insert, update on therapists to authenticated` plus the
-- "update own profile" policy lets a therapist PATCH ANY column on their own
-- row. A plain boolean would therefore be self-settable: PATCH
-- /therapists?user_id=eq.<self> {"license_verified":true} and the badge is back
-- to fiction.
--
-- Column-level REVOKE does not fix this. Postgres tracks table- and
-- column-level privileges separately, and a table-wide UPDATE grant still
-- permits the write regardless of any column-level revoke. The alternative,
-- revoking table UPDATE and re-granting column by column, silently breaks every
-- time a new column is added.
--
-- So the guard is a trigger: any UPDATE from a role other than service_role
-- keeps the previous verification values, whatever the request asked for.
-- ============================================================================

alter table therapists add column if not exists license_verified    boolean not null default false;
alter table therapists add column if not exists license_verified_at timestamptz;
alter table therapists add column if not exists license_verified_by text;

comment on column therapists.license_verified is
  'Set ONLY by an admin via the service role, after checking the state board registry. Never self-serve — see the guard trigger below.';

-- ---------------------------------------------------------------------------
-- The guard. NOT security definer: that would rewrite current_user to the
-- function owner and the role check would always pass.
-- ---------------------------------------------------------------------------
create or replace function therapists_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    new.license_verified    := old.license_verified;
    new.license_verified_at := old.license_verified_at;
    new.license_verified_by := old.license_verified_by;
  end if;
  return new;
end;
$$;

drop trigger if exists therapists_guard_verification_trg on therapists;
create trigger therapists_guard_verification_trg
  before update on therapists
  for each row execute function therapists_guard_verification();

-- A new signup must never arrive pre-verified.
create or replace function therapists_guard_verification_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'service_role' then
    new.license_verified    := false;
    new.license_verified_at := null;
    new.license_verified_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists therapists_guard_verification_ins_trg on therapists;
create trigger therapists_guard_verification_ins_trg
  before insert on therapists
  for each row execute function therapists_guard_verification_insert();

-- ---------------------------------------------------------------------------
-- Admin helper. Service-role only, same as the Stripe functions in 0008.
-- Usage: select verify_therapist_license('them@example.com', 'TX-38291', 'kennady');
-- ---------------------------------------------------------------------------
create or replace function verify_therapist_license(
  p_email    text,
  p_license  text default null,
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

  update therapists
     set license_verified    = true,
         license_verified_at = now(),
         license_verified_by = p_verifier,
         license_number      = coalesce(p_license, license_number)
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_user_id);
end;
$$;

revoke all on function verify_therapist_license(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expose the real flag to clients.
-- DEPENDENCY ORDER (same trap as 0007): search_therapists() is declared
-- `returns setof therapists_public`, so the view cannot be dropped while it
-- exists (2BP01). Drop the function, replace the view, recreate the function.
-- ---------------------------------------------------------------------------
drop function if exists search_therapists(text, text, text, text, int);

drop view if exists therapists_public;
create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         search_doc,
         license_verified
  from therapists
  where published = true and accepting = true;

grant select on therapists_public to anon, authenticated;

create or replace function search_therapists(
  p_query  text,
  p_state  text default null,
  p_gender text default null,
  p_format text default null,
  p_limit  int  default 30
)
returns setof therapists_public
language sql
stable
set search_path = public
as $$
  select p.*
  from therapists_public p
  where (p_query is null or p_query = ''
         or p.search_doc @@ plainto_tsquery('english', p_query))
    and (p_state  is null or p.license_states @> array[p_state])
    and (p_gender is null or p.gender = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;
