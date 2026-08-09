# Kindred — where we left off (2026-08-06)

Everything is committed, pushed and live on both domains. Nothing is
half-finished and nothing customer-facing is broken. There are no clients
waiting and no therapists mid-signup, so nothing here is urgent tonight.

**Repos**
- `~/Documents/Claude/kindred-site` → kindredtherapymatch.com
- `~/Documents/Claude/kindred-app`  → app.kindredtherapymatch.com
  Both are GitHub Pages from their repo. **Pushing is publishing.**

> Don't touch `kindred-site/admin/` — that's Kindred HQ's compiled build.

---

## The big change today: onboarding runs in a new order

Was: pay → build profile. Now:

    land → build profile (FREE) → ACTIVATE (paywall) → licence + identity → live

Reasoning, so it isn't re-litigated: the profile *is* the pitch — it's where a
therapist sees themselves described by how they work rather than by their
credentials — and asking for a card before that, on a marketplace with nobody
in it, was the wrong order. Licence checking sits deliberately *after*
activation so hand-verification time isn't spent on people who never convert.

Everyone who builds a profile gets the 30-day trial at activation.

---

## Do these first (about an afternoon, in this order)

### 1. Resend — the biggest gap
Three lists are collecting and **nothing can send an email**, while the copy
on every one of them promises you'll write to people.

1. resend.com → sign up (free tier 3,000/mo)
2. API Keys → Create, **Sending access only**. Starts `re_`
3. Deploy `notify-signup` (code is in the repo). **Verify JWT OFF**
4. Secrets: `RESEND_API_KEY`, `NOTIFY_TO`, `NOTIFY_FROM`, `NOTIFY_SECRET`
5. Database webhook: table `therapists`, event INSERT, POST to the function,
   header `x-kindred-secret`

The three lists, and how to read them:
```sql
select * from admin_newsletter_list();   -- site newsletter
select * from admin_notify_list();       -- client waitlist
select * from admin_marketing_list();    -- therapists who opted in
select * from therapist_stage();         -- where each therapist stalled
```

### 2. The founding coupons — RETIRED (2026-08-09)
The escalating ladder is gone. It was $9.99 / $14.99 / $16.99 / $19.99 a month
locked for twelve months, stepped by signup date, with a Stripe promotion code
(`FOUNDINGSEPT` / `OCT` / `NOV` / `DEC`) pre-applied per tier.

**The offer now: free for every therapist until 1 March 2027, then $29.99/month.**
One date and one rate, the same whoever you are and whenever you joined.

Why it had to go rather than just being left alone: the last tier closed
1 Dec 2026 and the first renewal is March 2027, so no tier could ever apply to
anybody again — but `PRICING_TIERS` was still consulted on three screens, and
`activate.js` was overwriting the correct hero with "then $29.99/month for your
first 12 months" every time the page loaded. Dead pricing code does not stay
quiet; it quotes rates the checkout will not honour.

What was removed:

| | |
|---|---|
| `PRICING_TIERS` | emptied, then deleted, in `activate.js` and `app/app.js` |
| `FOUNDING_LOCK_MONTHS` | gone from both |
| `prefilled_promo_code` | no longer set on either checkout URL |
| `p.founding` branches | gone from the activate modal, the offer card, the hero and the heading |
| `t.subscription` | now `{plan, standardRate}` — no `founding`, `introRate`, `introMonths` |

**The Stripe coupons and promotion codes still exist and are still valid.**
Nothing here deletes them, which is correct: anyone already on one keeps it,
and a live discount should never be shortened underneath someone. They are
simply never handed out again. Coupons are immutable anyway — Stripe lets you
edit a coupon's name and metadata and nothing else.

**Both payment links stay**, on the same $29.99/month price:
`PAYMENT_LINK` and `PAYMENT_LINK_TRIAL` (30-day trial set under Subscription
options). The trial is now a grace period on the RENEWAL decision, not a second
free offer stacked on the free period — the only people who reach checkout are
therapists whose free-until-March window has ended.

