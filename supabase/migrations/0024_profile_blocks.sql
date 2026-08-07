-- ============================================================================
-- 0024 -- The get-to-know feed, saved
--
-- A therapist arranges their profile feed by dragging blocks -- prompts,
-- photos and a video -- into the order they want. That arrangement lived in
-- `t.blocks` in memory and was NEVER written anywhere: therapistToDbRow sent
-- media and optional_prompts and nothing else. Adding a photo pushed it onto
-- an in-memory array, so it survived exactly as long as the tab did.
--
-- Found because Kindred's first live therapist had two photos on her profile
-- in the afternoon and none in the database that evening. She did not remove
-- them; they were never saved.
--
-- Storing the blocks rather than just a photo list on purpose: order is the
-- point. "Photo, blurb, photo, blurb" is a decision the therapist made about
-- how they are read, and a bare array of photos throws it away.
-- ============================================================================

alter table therapists add column if not exists blocks jsonb not null default '[]'::jsonb;

comment on column therapists.blocks is
  'Ordered get-to-know feed: [{type:"prompt",question,answer} | {type:"photo",src} | {type:"video",src}]. Empty means "derive the default arrangement from prompts + media.photos", which is what every profile created before this did.';

-- Expose it to clients: it IS the profile feed they read.
-- Same drop/recreate dance as every other view change -- search_therapists is
-- `returns setof therapists_public`, so the view cannot be dropped while it
-- exists (2BP01).
drop function if exists search_therapists(text, text, text, text, int);
drop view if exists therapists_public;

create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, license_number, website, photo,
         traits, specialties, modalities, style, practice_type,
         gender, lgbtq_affirming, ethnicity, affinities, faith,
         prompt_style, prompt_fit, prompt_first_session, optional_prompts,
         best_for, persona, media, blocks,
         formats, insurance, languages, rate_min, location,
         accepting, published, created_at, updated_at,
         search_doc,
         license_verified, identity_verified,
         payment_options
  from therapists
  where published = true
    and accepting = true
    and license_verified  = true
    and identity_verified = true
    and name is not null and btrim(name) <> '';

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
