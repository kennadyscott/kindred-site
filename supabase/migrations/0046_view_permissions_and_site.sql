-- ============================================================================
-- 0046 -- has_open_report() must be SECURITY DEFINER; then 0045's content
--
-- SUPERSEDES 0045 (which rolled back — run this INSTEAD, one paste).
--
-- THE BUG. has_open_report() (0040) reads profile_reports, a table anon is
-- deliberately forbidden to read. It was written as a plain `language sql`
-- function — and a plain function inside a view runs with the CALLER's
-- privileges (Postgres inlines it straight into the view's query). So any
-- anon read of therapists_public dies with:
--
--     42501: permission denied for table profile_reports
--
-- which breaks the public website page and search_therapists in production.
-- match_therapists() kept working only because it is itself security definer,
-- which shielded the call. This is also what aborted the 0045 paste.
--
-- THE FIX. security definer on has_open_report: it runs as its owner, who may
-- read profile_reports, and definer functions are never inlined. What it
-- exposes is one boolean per uuid — "is this therapist under review" — which
-- is already public information via their absence from the roster.
-- ============================================================================

create or replace function has_open_report(p_therapist uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profile_reports
     where therapist_id = p_therapist
       and resolved_at is null
  );
$$;

comment on function has_open_report(uuid) is
  'True while the therapist has an unresolved report. SECURITY DEFINER on purpose (0046): callers must not need profile_reports privileges, and plain sql functions are inlined into views with caller privileges — which broke every anon read of therapists_public.';

grant execute on function has_open_report(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- 0045's content, unchanged: `site` jsonb + expose it on the public view.
-- ============================================================================

alter table therapists
  add column if not exists site jsonb not null default '{}';

comment on column therapists.site is
  'Website settings: template choice now, website-only sections (services, FAQ, hours, booking, about) in step 4. PUBLIC -- exposed via therapists_public. Never store anything private here.';

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
         site
    from therapists
   where website_live = true
     and license_verified  = true
     and identity_verified = true
     and removed_at is null
     and not has_open_report(user_id)
     and listing_is_entitled(free_until, subscription_status)
     and profile_is_publishable(name, specialties, best_for, optional_prompts, blocks, persona, prompt_fit, photo);

comment on view therapists_public is
  'Everything a stranger may see about a therapist, and the source for the public web page. Excludes ideal_client (private) and license_number (0042). Gated on website_live rather than accepting (0043). site (0045/0046) carries the template choice. Every other condition must stay identical to match_therapists(), which additionally requires accepting = true.';

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

-- Proof (run separately, never appended to the migration):
--   select site from therapists_public limit 1;          -- runs, 0 rows
--   select column_name from information_schema.columns
--    where table_name='therapists' and column_name='site';  -- 1 row
