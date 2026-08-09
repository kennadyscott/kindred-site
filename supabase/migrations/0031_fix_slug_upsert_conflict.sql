-- ============================================================================
-- 0031 -- "duplicate key value violates unique constraint therapists_slug_key"
--         at the end of building a profile
--
-- WHAT HAPPENS
-- saveTherapistProfile() upserts:  INSERT ... ON CONFLICT (user_id) DO UPDATE.
-- A therapists row already exists by then — 0013 creates a stub the moment
-- someone has an account — so this is an update in intent.
--
-- But ON CONFLICT names ONE arbiter index: user_id. Postgres still inserts a
-- speculative tuple and checks EVERY unique index on the table. Before that
-- insert, the BEFORE INSERT trigger set_therapist_slug() runs with
-- tg_op = 'INSERT', sees new.slug IS NULL (the app never sends a slug), and
-- computes 'kennady-scott'. Its collision check is:
--
--     where slug = candidate and user_id <> new.user_id
--
-- The row it would collide with is the therapist's OWN existing row, so
-- `user_id <> new.user_id` is false and no suffix is added. The speculative
-- tuple then carries a slug that already exists — and a conflict on a
-- NON-arbiter unique index is not handled by ON CONFLICT (user_id). It raises
-- 23505 instead of taking the DO UPDATE path.
--
-- Whether it fires depends on which unique index Postgres checks first, which
-- is why this is intermittent rather than constant.
--
-- THE FIX
-- On INSERT, if a row already exists for this user_id, leave slug NULL. The
-- partial unique index is `where slug is not null`, so NULL cannot collide;
-- the upsert then resolves on user_id as intended, and because `slug` is not
-- in the payload it is not in the DO UPDATE SET list — the existing slug is
-- preserved untouched. Exactly the desired outcome, reached without ever
-- proposing a duplicate.
--
-- Two smaller holes closed while here:
--   * kindred_slugify can return ''. Empty string is NOT NULL, so it IS
--     indexed, and a second name that slugifies to nothing would collide.
--     Falls back to 'therapist' now.
--   * the suffix was tried ONCE. If base-<4 hex> were also taken it failed.
--     Now it widens the suffix until it finds a gap.
-- ============================================================================

create or replace function set_therapist_slug() returns trigger
language plpgsql as $$
declare
  base      text;
  candidate text;
  suffix    text;
  n         int := 0;
begin
  if new.name is null or btrim(new.name) = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.slug is not null then
      return new;                      -- caller supplied one; respect it
    end if;
    /* THE FIX. This "insert" is really the speculative half of an upsert for
       somebody who already has a row. Proposing their existing slug trips the
       slug index before ON CONFLICT (user_id) can resolve. Leave it null:
       null cannot collide, the upsert lands on the user_id arbiter, and the
       existing slug survives because slug is not in the payload. */
    if exists (select 1 from therapists where user_id = new.user_id) then
      new.slug := null;
      return new;
    end if;
  else
    if new.slug is not null and new.name is not distinct from old.name then
      return new;                      -- nothing relevant changed
    end if;
  end if;

  base := kindred_slugify(new.name);
  -- '' is not null, so it would be indexed and collide with the next one.
  if base is null or base = '' then
    base := 'therapist';
  end if;

  candidate := base;
  suffix := replace(new.user_id::text, '-', '');
  while exists (
    select 1 from therapists
     where slug = candidate
       and user_id is distinct from new.user_id
  ) loop
    n := n + 1;
    exit when n > 8;                   -- 12 hex chars in; give up and let it be
    candidate := base || '-' || left(suffix, 3 + n);
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anyone whose slug never got set because the insert failed part-way. Uses the
-- same rules; the trigger will not touch a row that already has one.
-- ---------------------------------------------------------------------------
update therapists t
   set slug = case
     when exists (
       select 1 from therapists x
        where x.user_id <> t.user_id
          and x.slug = coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
     )
     then coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
          || '-' || left(replace(t.user_id::text, '-', ''), 4)
     else coalesce(nullif(kindred_slugify(t.name), ''), 'therapist')
   end
 where slug is null
   and name is not null and btrim(name) <> '';
