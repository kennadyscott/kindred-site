-- ============================================================================
-- 0049 -- The two notification webhooks, as SQL
--
-- The dashboard calls these "Database Webhooks" and has moved the page around
-- (Integrations > Database Webhooks at time of writing). They are not a
-- separate feature: a webhook IS an AFTER INSERT trigger that makes an HTTP
-- call. Creating them here means the definition lives in the repo with
-- everything else, rather than as clicks nobody can review or diff.
--
-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN: replace REPLACE_WITH_NOTIFY_SECRET in BOTH functions below
-- with the value of NOTIFY_SECRET from Project Settings > Edge Functions >
-- Secrets. It must match exactly or the functions answer 403 and no mail
-- sends.
--
-- The secret ends up stored in the function body, readable by anyone who can
-- read your schema. That is the same trust level as the service role, so it
-- changes nothing about who can send mail -- but it does mean rotating
-- NOTIFY_SECRET means re-running this file.
-- ---------------------------------------------------------------------------
--
-- pg_net is asynchronous: net.http_post() queues the request and returns
-- immediately. A slow or failing Edge Function therefore cannot slow down or
-- roll back the insert that triggered it, which matters most for
-- client_inquiries -- a visitor pressing Send must never wait on an email, or
-- lose their message because one failed.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- A new therapist finished their first profile save (which is the INSERT).
-- ---------------------------------------------------------------------------
create or replace function notify_new_therapist()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://izukppxgoerqtustfbnk.functions.supabase.co/notify-signup',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-kindred-secret', 'REPLACE_WITH_NOTIFY_SECRET'
               )
  );
  return new;
end;
$$;

comment on function notify_new_therapist() is
  'Fires notify-signup on a new therapist row. Sends an EMPTY body on purpose: the Edge Function is content-free and must not be handed a row it might start quoting.';

drop trigger if exists therapists_notify_signup on therapists;
create trigger therapists_notify_signup
  after insert on therapists
  for each row execute function notify_new_therapist();

-- ---------------------------------------------------------------------------
-- A client sent an inquiry. This is the one that carries the first-client
-- tripwire, so it is also the one that must not be missed.
-- ---------------------------------------------------------------------------
create or replace function notify_new_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://izukppxgoerqtustfbnk.functions.supabase.co/notify-inquiry',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-kindred-secret', 'REPLACE_WITH_NOTIFY_SECRET'
               )
  );
  return new;
end;
$$;

comment on function notify_new_inquiry() is
  'Fires notify-inquiry on a new client inquiry. The body is EMPTY and that is the whole point: the row is PHI (an email plus why someone is seeking therapy) and Resend has no BAA, so the row must never leave the database. The function counts rows itself for the tripwire.';

drop trigger if exists client_inquiries_notify on client_inquiries;
create trigger client_inquiries_notify
  after insert on client_inquiries
  for each row execute function notify_new_inquiry();

-- Proof (run separately):
--   select tgname from pg_trigger
--    where tgname in ('therapists_notify_signup','client_inquiries_notify');   -- 2 rows
--   select id, status_code, created from net._http_response order by id desc limit 5;
--     -- every delivery, with what the Edge Function answered. 200 = sent.
--     -- 403 = the secret does not match. 401 = Verify JWT is still on.
