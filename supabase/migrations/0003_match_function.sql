-- ============================================================================
-- 0003 — Server-side matching and search
--
-- WHY THIS EXISTS
-- Matching used to run in the browser over the whole roster. That works at six
-- therapists and collapses at thousands: you'd ship the entire supply side to
-- every phone (a competitive-asset leak as much as a performance problem) and
-- score it in JS on whatever device the client happens to own.
--
-- This moves scoring into Postgres and returns one scored page.
--
-- IT ALSO SOLVES A PRIVACY PROBLEM ELEGANTLY.
-- A therapist's ideal_client spec must never be readable by a client, but it
-- has to influence their ranking. Because match_therapists is SECURITY DEFINER
-- it can read that column while the caller cannot, and it returns only public
-- fields plus a score. The ideal spec shapes the ranking and never leaves the
-- database.
--
-- ORDER MATTERS: Postgres validates function bodies at creation time, so the
-- two scoring helpers are defined before the function that calls them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper 1 — 0..1 fit against a therapist's PRIVATE ideal-client spec.
-- Practical constraints gate it (a cash-pay-only therapist is not an "ideal
-- match" for someone relying on insurance, however well they fit otherwise).
-- Must-haves weigh double. Never a filter — the caller only ever adds this.
-- ---------------------------------------------------------------------------
create or replace function ideal_fit(
  ic jsonb,
  p_age text,
  p_gender text,
  p_field text,
  p_needs text[],
  p_modality text,
  p_has_insurance boolean
) returns numeric
language plpgsql
immutable
as $$
declare
  must     text[];
  payment  text;
  earned   numeric := 0;
  possible numeric := 0;
  w        numeric;
begin
  if ic is null or ic = '{}'::jsonb then
    return 0;
  end if;

  must    := coalesce(array(select jsonb_array_elements_text(coalesce(ic->'mustHaves', '[]'::jsonb))), '{}'::text[]);
  payment := coalesce(ic->>'payment', 'Either');

  -- practical constraint: the money has to work, or it isn't an ideal match
  if payment = 'Cash pay'  and p_has_insurance is true  then return 0; end if;
  if payment = 'Insurance' and p_has_insurance is false then return 0; end if;

  if jsonb_array_length(coalesce(ic->'ageBands', '[]'::jsonb)) > 0 then
    w := case when 'ageBands' = any(must) then 2 else 1 end;
    possible := possible + w;
    if p_age is not null and (ic->'ageBands') ? p_age then earned := earned + w; end if;
  end if;

  if jsonb_array_length(coalesce(ic->'genders', '[]'::jsonb)) > 0 then
    w := case when 'genders' = any(must) then 2 else 1 end;
    possible := possible + w;
    if p_gender is not null and (ic->'genders') ? p_gender then earned := earned + w; end if;
  end if;

  if jsonb_array_length(coalesce(ic->'fields', '[]'::jsonb)) > 0 then
    w := case when 'fields' = any(must) then 2 else 1 end;
    possible := possible + w;
    if p_field is not null and (ic->'fields') ? p_field then earned := earned + w; end if;
  end if;

  if jsonb_array_length(coalesce(ic->'needs', '[]'::jsonb)) > 0 then
    w := case when 'needs' = any(must) then 2 else 1 end;
    possible := possible + w;
    if exists (select 1 from unnest(coalesce(p_needs, '{}'::text[])) n where (ic->'needs') ? n) then
      earned := earned + w;
    end if;
  end if;

  if jsonb_array_length(coalesce(ic->'modalities', '[]'::jsonb)) > 0 then
    w := case when 'modalities' = any(must) then 2 else 1 end;
    possible := possible + w;
    if p_modality is not null and p_modality <> 'open' and (ic->'modalities') ? p_modality then
      earned := earned + w;
    end if;
  end if;

  if possible = 0 then return 0; end if;
  return earned / possible;
end;
$$;


-- ---------------------------------------------------------------------------
-- Helper 2 — 0..1 fit against what a returning client wants different this
-- time. Mirrors PREV_EXPERIENCE_SIGNALS in the app. Boost only.
-- ---------------------------------------------------------------------------
create or replace function prev_experience_fit(
  picks text[],
  t_style text,
  t_modalities text[],
  t_specialties text[]
) returns numeric
language plpgsql
immutable
as $$
declare
  p       text;
  hits    int := 0;
  counted int := 0;
  mods    text[] := coalesce(t_modalities, '{}'::text[]);
  specs   text[] := coalesce(t_specialties, '{}'::text[]);
begin
  if picks is null or cardinality(picks) = 0 then return 0; end if;

  foreach p in array picks loop
    if p in ('More direct feedback', 'Someone who challenges me') then
      counted := counted + 1;
      if t_style = 'direct' then hits := hits + 1; end if;

    elsif p = 'Someone gentler' then
      counted := counted + 1;
      if t_style = 'gentle' then hits := hits + 1; end if;

    elsif p = 'More structure and homework' then
      counted := counted + 1;
      if t_style = 'direct' or mods && array['CBT','DBT','ERP','ACT'] then hits := hits + 1; end if;

    elsif p = 'Less structure, more space to talk' then
      counted := counted + 1;
      if t_style = 'gentle' or mods && array['IFS','Psychodynamic','Person-Centered'] then hits := hits + 1; end if;

    elsif p = 'Better at handling trauma' then
      counted := counted + 1;
      if specs && array['Trauma','PTSD'] or mods && array['EMDR','Somatic','IFS'] then hits := hits + 1; end if;

    -- 'A different approach entirely', 'Nothing — it worked, I moved' and
    -- 'Someone who shares my identity' carry no directional signal here
    -- (identity is already scored by the preference block in match_therapists).
    end if;
  end loop;

  if counted = 0 then return 0; end if;
  return hits::numeric / counted;
end;
$$;


-- ---------------------------------------------------------------------------
-- The match query itself.
-- SECURITY DEFINER so it can read the private ideal_client column; it returns
-- only public fields plus the score, so nothing private escapes.
-- ---------------------------------------------------------------------------
create or replace function match_therapists(
  p_needs           text[]  default '{}',
  p_modality        text    default null,   -- null / 'open' = no preference
  p_style           text    default null,   -- 'gentle' | 'direct'
  p_gender          text    default null,
  p_ethnicity       text    default null,
  p_lgbtq           boolean default false,
  p_affinities      text[]  default '{}',
  p_faith           text[]  default '{}',
  p_language        text    default null,
  p_format          text    default null,   -- 'video' | 'in-person'
  p_insurance       text    default null,
  p_state           text    default null,   -- therapist must be licensed here
  -- about the client themselves — feeds the therapist's private ideal boost
  p_age_band        text    default null,
  p_self_gender     text    default null,
  p_field           text    default null,
  p_has_insurance   boolean default null,
  p_prev_experience text[]  default '{}',
  p_limit           int     default 20,
  p_offset          int     default 0
)
returns table (
  user_id uuid, name text, credentials text[], pronouns text, show_pronouns boolean,
  license_states text[], website text, photo text,
  traits text[], specialties text[], modalities text[], style text, practice_type text,
  gender text, lgbtq_affirming boolean, ethnicity text, affinities text[], faith text[],
  prompt_style text, prompt_fit text, prompt_first_session text, optional_prompts jsonb,
  best_for text, persona jsonb, media jsonb,
  formats text[], insurance text[], languages text[], rate_min int, location jsonb,
  match_score int,
  is_ideal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      t.*,
      -- core: overlap with what they need help with (worth 40)
      case when cardinality(p_needs) = 0 then 0 else 40 end as need_possible,
      case
        when cardinality(p_needs) = 0 then 0
        when t.specialties && p_needs then
          least(40, 24 + (cardinality(array(
            select unnest(t.specialties) intersect select unnest(p_needs)
          )) * 8))
        when t.practice_type = 'generalist' then 22
        else 0
      end as need_earned,

      -- each stated preference is worth 10
      (
        (case when coalesce(p_modality,'open') <> 'open' then 10 else 0 end) +
        (case when p_style     is not null then 10 else 0 end) +
        (case when p_gender    is not null then 10 else 0 end) +
        (case when p_ethnicity is not null then 10 else 0 end) +
        (case when p_lgbtq                 then 10 else 0 end) +
        (case when cardinality(p_affinities) > 0 then 10 else 0 end) +
        (case when cardinality(p_faith)      > 0 then 10 else 0 end) +
        (case when p_language  is not null then 10 else 0 end) +
        (case when p_format    is not null then 10 else 0 end) +
        (case when p_insurance is not null then 10 else 0 end)
      ) as pref_possible,
      (
        (case when coalesce(p_modality,'open') <> 'open' and t.modalities @> array[p_modality] then 10 else 0 end) +
        (case when p_style     is not null and t.style     = p_style     then 10 else 0 end) +
        (case when p_gender    is not null and t.gender    = p_gender    then 10 else 0 end) +
        (case when p_ethnicity is not null and t.ethnicity = p_ethnicity then 10 else 0 end) +
        (case when p_lgbtq and t.lgbtq_affirming then 10 else 0 end) +
        (case when cardinality(p_affinities) > 0 and t.affinities && p_affinities then 10 else 0 end) +
        (case when cardinality(p_faith)      > 0 and t.faith      && p_faith      then 10 else 0 end) +
        (case when p_language  is not null and t.languages @> array[p_language]  then 10 else 0 end) +
        (case when p_format    is not null and t.formats   @> array[p_format]    then 10 else 0 end) +
        (case when p_insurance is not null and t.insurance @> array[p_insurance] then 10 else 0 end)
      ) as pref_earned,

      -- boost 1: does this client match the therapist's PRIVATE ideal?
      ideal_fit(t.ideal_client, p_age_band, p_self_gender, p_field,
                p_needs, p_modality, p_has_insurance) as ideal_score,
      -- boost 2: what a returning client wants different this time
      prev_experience_fit(p_prev_experience, t.style, t.modalities, t.specialties) as prev_score
    from therapists t
    where t.published = true
      and t.accepting = true
      -- licensure is a legal constraint, not a preference, so it filters
      and (p_state is null or t.license_states @> array[p_state])
  )
  select
    s.user_id, s.name, s.credentials, s.pronouns, s.show_pronouns,
    s.license_states, s.website, s.photo,
    s.traits, s.specialties, s.modalities, s.style, s.practice_type,
    s.gender, s.lgbtq_affirming, s.ethnicity, s.affinities, s.faith,
    s.prompt_style, s.prompt_fit, s.prompt_first_session, s.optional_prompts,
    s.best_for, s.persona, s.media,
    s.formats, s.insurance, s.languages, s.rate_min, s.location,
    least(98,
      round(
        62 + (case when (s.need_possible + s.pref_possible) = 0 then 0
                   else (s.need_earned + s.pref_earned)::numeric
                        / (s.need_possible + s.pref_possible) end) * 36
        + s.ideal_score * 6
        + s.prev_score  * 5
      )
    )::int as match_score,
    (s.ideal_score >= 0.8) as is_ideal
  from scored s
  order by match_score desc, s.name asc
  limit  greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

grant execute on function match_therapists to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Keyword search — backs the client's search screen. Reads the public view
-- only, so it needs no elevated privileges and cannot reach ideal_client.
-- ---------------------------------------------------------------------------
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

grant execute on function search_therapists to anon, authenticated;
