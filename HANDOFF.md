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

### 2. The four 13-month coupons — has a deadline
Stripe coupons are immutable, so these are NEW coupons + NEW promotion codes.
Duration **13 months** (not 12: the coupon clock starts at subscription
creation, which on the trial is day 0 of the free month, so 12 only covers 11
paid invoices).

| Amount off | Redeem by | Code |
|---|---|---|
| $20.00 | Sep 1 | `FOUNDINGSEPT13` |
| $15.00 | Oct 1 | `FOUNDINGOCT13` |
| $13.00 | Nov 1 | `FOUNDINGNOV13` |
| $10.00 | Dec 1 | `FOUNDINGDEC13` |

Do NOT restrict them to specific products — that fails silently. Don't delete
the old coupons; archiving the old promotion codes is enough.
Then swap the codes in `PRICING_TIERS` in `activate.js`.

**`FOUNDINGSEPT` stops being the right tier on September 1st.**

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
  `buy.stripe.com` link** (which also drops the founding discount). The fix is
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
button promising $9.99 above a checkout saying $0.00.

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
