-- ============================================================================
-- 0002 — Scale revisions
--
-- Fixes three things 0001 didn't account for, all of which get expensive once
-- there are thousands of therapists rather than six:
--   1. Licensure is multi-state. A growing practice is licensed in several.
--   2. Every filter column needs an index, and the text[] columns need GIN
--      so `specialties @> '{Trauma}'` is an index scan, not a table scan.
--   3. Keyword search needs a real full-text index, not a client-side scan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Licensure: one state -> many
-- ---------------------------------------------------------------------------
alter table therapists add column if not exists license_states text[] default '{}';

-- carry any existing single value over, then retire the old column
update therapists
   set license_states = array[license_state]
 where license_state is not null
   and (license_states is null or cardinality(license_states) = 0);

-- the 0001 view references license_state, so it must go first (it's recreated
-- with the new columns at the end of this migration)
drop view if exists therapists_public;

alter table therapists drop column if exists license_state;

-- ---------------------------------------------------------------------------
-- 2. Full-text search over the fields the search screen actually queries
--    (name, specialties, modalities, credentials, languages, and the
--    "who I work best with" line). Generated + stored so it can be indexed.
-- ---------------------------------------------------------------------------
alter table therapists add column if not exists search_doc tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(array_to_string(credentials, ' '), '') || ' ' ||
      coalesce(array_to_string(specialties, ' '), '') || ' ' ||
      coalesce(array_to_string(modalities,  ' '), '') || ' ' ||
      coalesce(array_to_string(languages,   ' '), '') || ' ' ||
      coalesce(best_for, '')
    )
  ) stored;

-- ---------------------------------------------------------------------------
-- 3. Indexes
--    The hot path is always "live therapists, filtered, then scored", so the
--    partial index on (published, accepting) keeps the working set small.
-- ---------------------------------------------------------------------------
create index if not exists therapists_live_idx
  on therapists (published, accepting)
  where published = true and accepting = true;

-- array containment (specialties @> / && ) — the core matching filters
create index if not exists therapists_specialties_gin on therapists using gin (specialties);
create index if not exists therapists_modalities_gin  on therapists using gin (modalities);
create index if not exists therapists_formats_gin     on therapists using gin (formats);
create index if not exists therapists_insurance_gin   on therapists using gin (insurance);
create index if not exists therapists_languages_gin   on therapists using gin (languages);
create index if not exists therapists_traits_gin      on therapists using gin (traits);
create index if not exists therapists_states_gin      on therapists using gin (license_states);

-- keyword search
create index if not exists therapists_search_gin on therapists using gin (search_doc);

-- straight equality filters
create index if not exists therapists_style_idx on therapists (style);

-- ---------------------------------------------------------------------------
-- 4. Public view — rebuilt for the new column, still excluding ideal_client.
--    Clients read this; they can never select the private ideal spec.
-- ---------------------------------------------------------------------------
drop view if exists therapists_public;
create view therapists_public as
  select user_id, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at
  from therapists
  where published = true and accepting = true;

grant select on therapists_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Columns the matching logic uses that 0001 missed.
--    These exist on the therapist objects in the app but had nowhere to land,
--    which would have silently broken scoring the moment we moved it here.
-- ---------------------------------------------------------------------------
alter table therapists add column if not exists gender          text;          -- therapist's own gender
alter table therapists add column if not exists lgbtq_affirming boolean default false;
alter table therapists add column if not exists ethnicity       text;
alter table therapists add column if not exists affinities      text[] default '{}';
alter table therapists add column if not exists faith           text[] default '{}';
alter table therapists add column if not exists practice_type   text default 'specialist'; -- specialist | generalist

create index if not exists therapists_gender_idx     on therapists (gender);
create index if not exists therapists_ethnicity_idx  on therapists (ethnicity);
create index if not exists therapists_affinities_gin on therapists using gin (affinities);
create index if not exists therapists_faith_gin      on therapists using gin (faith);

-- the public view needs them too (still no ideal_client)
drop view if exists therapists_public;
create view therapists_public as
  select user_id, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         -- safe to expose: derived purely from the public fields above, and
         -- search_therapists() needs it to run a real full-text query
         search_doc
  from therapists
  where published = true and accepting = true;

grant select on therapists_public to anon, authenticated;
