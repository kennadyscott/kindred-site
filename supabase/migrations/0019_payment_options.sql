-- ============================================================================
-- 0019 -- How a therapist takes payment
--
-- Insurance carriers were the only thing captured, plus a free-text
-- selfPayNote. That misses the things clients most often need to know before
-- they reach out: whether you take insurance at all, whether you provide a
-- superbill they can claim back, whether it's cash-pay only, and whether HSA
-- or FSA cards work.
--
-- A fixed list rather than free text -- same reasoning as languages and
-- specialties. A typo here would silently fail to match a client filtering on
-- it, and "superbill" has about six spellings in the wild.
-- ============================================================================

alter table therapists add column if not exists payment_options text[] default '{}';

comment on column therapists.payment_options is
  'Fixed vocabulary: no_insurance | superbills | cash_only | hsa_fsa | sliding_scale';

-- Expose it to clients. Same drop/recreate dance as every other view change:
-- search_therapists is `returns setof therapists_public`, so the view cannot be
-- dropped while it exists (2BP01).
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
