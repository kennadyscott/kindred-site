-- ============================================================================
-- 0043 -- A full practice should not take the therapist's website down
--
-- One flag was answering two different questions.
--
-- `accepting` is the "Accepting ongoing clients" toggle. It belongs in
-- match_therapists(): a therapist with no room should not be matched to new
-- clients. But therapists_public ALSO required it, and therapists_public is
-- what serves kindredtherapymatch.com/profile.html -- the page a therapist
-- shares as their website.
--
-- So turning off "accepting new clients" deleted their website. For a
-- directory listing that is correct behaviour. For something a therapist is
-- meant to use instead of Squarespace it is unusable: being full is the most
-- ordinary thing in a practice, and it is exactly when referrals, existing
-- clients and the waitlist matter most.
--
--   accepting     -> should I be matched with new clients?     (matching)
--   website_live  -> should my page exist on the internet?     (website)
--
-- Defaults to true so every existing therapist keeps a page.
--
-- VERIFICATION IS UNCHANGED, deliberately (user's call, 2026-08-10): the
-- website still requires license_verified, identity_verified, a publishable
-- profile, no open report and an entitled listing. The bar is what makes a
-- Kindred page mean something to a client, so nothing here lowers it. This
-- separates "am I taking clients" from "does my page exist", and nothing else.
--
-- therapists_public now RETURNS non-accepting therapists, which is the point.
-- `accepting` is already in its select list, so profile.js can say plainly
-- that someone is not taking new clients rather than 404ing. search_therapists
-- inherits that too, which is right: looking someone up by name should find
-- them whether or not they have room this month.
--
-- match_therapists() is untouched and still requires accepting = true.
--
-- DEPENDENCY ORDER (2BP01, as in 0007/0009/0019/0024/0027/0028/0029/0042):
-- search_therapists is `returns setof therapists_public`, so the function goes
-- first, then the view.
-- ============================================================================

alter table therapists
  add column if not exists website_live boolean not null default true;

comment on column therapists.website_live is
  'Does this therapist have a public web page? Separate from `accepting`, which only governs matching -- being full must not take a therapist''s website down. Verification is still required on top of this; see therapists_public.';

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
   where website_live = true                  -- 0043: was `accepting = true`
     and license_verified  = true
     and identity_verified = true
     and removed_at is null
     and not has_open_report(user_id)
     and listing_is_entitled(free_until, subscription_status)
     and profile_is_publishable(name, specialties, best_for, optional_prompts, blocks, persona, prompt_fit, photo);

comment on view therapists_public is
  'Everything a stranger may see about a therapist, and the source for the public web page. Excludes ideal_client (private) and license_number (0042). Gated on website_live rather than accepting (0043) -- a full practice keeps its page. Every other condition must stay identical to match_therapists(), which additionally requires accepting = true.';

grant select on therapists_public to anon, authenticated;

-- Unchanged; recreated because the view had to be dropped.
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

-- ---------------------------------------------------------------------------
-- NOTE FOR WHOEVER READS THE ROSTER COUNT
-- refreshRosterCount() counts therapists_public to tell a client how many
-- therapists are on Kindred. That count now includes therapists who are not
-- taking new clients. That is more truthful as "therapists on Kindred" and
-- less truthful as "therapists available to you". If it is ever used as the
-- latter, count match_therapists() instead.
-- ---------------------------------------------------------------------------

-- Proof:
--   update therapists set accepting = false where user_id = '<uid>';
--   select count(*) from therapists_public where user_id = '<uid>';  -- 1, page stays up
--   select count(*) from match_therapists();                          -- they are gone
--   update therapists set website_live = false where user_id = '<uid>';
--   select count(*) from therapists_public where user_id = '<uid>';  -- 0, page is down
