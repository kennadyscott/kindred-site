-- ============================================================================
-- 0042 -- The public view was still showing reported therapists
--
-- 0040 hides a reported profile from match_therapists(). It did not touch
-- therapists_public, which was last rebuilt in 0029 -- before reports existed.
--
-- So a therapist reported for nudity vanished from matching and stayed fully
-- readable at kindredtherapymatch.com/profile.html?t=their-slug, and would
-- have appeared in the browse directory the moment it shipped. Two gates for
-- one question, and only one of them knew about the third answer.
--
-- The two lists of conditions have now drifted apart twice. They are written
-- adjacently below and both end with the same five predicates in the same
-- order; if you add a sixth, it goes in both.
--
-- ALSO REMOVES license_number FROM THE PUBLIC VIEW.
-- Anyone with the anon key could read it. It is public record on a state
-- board, so this is not a leak in the strict sense -- but "findable if you go
-- looking on a licensing site" and "attached to a name, photo and city in a
-- browsable database" are different exposures, and the second one is the one
-- we would be creating.
--
-- Nothing is lost. profile.js only ever used it as a presence test to decide
-- whether to draw a "verified" badge, and never displayed the number. The
-- badge now keys off license_verified, which is the fact it was claiming
-- anyway and is still on the view.
--
-- DEPENDENCY ORDER (the 2BP01 trap, same as 0007/0009/0019/0024/0027/0028/0029):
-- search_therapists() is declared `returns setof therapists_public`, so the
-- view cannot be dropped while it exists. Drop the function, drop the view,
-- rebuild both.
-- ============================================================================

drop function if exists search_therapists(text, text, text, text, int);
drop view     if exists therapists_public;

create view therapists_public as
  select user_id, slug, name, credentials, pronouns, show_pronouns,
         license_states, website, photo,
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
   where accepting = true
     and license_verified  = true
     and identity_verified = true
     and removed_at is null
     and not has_open_report(user_id)          -- added in 0042; mirrors 0040
     and listing_is_entitled(free_until, subscription_status)
     and profile_is_publishable(name, specialties, best_for, optional_prompts, blocks, persona, prompt_fit, photo);

comment on view therapists_public is
  'Everything a stranger may see about a therapist. Deliberately excludes ideal_client (private by design) and license_number (0042). Its WHERE clause must stay identical to the one in match_therapists() -- they have drifted twice.';

grant select on therapists_public to anon, authenticated;

-- Unchanged from 0029; recreated only because the view had to be dropped.
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
    and (p_gender is null or gender_bucket(p.gender) = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function search_therapists to anon, authenticated;

-- Proof:
--   select license_number from therapists_public;   -- 42703, column is gone
--   -- with an open report against a live therapist, they leave BOTH:
--   select count(*) from therapists_public;
--   select count(*) from match_therapists();
