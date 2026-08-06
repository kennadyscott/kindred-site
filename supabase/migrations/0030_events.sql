-- =============================================================================
-- Kindred — aggregate site analytics
--
-- Counts only. There is no user id, no session id, no IP, no referrer and no
-- free text in this table, and the column list is the enforcement: there is
-- nowhere to put a person even by accident. Someone reading "mind won't stop"
-- at 2am is not logged against them, which for a mental-health site is a
-- requirement rather than a nicety.
--
-- Anyone may insert (the visitor's browser posts with the anon key).
-- Only hq_members may read.
-- =============================================================================

create table if not exists public.events (
  id          bigserial primary key,
  event       text        not null check (char_length(event) between 1 and 64),
  -- the tracker whitelists these four keys and truncates values to 40 chars
  props       jsonb       not null default '{}'::jsonb
                          check (jsonb_typeof(props) = 'object'
                                 and (select count(*) from jsonb_object_keys(props)) <= 6),
  created_at  timestamptz not null default now()
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_event_idx   on public.events (event, created_at desc);

alter table public.events enable row level security;

-- Visitors are anonymous and never authenticate, so the insert policy has to be
-- open. The check constraints above are what keeps it from becoming a dumping
-- ground; the column list is what keeps it from holding personal data.
drop policy if exists events_insert_anon on public.events;
create policy events_insert_anon on public.events
  for insert to anon, authenticated
  with check (true);

-- Reading is the privileged half. hq_members is defined in the HQ lockdown
-- migration; fall back to closed if it is not present yet.
drop policy if exists events_select_members on public.events;
create policy events_select_members on public.events
  for select to authenticated
  using (
    exists (select 1 from information_schema.tables
            where table_schema = 'public' and table_name = 'hq_members')
    and exists (select 1 from public.hq_members m where m.email = auth.jwt() ->> 'email')
  );

-- A rolled-up view so HQ fetches a few dozen rows instead of every click.
-- security_invoker keeps the caller's RLS in force rather than the owner's.
create or replace view public.events_daily
  with (security_invoker = on) as
select
  (created_at at time zone 'America/Denver')::date as day,
  event,
  props ->> 'plan' as plan,
  props ->> 'path' as path,
  count(*)                                         as n
from public.events
group by 1, 2, 3, 4;

grant select on public.events_daily to authenticated;

-- Housekeeping: aggregate counts have no value after a year and keeping them
-- forever is just a bigger thing to protect.
create or replace function public.prune_events() returns void
language sql security definer set search_path = public as $$
  delete from public.events where created_at < now() - interval '365 days';
$$;
