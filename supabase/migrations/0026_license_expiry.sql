-- ============================================================================
-- 0026 -- When a licence expires
--
-- therapist_licenses records the number and the state and whether a human has
-- checked it, but not the one fact that stops being true on its own. A licence
-- verified in August is still marked verified in December after it lapsed, and
-- nothing in the system knows to look again.
--
-- Kindred's whole promise to a client is "this person is licensed, and we
-- checked by hand". That promise quietly expires with the licence unless the
-- date is stored beside it.
--
-- NULLABLE, deliberately. Every licence already in the table was entered
-- without one, and a NOT NULL column would mean either inventing dates or
-- blocking the therapists who are already verified. Null means "not told yet",
-- which is honest, and the app asks for it on the next edit.
--
-- SAFE TO RUN LATE. The app sends expires_on only if the column accepts it:
-- PostgREST answers an unknown column with PGRST204 / 42703, and saveLicense
-- retries once without the field. So licences keep saving before this runs,
-- just without the date.
-- ============================================================================

alter table therapist_licenses add column if not exists expires_on date;

comment on column therapist_licenses.expires_on is
  'Expiry printed on the licence. Null means the therapist has not supplied it yet -- rows predating 0026, which is most of them.';

-- The admin review queue should see a lapsed licence before a client does.
create or replace function admin_expiring_licenses(p_within_days int default 60)
returns table (
  email       text,
  name        text,
  state       text,
  license_number text,
  expires_on  date,
  days_left   int,
  verified    boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    t.name,
    l.state,
    l.license_number,
    l.expires_on,
    (l.expires_on - current_date)::int as days_left,
    (l.verified_at is not null)        as verified
  from therapist_licenses l
  join therapists t on t.user_id = l.user_id
  join auth.users  u on u.id     = l.user_id
  where l.expires_on is not null
    and l.expires_on <= current_date + greatest(0, p_within_days)
  -- already lapsed first, then soonest
  order by l.expires_on asc;
$$;

revoke all     on function admin_expiring_licenses(int) from public, anon, authenticated;
grant  execute on function admin_expiring_licenses(int) to service_role;
