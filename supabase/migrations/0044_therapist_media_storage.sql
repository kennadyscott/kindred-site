-- ============================================================================
-- 0044 -- Photos move out of Postgres into Storage
--
-- !!! RUN AS TWO SEPARATE PASTES. On hosted Supabase the SQL-editor role
-- often does not own storage.objects, so the CREATE POLICY block below can
-- fail with "must be owner of table objects" -- and because the editor runs
-- one paste as ONE transaction, that failure silently rolls back the bucket
-- too. That is exactly what happened on the first attempt (2026-08-10:
-- "I ran 0044" / bucket still 404). Paste PART 1 alone, then PART 2; if
-- PART 2 errors on ownership, create the same four policies in
-- Dashboard -> Storage -> therapist-media -> Policies instead.
--
-- Photos are base64 data URLs in text columns today. Measured cost: 47KB-843KB
-- per image, ~1.25MB per finished profile -- inside every select *, every
-- match_therapists() row, every autosave (the signup autosave re-sent the
-- full base64 photo on a 600ms debounce), and every future prerendered page.
-- On the Free plan it is also a ~400-therapist ceiling against the 500MB
-- database cap. The prerendered-website plan (step 5) is not viable at all
-- with megabyte inline images, and og:image can never work with a data URL.
--
-- One bucket, public read, per-therapist folders:
--
--     therapist-media/{auth.uid()}/{random}.jpg
--
-- PUBLIC READ IS A DECISION, taken with the user 2026-08-10: these are
-- publicly published profile photos -- the entire point is strangers seeing
-- them -- and signed URLs would expire inside cached pages and shared links.
-- The consent text at the upload control covers exactly this use.
--
-- WRITES are folder-scoped: you may only create, replace or delete objects
-- whose first path segment is your own auth.uid(). Same shape as
-- delete_my_therapist_account() -- there is no parameter to point at anyone
-- else.
--
-- THERAPIST DATA ONLY. Nothing client-side may ever upload here (clients
-- upload nothing anywhere -- audited 2026-08-10); if that ever changes it is
-- a new bucket with a BAA conversation attached, not a policy edit here.
-- ============================================================================

-- ========================= PART 1: bucket + function =========================
insert into storage.buckets (id, name, public)
values ('therapist-media', 'therapist-media', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- Deletion keeps its promise. delete_my_therapist_account() removed the row,
-- and until now the photos went with it because they WERE the row. Once they
-- live in Storage that stops being automatic -- a deleted therapist's photos
-- would stay publicly readable at guessable-ish URLs, which contradicts both
-- the privacy page and the consent text ("you can remove it at any time").
--
-- The app deletes the objects through the Storage API first (that removes the
-- physical files); this row-delete is the in-transaction backstop for the
-- case where the API call failed or never ran. Removing the storage.objects
-- row makes the object unreachable immediately; Supabase's own lifecycle
-- handles orphaned physical files. Identical to 0036 plus the one delete.
-- ---------------------------------------------------------------------------
create or replace function delete_my_therapist_account()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   int  := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into deleted_therapists (user_id, stripe_customer_id, stripe_subscription_id, subscription_status)
  select t.user_id, t.stripe_customer_id, t.stripe_subscription_id, t.subscription_status
    from therapists t
   where t.user_id = uid
  on conflict (user_id) do update
     set stripe_customer_id     = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         subscription_status    = excluded.subscription_status,
         deleted_at             = now();

  -- 0044: their photos go with the account. Backstop for the API-side delete.
  -- Wrapped: if this definer lacks storage.objects privileges on this
  -- project, losing the backstop must not fail the account deletion itself
  -- (the client already deleted the objects through the Storage API).
  begin
    delete from storage.objects
     where bucket_id = 'therapist-media'
       and (storage.foldername(name))[1] = uid::text;
  exception when others then
    null;
  end;

  delete from therapists where user_id = uid;   -- licences cascade
  get diagnostics n = row_count;

  -- Returned so the caller can tell a real deletion from a no-op. The app only
  -- claims success on >= 1; otherwise it says so instead of logging the person
  -- out on a lie, which is the whole bug 0036 exists to fix.
  return n;
end;
$$;

revoke all     on function delete_my_therapist_account() from public, anon;
grant  execute on function delete_my_therapist_account() to authenticated;

-- ========================= PART 2: policies ==================================
-- If this paste errors with "must be owner of table objects", use the
-- Dashboard instead -- expressions are identical to the ones below.
-- storage.objects already has RLS enabled by Supabase; these are additive.
drop policy if exists "therapist media public read"  on storage.objects;
create policy "therapist media public read" on storage.objects
  for select to public
  using (bucket_id = 'therapist-media');

drop policy if exists "therapist media own insert" on storage.objects;
create policy "therapist media own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'therapist-media'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "therapist media own update" on storage.objects;
create policy "therapist media own update" on storage.objects
  for update to authenticated
  using     (bucket_id = 'therapist-media'
             and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'therapist-media'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "therapist media own delete" on storage.objects;
create policy "therapist media own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'therapist-media'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Proof (SQL editor):
--   select id, public from storage.buckets where id = 'therapist-media';   -- 1 row, public=t
--   select policyname from pg_policies
--    where tablename = 'objects' and policyname like 'therapist media%';   -- 4 rows
