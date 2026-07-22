-- ============================================================================
-- Kindred — shared therapist profiles
-- One canonical table that BOTH the marketing website (kindredtherapymatch.com)
-- and the matching app (app.kindredtherapymatch.com) read and write, so a
-- therapist has ONE profile, wherever they edit it.
--
-- Ownership model: Supabase Auth. Each therapist signs in; their profile row is
-- keyed to auth.uid(), and RLS guarantees they can only edit their own. Clients
-- (anonymous) can read profiles that are published + accepting.
--
-- Run this once in the Supabase SQL editor for the project both apps point at.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists therapists (
  user_id      uuid primary key references auth.users on delete cascade,

  -- identity / header (website collects these in the "About" step)
  name         text,
  credentials  text[]  default '{}',   -- e.g. {LMFT} or {PhD,"Clinical Psychologist"}
  pronouns     text,
  show_pronouns boolean default true,
  license_state  text,                 -- website "Licensed in" (e.g. CA)
  license_number text,
  website        text,
  photo          text,                 -- profile photo URL (app supports upload)

  -- how they work (website "Voice" step; app's prompts)
  traits         text[] default '{}',  -- warm / direct / collaborative …
  specialties    text[] default '{}',
  modalities     text[] default '{}',  -- CBT / ACT / EMDR …
  style          text,                 -- direct / gentle …
  prompt_style          text,          -- "My therapy style is…"
  prompt_fit            text,          -- "You may be a fit if…"
  prompt_first_session  text,          -- "First sessions feel like…"
  optional_prompts jsonb default '[]', -- app's extra prompt cards [{question,answer,photo}]
  best_for       text,
  persona        jsonb default '{}',   -- {inOffice, outOfOffice}
  media          jsonb default '{}',   -- {video, office, outOfOffice}

  -- logistics (website "Logistics" step)
  formats        text[] default '{}',  -- online / in-person
  insurance      text[] default '{}',
  languages      text[] default '{"English"}',
  rate_min       int,
  location       jsonb default '{}',   -- {city, state}

  -- status
  accepting      boolean default true, -- accepting new clients
  published      boolean default false,-- visible in the app's match pool

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists therapists_updated_at on therapists;
create trigger therapists_updated_at before update on therapists
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table therapists enable row level security;

-- Clients (anon) and signed-in users may READ profiles that are live.
create policy "read published profiles"
  on therapists for select
  using (published = true and accepting = true);

-- A therapist may read their OWN row even when unpublished (to keep editing it).
create policy "read own profile"
  on therapists for select to authenticated
  using (user_id = auth.uid());

-- A therapist may create their own row (one per account).
create policy "insert own profile"
  on therapists for insert to authenticated
  with check (user_id = auth.uid());

-- A therapist may update only their own row.
create policy "update own profile"
  on therapists for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- NOTE: no delete policy — deletion is admin-only via the service role.
