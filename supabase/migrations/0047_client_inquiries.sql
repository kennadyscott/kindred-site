-- ============================================================================
-- 0047 -- Client inquiries: the email-only front door
--
-- A visitor lands on a therapist's website from an Instagram bio and wants to
-- ask one question. Today the Contact button drops them into an eight-step
-- intake, which is where they leave. This is the short path: email, a line or
-- two, send -- and the full client profile happens later, if they ever want
-- matching at all.
--
-- ---------------------------------------------------------------------------
-- THIS TABLE HOLDS PHI. An email address next to a therapist's id says "this
-- person sought mental health treatment from this provider". That is
-- individually identifiable health information, and it is the first client
-- data Kindred has ever stored.
--
-- It is therefore INERT until the BAA is signed. The app writes here only
-- through clientStore, which returns early while clientDataPersistence is
-- false in app/config.json. Creating the table does not start collection;
-- flipping that flag does. Do not flip it before the BAA is countersigned.
-- ---------------------------------------------------------------------------
--
-- WRITES GO THROUGH A FUNCTION, NOT A POLICY. anon has no insert policy at
-- all. submit_inquiry() is the only way in, so validation, the burst guard and
-- the "is this therapist actually listed" check cannot be bypassed by posting
-- straight at PostgREST -- which anyone can do, since the anon key is public.
--
-- ONE PASTE. No storage.objects DDL (that was 0044's trap).
-- ============================================================================

create table if not exists client_inquiries (
  id           uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references therapists(user_id) on delete cascade,
  /* Null until the person signs in. They can send before they have an
     account -- that is the entire point -- and claim it afterwards. */
  client_id    uuid references auth.users(id) on delete set null,
  email        text not null,
  message      text not null default '',
  source       text not null default 'website',
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  replied_at   timestamptz,
  archived_at  timestamptz
);

comment on table client_inquiries is
  'Email-only inquiries from a therapist''s public page. CONTAINS PHI: an email beside a therapist id is identifiable health information. Written only via submit_inquiry(); the app gates every write behind clientDataPersistence until the BAA is signed.';

create index if not exists client_inquiries_therapist_idx
  on client_inquiries (therapist_id, created_at desc);
create index if not exists client_inquiries_client_idx
  on client_inquiries (client_id) where client_id is not null;
create index if not exists client_inquiries_email_idx
  on client_inquiries (lower(email), created_at desc);

alter table client_inquiries enable row level security;

-- ---------------------------------------------------------------------------
-- Read: the therapist it was sent to, and the client who sent it. Nobody else,
-- and there is deliberately no policy for anon.
-- ---------------------------------------------------------------------------
drop policy if exists "therapist reads own inquiries" on client_inquiries;
create policy "therapist reads own inquiries" on client_inquiries
  for select to authenticated
  using (therapist_id = auth.uid());

drop policy if exists "client reads own inquiries" on client_inquiries;
create policy "client reads own inquiries" on client_inquiries
  for select to authenticated
  using (client_id is not null and client_id = auth.uid());

-- No insert, update or delete policy anywhere on purpose. Everything below is
-- security definer, which is what makes the validation unavoidable.

-- ---------------------------------------------------------------------------
-- submit_inquiry -- the only way a row is created.
-- ---------------------------------------------------------------------------
create or replace function submit_inquiry(
  p_therapist uuid,
  p_email     text,
  p_message   text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_id      uuid;
begin
  /* Shape only. Deliverability is proven by the sign-in link, not by a
     regex -- a stricter pattern here just rejects real addresses. */
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if length(v_message) > 2000 then
    raise exception 'message too long' using errcode = '22023';
  end if;

  /* The therapist must be someone a stranger can actually see. Without this,
     the public anon key would let anyone probe for therapists who are
     unverified, paused, reported or removed -- and get a different error for
     a real id than a fake one, which is an enumeration oracle. */
  if not exists (select 1 from therapists_public where user_id = p_therapist) then
    raise exception 'therapist not available' using errcode = '22023';
  end if;

  /* Burst guard, same shape as 0040's. Two ceilings, because they stop
     different things: one address spraying every therapist, and one therapist
     being buried by a script. Deliberately generous -- a real person sending
     twice because the first felt clumsy must never be blocked. */
  if (select count(*) from client_inquiries
       where lower(email) = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many inquiries from this address, try again later' using errcode = '22023';
  end if;
  if (select count(*) from client_inquiries
       where therapist_id = p_therapist and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many inquiries right now, try again later' using errcode = '22023';
  end if;

  insert into client_inquiries (therapist_id, client_id, email, message)
  values (p_therapist, auth.uid(), v_email, v_message)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function submit_inquiry(uuid, text, text) is
  'Creates a client inquiry. SECURITY DEFINER because anon has no insert policy: this is the only path in, so validation, the burst guard and the listed-therapist check cannot be bypassed by posting directly at PostgREST with the public anon key.';

grant execute on function submit_inquiry(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- claim_my_inquiries -- attach anything sent before they had an account.
-- ---------------------------------------------------------------------------
create or replace function claim_my_inquiries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_count integer;
begin
  if auth.uid() is null or v_email = '' then
    return 0;
  end if;
  /* Only rows with no owner yet, and only ones matching the address they just
     proved they control by signing in. */
  update client_inquiries
     set client_id = auth.uid()
   where client_id is null
     and lower(email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function claim_my_inquiries() is
  'Links inquiries sent before sign-up to the account that just proved it owns that address. Only touches unowned rows.';

grant execute on function claim_my_inquiries() to authenticated;

-- ---------------------------------------------------------------------------
-- mark_inquiry -- the therapist's own housekeeping.
-- An update POLICY would let them rewrite the message and the email too; a
-- function limits them to the four state columns that are theirs to change.
-- ---------------------------------------------------------------------------
create or replace function mark_inquiry(p_id uuid, p_state text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_state not in ('read', 'replied', 'archived', 'unarchived') then
    raise exception 'unknown state' using errcode = '22023';
  end if;

  update client_inquiries
     set read_at     = case when p_state in ('read','replied') then coalesce(read_at, now()) else read_at end,
         replied_at  = case when p_state = 'replied'    then coalesce(replied_at, now())     else replied_at end,
         archived_at = case when p_state = 'archived'   then now()
                            when p_state = 'unarchived' then null
                            else archived_at end
   where id = p_id
     and therapist_id = auth.uid();

  get diagnostics v_ok = row_count;
  return v_ok;
end;
$$;

grant execute on function mark_inquiry(uuid, text) to authenticated;

-- Proof (run separately, never appended to the migration):
--   select count(*) from client_inquiries;                  -- 0
--   select submit_inquiry('00000000-0000-0000-0000-000000000000','a@b.co','hi');
--                                                           -- errors: therapist not available
