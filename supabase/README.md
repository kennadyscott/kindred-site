# Kindred — database

One Postgres database (Supabase) shared by both properties:

- **kindredtherapymatch.com** — the marketing website (`kindred-site`)
- **app.kindredtherapymatch.com** — the matching app (`kindred`)

A therapist has **one** profile. Whichever side they edit it from, it's the same row.

## Running the migrations

Run them **in order**, in the Supabase SQL editor:

| File | What it does |
|---|---|
| `0001_therapists.sql` | The `therapists` table, RLS, and the public view |
| `0002_scale.sql` | Multi-state licensure, full-text search column, indexes, and the columns matching needs |
| `0003_match_function.sql` | Server-side scoring (`match_therapists`) and search (`search_therapists`) |

They're written to be re-runnable (`if not exists` / `create or replace`), but run them once, in sequence, the first time.

> **Not yet validated against a live database.** These were written without a Postgres instance to run them on. Expect to fix a syntax detail or two on first run — check `0003` first, since the plpgsql helpers are the most intricate part.

## The two rules the schema enforces

**1. A therapist's ideal-client spec is private.** Row-level security filters *rows*, not *columns* — so if clients could read the `therapists` table at all, a crafted query could pull `ideal_client`. Instead:

- Only the owner can `select` from `therapists` (RLS).
- Everyone else reads `therapists_public`, a view that **physically cannot return** `ideal_client`.
- `match_therapists()` is `SECURITY DEFINER`, so it *reads* the ideal spec to rank people but returns only public columns plus a score. The spec shapes ranking and never leaves the database.

**2. Ideals boost, they never filter.** A client who isn't a therapist's "unicorn" still matches normally and can still reach them. The only hard filters are legal or practical: licensure by state, and whether the money works.

## Why matching lives in SQL

It used to run in the browser over the whole roster. That's fine at six therapists and breaks at thousands — you'd ship the entire supply side to every phone (a competitive-asset leak as much as a performance problem) and score it in JavaScript on whatever device the client owns.

`match_therapists()` filters on indexed columns, scores in Postgres, and returns one page.

### Scoring

| Component | Worth |
|---|---|
| Overlap with what the client needs help with | up to 40 |
| Each stated preference (modality, style, gender, ethnicity, LGBTQ+, affinity, faith, language, format, insurance) | 10 each |
| Therapist's private ideal-client fit | **+6 boost** |
| What a returning client wants different | **+5 boost** |

Normalized to 62–98. Both boosts only ever add.

## ⚠️ Known drift risk

The same scoring logic now exists **twice** — in `app.js` (`matchPercent`) and here (`match_therapists`). They will diverge.

Once the app calls the RPC, **delete the client-side scoring** and make SQL the single source of truth. Until then, any change to one must be mirrored in the other.

## Before real people use this

- [ ] **Decide the HIPAA posture first.** Once clients type real histories into intake and it's stored here, this is sensitive health data. Supabase's free/Pro tiers **do not include a BAA** — that's a specific paid configuration. Choosing wrong means migrating projects, not flipping a setting.
- [ ] Account deletion must actually delete, server-side, including backups.
- [ ] Messaging (client ↔ therapist) has no schema yet and is the highest-risk surface.
- [ ] Analytics events need rollups or partitioning before that table becomes the biggest one.