The timezone risk that used to live here is gone with the ladder: there are no
redeem-by dates left to evaluate in the wrong clock.

### 2b. Migration 0026 — license expiry date
`alter table therapist_licenses add column expires_on date` plus
`admin_expiring_licenses(days)` for the review queue.

NOT URGENT, and nothing breaks before it runs: saveLicense() sends expires_on,
and if PostgREST answers PGRST204/42703 it retries once without the field and
saves the licence anyway. Until it runs, expiry dates typed by therapists are
silently dropped — so run it before asking anyone to fill them in.

Why it matters: a licence verified in August is still flagged verified in
December after it lapsed. Nothing in the system knew to look again.

### 3. Confirm the /welcome redirect on the trial payment link
You thought you'd set it. The check takes five seconds: the link's detail page
should read `Confirmation page: https://kindredtherapymatch.com/welcome`.

### 4. One real end-to-end run before any outreach
Cancel the live trial on `kennady.nickell@gmail.com` (it charges ~Sep 5
otherwise), then run `activate.html?offer=trial30` again with a real card at
$0.00. That confirms the redirect AND finally exercises
`stripe_sync_subscription` — still the only function in the chain never run.

---

## Known gaps (not blocking, but real)

- **Orphaned payments.** Paying with an email that has no Kindred account
  attaches the money to nobody, logs an error, and never self-heals — even if
  they create that account later. `activate.html` prevents it by requiring an
  account first. **Only ever send `activate.html?offer=trial30`, never the raw
  `buy.stripe.com` link.** The fix is
  a `pending_activations` table claimed at signup; roughly an hour.
- **Analytics are per-browser.** `analytics.js` only posts to the database in a
  browser where you pasted the config by hand, so the review page's "Front door
  answered" and "Founding signups" tiles count only your own clicks. The three
  DB-backed tiles beneath them are real. Every flow decision today was made on
  judgement, not data — fine at zero users, not fine later.
- **Zero therapists live.** Every client who finishes the questionnaire hits
  the waitlist. That's the marketplace being empty, not a bug — the same screen
  becomes real matches the moment one therapist clears verification.
- **Client accounts and messaging are built but switched off** behind
  `clientDataPersistence` in `config.json`, pending the BAA. Flipping it needs
  the `client_intake` / `client_matches` / `messages` tables, which don't exist
  yet, plus a one-time backfill so people who already answered don't redo it.
- **BAA decision was targeted for mid-August.** It's the gate on client
  profiles and therapist↔client messaging, and nothing else can be built
  around it.

---

## Things worth not re-learning

**Deploys.** Bump `?v=` on every changed file. For the app, bump BOTH
`app.js?v=` in index.html AND the `CACHE` constant in `sw.js` — otherwise the
service worker serves the old file while `fetch()` returns the new one, which
looks exactly like a broken code change. Currently `kindred-v19`.

**Verify by looking, not only by measuring.** Three bugs today passed every DOM
check and were only visible on screen: a hero crushed to 241px inside a 620px
column, tracker labels drawn as 26px circles by an unscoped `span` rule, and a
button promising a monthly rate above a checkout saying $0.00.

**The preview pane lies in specific ways.** Zero-height viewport (all layout
measures 0), blank frames after a smooth scroll, `:focus` styles not applying,
CSS transitions frozen, and programmatic `scrollTo` not firing scroll events.
When a result looks wrong, check whether the *running* code is current before
believing it.

**Migrations run: 0008–0023.** All verified live.

---

## What got built today

Site UX pass (expectations, trust signals, accessibility, back-to-top) ·
front door made a required choice with 988 as a third path · newsletter capture
on every page · My Kindred moved to V2 and removed · one CTA label and one
destination sitewide · therapist insurance widened to all 109 carriers · one
specialty list with stars · photo upload in signup + downscaling · dropdown
scroll retention · Ideal Client added to the checklist · marketing consent with
a timestamp · client waitlist reframed and email-only · **onboarding reordered
around a free profile** · audience choice now carried into the app.
