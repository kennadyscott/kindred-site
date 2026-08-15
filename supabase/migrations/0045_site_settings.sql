-- ============================================================================
-- 0045 -- The website's own settings: one jsonb, starting with the template
--
-- Step 3 of the website build. The Website tab needs somewhere to store which
-- of the six templates a therapist chose; step 4 adds services, FAQ, hours,
-- booking link and about. One jsonb column covers all of it, so future
-- sections never need another migration -- the same reasoning as `blocks`
-- (0024) and `ideal_client`.
--
-- Shape (all optional; absent means default):
--   { "template": "warm" | "quiet" | "practice" | "editorial" | "evening" | "sunrise",
--     ...step-4 sections later }
--
-- PUBLIC BY DESIGN: `site` goes into therapists_public because the public
-- page reads the template from it. Nothing sensitive may ever be stored in
-- this column -- the tab writes it, and everything the tab writes is meant
-- for strangers. Private per-therapist state stays where it lives today.
--
-- Matching never reads `site`; a template choice cannot affect who finds whom.
--
-- ONE PASTE. No storage.objects DDL in here (that was 0044's trap); the view
-- recreate below is plain-postgres and safe as a single transaction --
-- including the 2BP01 dance, same as 0042/0043.
-- ============================================================================

alter table therapists
  add column if not exists site jsonb not null default '{}';

comment on column therapists.site is
  'Website settings: template choice now, website-only sections (services, FAQ, hours, booking, about) in step 4. PUBLIC -- exposed via therapists_public. Never store anything private here.';

-- ---------------------------------------------------------------------------
-- Expose it. search_therapists is `returns setof therapists_public`, so the
-- function goes first (2BP01), then the view, then both come back.
-- Identical to 0043's definitions plus the one `site` column.
-- ---------------------------------------------------------------------------
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
         payment_options,
         site                                    -- added in 0045
    from therapists
   where website_live = true
     and license_verified  = true
     and identity_verified = true
     and removed_at is null
     and not has_open_report(user_id)
     and listing_is_entitled(free_until, subscription_status)
     and profile_is_publishable(name, specialties, best_for, optional_prompts, blocks, persona, prompt_fit, photo);

comment on view therapists_public is
  'Everything a stranger may see about a therapist, and the source for the public web page. Excludes ideal_client (private) and license_number (0042). Gated on website_live rather than accepting (0043). site (0045) carries the template choice and, later, website-only sections. Every other condition must stay identical to match_therapists(), which additionally requires accepting = true.';

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
    and (p_gender is null or gender_bucket(p.gender) = p_gender)
    and (p_format is null or p.formats @> array[p_format])
  order by p.name
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function search_therapists to anon, authenticated;

-- Proof:
--   select site from therapists_public limit 1;                       -- runs (empty roster: 0 rows)
--   select column_name from information_schema.columns
--    where table_name='therapists' and column_name in ('site','website_live');  -- 2 rows
