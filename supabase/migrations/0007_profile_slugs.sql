-- ============================================================================
-- 0007 — Shareable profile slugs
--
-- WHY THIS EXISTS
-- Therapists market themselves ("check out my profile on Kindred"), and that
-- link is the cheapest growth channel we have. A raw uuid makes a terrible
-- marketing URL:
--     kindredtherapymatch.com/profile.html?id=c16811ea-37c4-499c-9d27-fbd9a561
-- A slug makes it shareable:
--     kindredtherapymatch.com/profile.html?t=maya-chen
--
-- The slug is derived from the therapist's display name, deduped with a short
-- suffix when two people collide.
-- ============================================================================

alter table therapists add column if not exists slug text;

-- lowercase, strip accents/punctuation, collapse spaces to hyphens
create or replace function kindred_slugify(txt text) returns text
language sql immutable as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(unaccent_safe(coalesce(txt, ''))), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  )
$$;

-- unaccent isn't guaranteed installed; this keeps the function self-contained
create or replace function unaccent_safe(txt text) returns text
language sql immutable as $$
  select translate(
    coalesce(txt, ''),
    'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
    'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC'
  )
$$;

-- Backfill existing rows, deduping collisions with a short id suffix.
update therapists t
   set slug = case
     when exists (
       select 1 from therapists x
        where x.user_id <> t.user_id
          and kindred_slugify(x.name) = kindred_slugify(t.name)
     )
     then kindred_slugify(t.name) || '-' || left(replace(t.user_id::text, '-', ''), 4)
     else kindred_slugify(t.name)
   end
 where slug is null and name is not null;

create unique index if not exists therapists_slug_key on therapists (slug) where slug is not null;

-- Keep the slug fresh for new rows / name changes, without ever stealing a slug
-- that already belongs to someone else.
create or replace function set_therapist_slug() returns trigger
language plpgsql as $$
declare
  base text;
  candidate text;
begin
  if new.name is null or new.name = '' then
    return new;
  end if;
  -- only (re)generate when the slug is unset or the name actually changed
  if new.slug is not null and (tg_op = 'INSERT' or new.name is not distinct from old.name) then
    return new;
  end if;
  base := kindred_slugify(new.name);
  candidate := base;
  if exists (select 1 from therapists where slug = candidate and user_id <> new.user_id) then
    candidate := base || '-' || left(replace(new.user_id::text, '-', ''), 4);
  end if;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists therapists_slug on therapists;
create trigger therapists_slug before insert or update of name on therapists
  for each row execute function set_therapist_slug();

-- Expose the slug to the public view so the shared profile page can look it up.
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
         search_doc
  from therapists
  where published = true and accepting = true;

grant select on therapists_public to anon, authenticated;
