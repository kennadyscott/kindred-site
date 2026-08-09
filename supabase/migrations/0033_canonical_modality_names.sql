-- ============================================================================
-- 0033 -- One name per therapy. CBT and EFT had two.
--
-- THE BUG
-- Therapists and clients were picking from different vocabularies for the
-- same modality:
--
--     therapist picks              client picks
--     ---------------              ------------------------
--     'CBT'                        'Cognitive Behavioral (CBT)'
--     'EFT'                        'Emotionally Focused'
--
-- match_therapists() compares them with `t.modalities @> array[p_modality]`,
-- an exact string test. So a therapist who ticked 'CBT' matched NOBODY who
-- asked for CBT. CBT is the single most requested modality in the catalog,
-- which makes it the worst possible one to lose.
--
-- Worse, the therapist-side picker is the union of modality_core +
-- modality_quick + modality_more, so a therapist saw BOTH 'CBT' and
-- 'Cognitive Behavioral (CBT)' as two separate checkboxes in one dropdown.
-- Which of the two they happened to tick silently decided whether they were
-- findable at all. Nothing errored, nothing logged, and no filter was
-- involved -- exactly the shape of the 'balanced' style bug in 0030.
--
-- Only these two are affected. I compared every therapist-reachable string
-- against every client-reachable one across all 68 options; 'CBT' and 'EFT'
-- are the only two a client can never ask for.
--
-- THE FIX
-- Canonicalise on the long form -- 'Cognitive Behavioral (CBT)' and
-- 'Emotionally Focused (EFT)'. It matches how the other 66 options are
-- named, it spells the therapy out for clients who do not know the acronym,
-- and it keeps the acronym in parentheses for those who do.
--
-- Cheap now: the platform has effectively no therapist data. It gets
-- expensive the moment real profiles exist, because by then the migration
-- has to touch rows people are relying on.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 -- The vocabulary itself. This table is the source of truth; the lists
--      baked into app.js are only the offline fallback (see loadVocab()).
--
--      Note modality_core and modality_more will both end up holding
--      'Cognitive Behavioral (CBT)'. That is fine and intended -- the primary
--      key is (kind, value), and modalityAll() de-duplicates across kinds.
--      Core = shown to therapists up front, more = behind "+ Other".
-- ---------------------------------------------------------------------------
update vocab set value = 'Cognitive Behavioral (CBT)'
 where kind = 'modality_core' and value = 'CBT'
   and not exists (select 1 from vocab v2
                    where v2.kind = 'modality_core'
                      and v2.value = 'Cognitive Behavioral (CBT)');
delete from vocab where kind = 'modality_core' and value = 'CBT';

update vocab set value = 'Emotionally Focused (EFT)'
 where kind = 'modality_core' and value = 'EFT'
   and not exists (select 1 from vocab v2
                    where v2.kind = 'modality_core'
                      and v2.value = 'Emotionally Focused (EFT)');
delete from vocab where kind = 'modality_core' and value = 'EFT';

-- The client's "+ Other" list spelled EFT out but without the acronym, so a
-- client and a therapist could still miss each other by parenthesis.
update vocab set value = 'Emotionally Focused (EFT)'
 where kind = 'modality_more' and value = 'Emotionally Focused'
   and not exists (select 1 from vocab v2
                    where v2.kind = 'modality_more'
                      and v2.value = 'Emotionally Focused (EFT)');
delete from vocab where kind = 'modality_more' and value = 'Emotionally Focused';

-- ---------------------------------------------------------------------------
-- 2 -- Stored therapist selections.
--
--      A therapist may hold BOTH spellings (nothing stopped them ticking two
--      boxes for one therapy), so rewrite and then de-duplicate in one pass
--      rather than a plain array_replace, which would leave a doubled entry.
-- ---------------------------------------------------------------------------
update therapists
   set modalities = sub.fixed
  from (
    select t.user_id,
           array(
             select distinct case m
               when 'CBT'                 then 'Cognitive Behavioral (CBT)'
               when 'EFT'                 then 'Emotionally Focused (EFT)'
               when 'Emotionally Focused' then 'Emotionally Focused (EFT)'
               else m
             end
               from unnest(t.modalities) as m
           ) as fixed
      from therapists t
     where t.modalities && array['CBT', 'EFT', 'Emotionally Focused']
  ) sub
 where therapists.user_id = sub.user_id;

-- ---------------------------------------------------------------------------
-- 3 -- The same strings inside ideal_client.modalities (jsonb).
--
--      Private to the therapist, but ideal_fit() compares it against the
--      client's answer the same way, so a stale 'CBT' here quietly costs the
--      ideal-match flag rather than the listing.
-- ---------------------------------------------------------------------------
update therapists
   set ideal_client = jsonb_set(
         ideal_client,
         '{modalities}',
         (select coalesce(jsonb_agg(distinct case el #>> '{}'
                    when 'CBT'                 then 'Cognitive Behavioral (CBT)'
                    when 'EFT'                 then 'Emotionally Focused (EFT)'
                    when 'Emotionally Focused' then 'Emotionally Focused (EFT)'
                    else el #>> '{}'
                  end), '[]'::jsonb)
            from jsonb_array_elements(ideal_client -> 'modalities') el)
       )
 where ideal_client is not null
   and jsonb_typeof(ideal_client -> 'modalities') = 'array'
   and exists (
     select 1 from jsonb_array_elements_text(ideal_client -> 'modalities') x
      where x in ('CBT', 'EFT', 'Emotionally Focused')
   );

-- ---------------------------------------------------------------------------
-- 4 -- prev_experience_fit() hard-codes modality names.
--
--      Unchanged from 0003 apart from the two renamed strings. Left alone,
--      "More structure and homework" would stop crediting CBT therapists the
--      moment their stored value was rewritten above -- fixing the listing
--      bug while opening a scoring one.
-- ---------------------------------------------------------------------------
create or replace function prev_experience_fit(
  picks        text[],
  t_style      text,
  t_modalities text[],
  t_specialties text[]
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  p       text;
  counted int := 0;
  hits    int := 0;
  mods    text[] := coalesce(t_modalities, '{}');
  specs   text[] := coalesce(t_specialties, '{}');
begin
  if picks is null or cardinality(picks) = 0 then
    return 0;
  end if;

  foreach p in array picks loop
    if p in ('More direct feedback', 'Someone who challenges me') then
      counted := counted + 1;
      if t_style = 'direct' then hits := hits + 1; end if;

    elsif p = 'Someone gentler' then
      counted := counted + 1;
      if t_style = 'gentle' then hits := hits + 1; end if;

    elsif p = 'More structure and homework' then
      counted := counted + 1;
      if t_style = 'direct'
         or mods && array['Cognitive Behavioral (CBT)','DBT','ERP','ACT']
      then hits := hits + 1; end if;

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

grant execute on function prev_experience_fit(text[], text, text[], text[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5 -- Proof. Both should return zero rows.
-- ---------------------------------------------------------------------------
-- select kind, value from vocab
--  where value in ('CBT', 'EFT', 'Emotionally Focused');
--
-- select user_id, modalities from therapists
--  where modalities && array['CBT', 'EFT', 'Emotionally Focused'];
