# Kindred — where we left off (2026-08-03)

Everything is committed and pushed. Nothing is half-finished, nothing is
running unattended, and nothing customer-facing is broken.

**Repos**
- `~/Documents/Claude/kindred-site` → kindredtherapymatch.com (this chat)
- `~/Documents/Claude/kindred-app` → app.kindredtherapymatch.com (this chat)
- `~/Documents/Claude/kindred-hq` → local + private GitHub backup (**other chat**)

> Don't touch `kindred-site/admin/` — that's Kindred HQ's compiled build,
> deployed from the other repo.

---

## Do these first

### 1. Finish Resend email notifications  (~15 min, was mid-setup)

You'd got as far as needing a Resend account. Remaining:

1. **resend.com** → sign up (free tier: 3,000/month)
2. **Domains → Add Domain** → `kindredtherapymatch.com`, add the DNS records
   *(optional — `onboarding@resend.dev` works for testing and is the default)*
3. **API Keys → Create** with **Sending access only**. Starts `re_`
4. **Deploy `notify-signup`** (code is in the repo, ready). Verify JWT **OFF** —
   a database webhook sends no Supabase token
5. **Secrets** on that function:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | the `re_…` key |
   | `NOTIFY_TO` | `kennady.nickell@gmail.com` |
   | `NOTIFY_FROM` | `Kindred <alerts@kindredtherapymatch.com>` (or `onboarding@resend.dev` while testing) |
   | `NOTIFY_SECRET` | any long random string |

6. **Database webhook**: Supabase → Database → Webhooks → new →
   table `therapists`, event `INSERT`, POST to the `notify-signup` URL,
   header `x-kindred-secret` = your `NOTIFY_SECRET`

Note: with account-first signup this fires when someone **pays** (that's when
migration 0013 creates their row), not when they merely create an account.
That's the more useful signal.

### 2. Restore the test account's paid flag

`kennady.nickell@gmail.com` has `subscription_status: active` but
`published: false` — clobbered by a bug that's since been fixed.

Stripe → Developers → Webhooks → `empowering-dream` → Event deliveries →
the `checkout.session.completed` from **Aug 3, 12:34:02 PM** → **Resend**.

### 3. Finish the real-card test — the refund step

`stripe_sync_subscription` is the **only function never executed**. It's the
path every lapsed subscription and failed card takes.

Refund yourself in Stripe, then confirm: `paid` → `false`,
`visible_to_clients` → `false`, and **`profile_name` unchanged** — unlisting
must never delete someone's work.

---

## Known gaps (not blocking)

- **No visibility into accounts without profiles.** Someone who creates an
  account and stops before paying is invisible. Worth an "Accounts, no profile
  yet" list on `/review` once real signups start.
- **`hello@kindredtherapymatch.com` needs to exist.** The domain has Google Workspace MX,
  but confirm the alias actually delivers — it is the deletion and accessibility
  contact on the privacy page. (It replaced `hello@kindred.care`, a domain
  Kindred does not own, which was live on About, Privacy and Welcome.)
- **Therapist testimonials** on therapists.html ship with `hidden` on the quote
  cards. The mockup's two were invented. Populate only with real quotes and
  consent, then remove `hidden`.
- **Licence renewals.** Verification is a point-in-time check; licences expire.
  A calendar reminder per therapist covers you for a long while.
- **Zero therapists visible.** Client funnel is live and the marketplace is
  empty. Deliberate — decision was to open both sides and accept a slow start.

---

## Things worth not re-learning

**Deploys.** Bump the `?v=` on `style.css` / `app.js` / `activate.js` every
time you change them. GitHub Pages serves stale files otherwise. The app's
service worker now auto-reloads once when a new build takes over (fixed
2026-08-03) — before that, the first refresh after a deploy silently ran old
code and only a second refresh picked it up.

**Verify JWT** — the setting that breaks things silently:

| Function | Verify JWT | Why |
|---|---|---|
| `stripe-webhook` | **OFF** | Stripe sends no Supabase token; it proves itself with a signature |
| `notify-signup` | **OFF** | Database webhook, same reason — guarded by `x-kindred-secret` instead |
| `admin-api` | **ON** | Called by a signed-in admin |
| `identity-session` | **ON** | Called by a signed-in therapist |

**Postgres gotchas that cost us hours today:**
- `revoke ... from public` strips EXECUTE from **service_role too**. Always
  `grant execute ... to service_role` after. The symptom (`42501`) looks
  identical to the lockdown working correctly.
- `SECURITY DEFINER` makes `current_user` the function **owner**, so a guard
  trigger checking `current_user = 'service_role'` blocks its own writers. Ours
  uses a transaction-local setting instead.
- `search_therapists` is `returns setof therapists_public`, so the view can't be
  dropped while it exists (`2BP01`). Drop the function, replace the view,
  recreate the function.

**Stripe Identity does not verify professional licences.** It checks government
ID documents. Licence verification is a manual state-board lookup — which *is*
primary source verification, the actual industry standard. No affordable
per-lookup licence API exists; Verifiable/Medallion/CertifyOS are
enterprise-priced.

**Migrations run: 0008–0020.** All verified live.

---

## What got built today

Payment webhook · licence verification made real (it was a `setTimeout` that
always passed) · Stripe Identity · trust gate in both matching paths · admin
review queue with approve **and** deny · getting-started checklist · app
restyled to match the site · waitlist replaced with a public client landing
page · stay-signed-in · profile autosave.

The real-card test found **seven** bugs that would each have hit a founding
therapist — a lost payment, a lost profile, a discarded ID verification, being
asked to pay twice. Worth the $9.99.
