# Kindred — API contract

Two clients, one API. Both the marketing website (`kindred-site` → kindredtherapymatch.com) and
the matching app (`kindred` → app.kindredtherapymatch.com) talk to the same Supabase project over
PostgREST. **Business logic lives server-side; clients render.** This document is the contract —
if you're changing what an endpoint accepts or returns, you're editing this file too.

## The rule that motivates all of this

The clients had already drifted before there was an API: the website portal offered
**"Blue Cross Blue Shield"** while the app matches on **"BCBS"**, so a profile built on one
surface partially failed to match on the other. A typo-level difference silently breaks matching.
Nothing that two surfaces must agree on may be defined in either surface.

## Surfaces

| Endpoint | Kind | Access | Purpose |
|---|---|---|---|
| `therapists_public` | view | read: anon + authed | The public roster. **Physically cannot return `ideal_client`.** |
| `therapists` | table | owner-only (RLS) | A therapist's own row, incl. private `ideal_client`. Writes require auth. |
| `rpc/match_therapists` | function | execute: anon + authed | Scored, paged matching. `SECURITY DEFINER` — reads `ideal_client` internally, returns public fields + `match_score` + `is_ideal` only. |
| `rpc/search_therapists` | function | execute: anon + authed | Full-text keyword search + location/gender/format filters, over the public view. |
| `rpc/get_vocab` | function | execute: anon + authed | Every controlled vocabulary, keyed by kind. Single source of truth for option lists. |
| `vocab` | table | read: anon (active only) | Reference data behind `get_vocab`. Writes: service role only. |
| `therapist_leads` | table | insert-only: anon | Founding-member signups from the website. Read via admin/service role. |
| `events` | table | insert-only: anon | Anonymous analytics counts. No identifiers by design. |

Planned, **gated on auth**: therapist profile upsert (website portal + app editor writing the same
row). Planned, **gated on a signed BAA** (see README): client accounts, client↔therapist messaging.

## Who owns which logic

| Logic | Source of truth | Client's role |
|---|---|---|
| Match scoring + ideal-client boost | `match_therapists` (SQL) | Demo-mode fallback only; server score always wins when present (`_serverScore`) |
| Keyword search | `search_therapists` (SQL) | Demo-mode fallback only |
| Option lists (specialties, modalities, age bands, …) | `vocab` table | Baked copies are an offline fallback, refreshed at boot via `get_vocab` |
| Ideal-client privacy | Schema (owner-only RLS + view without the column) | UI additionally never renders it client-side |
| Presentation, swipe deck, players, demo roster | Clients | — |

**The drift trap:** scoring exists twice (SQL + `matchPercent` fallback in `app.js`). The fallback
exists for demo/offline only. If you change weights, change them in SQL first and mirror the
fallback in the same commit — or better, don't change the fallback and let it be visibly stale in
demo mode only.

## Versioning policy

PostgREST function signatures are the API contract, and clients linger:

- The app is a PWA. Its service worker is network-first (stale clients only persist while
  *offline*), but an offline client still calls with old code.
- Static hosting means there is no synchronized deploy across website + app + DB.

Therefore:

1. **Additive only.** New RPC parameters must have SQL `default` values so old callers keep
   working. Never rename, remove, or repurpose an existing parameter.
2. **Breaking change → new function** (`match_therapists_v2`). Keep the old one until both
   clients have shipped and had time to rotate.
3. **Never remove a column from `therapists_public`** without checking both clients' adapters.
4. Vocab values are append-mostly: deactivate (`active = false`) rather than delete, and never
   re-spell a value in place — matching compares exact strings against stored profiles.

## Client configuration

Both clients gate live mode on config; absent config = demo mode (seeded data, no network):

- **App:** `KINDRED_DB` constant in `app.js` (or `localStorage['kindred-db']` for testing) —
  `{ url, key }` with the **anon public** key. Adapter: `dbRowToTherapist()` is the single seam
  where DB rows become the app's therapist shape.
- **Website:** `localStorage['kindred-analytics-config']` for analytics/leads live mode.

The anon key is public by design; RLS is the security boundary. The service-role key must never
appear in either client.
