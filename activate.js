/* ===========================================================================
   Kindred — therapist listing activation (Stripe Payment Links)
   ---------------------------------------------------------------------------
   Therapists pay HERE, on the website — never inside the iOS app. That keeps
   Apple's cut at 0% and avoids any in-app-purchase surface in the App Store
   build. The app links here; this page hands off to Stripe.

   >>> THE ONLY THING YOU NEED TO EDIT IS THE `PAYMENT_LINKS` BLOCK BELOW. <<<

   >>> KINDRED IS FREE FOR EVERY THERAPIST UNTIL 1 MARCH 2027. One date, the
       same for everyone, whenever they joined. No card is taken at signup and
       nothing on this page is part of therapist onboarding.

   What this file is now: the RENEWAL checkout, reached at the end of the free
   period (?checkout=now&email=…, sent by the app's Keep-it-active modal), plus
   an offer page for cold outreach whose only button goes to /app/#therapist-signup.

   THE FOUNDING LADDER IS GONE (2026-08-09). It was $9.99–$19.99/month locked
   for twelve months, on a tier that stepped up by signup date. It could not
   apply to anyone any more — its last tier closed 1 Dec 2026 and the first
   renewal is six months after go-live — and every surface that still described it was
   quoting a rate no checkout would honour. One price now: $29.99/month, the
   same $29.99 already behind the Stripe links.

   Nothing here reaches into Stripe. If STANDARD_RATE moves, a new Stripe price
   and new payment links have to move with it.

   HOW TO BUILD THIS IN STRIPE (~10 minutes):
     1. Products → Add product → "Kindred Listing".
        Add a RECURRING price: $29.99 USD / month.
     2. Payment links → New → that price → Create link → paste as PAYMENT_LINK.
     3. Payment links → New → the SAME price → under Subscription options set a
        free trial of 30 days → leave "collect payment method" ON, or nothing
        charges at day 31 → paste as PAYMENT_LINK_TRIAL.
     4. Both links need the same After-payment redirect to welcome.html; that
        is a per-link setting in the dashboard.

   No coupons and no promotion codes are involved any more. If you ever add one
   back, remember Stripe coupons are IMMUTABLE — duration and amount cannot be
   edited after creation, only the name and metadata.

   Leave PAYMENT_LINK as null and this page gracefully shows the "opening soon"
   note instead of a broken checkout button.
   =========================================================================== */

/* The Stripe Payment Link for the $29.99/mo price. No promotion code is
   pre-applied any more — there is one rate, so there is nothing to discount. */
const PAYMENT_LINK = 'https://buy.stripe.com/bJe5kD6Vs8iz2hR5dJfjG00';

/* ---- the renewal link, which carries 30 days free -------------------------
   The SAME $29.99/month price on a second link with a 30-day free trial set
   under Subscription options. A trial is a property of the link, not a coupon.

   This is a grace period on the RENEWAL decision, not a second free offer on
   top of the free period: the only people who reach checkout are therapists
   whose free-until-March window has run out and who are choosing to carry on.

   Leave it null and everyone falls back to PAYMENT_LINK — that is the kill
   switch for the trial, and no other edit is needed. Both links need the same
   After-payment redirect to welcome.html. */
const PAYMENT_LINK_TRIAL = 'https://buy.stripe.com/fZu6oH1B8cyP4pZ6hNfjG01';
const TRIAL_DAYS = 30;
/* Free until this date, the same for every therapist. Mirrors
   FREE_PERIOD_LABEL in app/app.js and the trigger in migration 0053. */
const FREE_MONTHS = 6;
const FREE_PERIOD_LABEL = 'six months';

/* THE PRICE AFTER THE FREE PERIOD. One number, one place, and it matches the
   $29.99 already behind both Stripe links — what the product promises and what
   the card is charged are the same figure. */
const STANDARD_RATE = 29.99;
/* Declared AFTER the rate it reads — a const referenced before its
   declaration is a TDZ throw at load, not a syntax error, so it would have
   taken the whole page down without node --check noticing. */
const AFTER_FREE_RATE = '$' + STANDARD_RATE.toFixed(2) + '/month';

/* ---------------------------------------------------------------------------
   checkout=now -- leave before this page paints.

   The app's Activate modal sends people here purely to have the Stripe URL
   built, because the payment links live in this file. Everything needed for
   that is above: the links and the email in the query string. Waiting for initAccount's profile lookup meant the page
   rendered first, so a therapist saw the landing page flash past on the way to
   paying -- which reads like a misclick.

   No profile check here, deliberately: the modal that sends them only opens
   for a therapist who has already built one, so re-asking the database buys
   nothing and costs a full render.
--------------------------------------------------------------------------- */
(function jumpStraightToCheckout() {
  const q = new URLSearchParams(location.search);
  if (q.get('checkout') !== 'now') return;
  const email = q.get('email');
  if (!email) return;                        // nothing to tie the payment to; fall through

  const link = PAYMENT_LINK_TRIAL || PAYMENT_LINK;   // see ONE LINK note in initActivate
  if (!link) return;

  const u = new URL(link);
  u.searchParams.set('prefilled_email', email);
  u.searchParams.set('client_reference_id', email);   // what the webhook matches on
  /* Nothing of this page should be visible even for a frame. */
  document.documentElement.style.visibility = 'hidden';
  location.replace(u.toString());
})();

(function initActivate() {
  /* Outreach offer. Falls back silently if the trial link isn't configured
     yet, so a half-finished setup can never produce a broken checkout. */
  /* ---- ONE LINK ------------------------------------------------------------
     The trial used to be opt-in via ?offer=trial30, back when it was an
     outreach-only sweetener. It is not one any more: the app's Activate modal
     appends offer=trial30 unconditionally and promises "Free for 30 days" to
     everyone, so the trial link is already the only one anybody reaches
     through the product.

     What the opt-in still bought was a way to get it WRONG. Loading
     activate.html without the parameter -- a typed URL, an old bookmark, a
     link pasted without its query string -- silently used the no-trial link
     while every screen around it still promised 30 days free. That is a page
     that says "nothing charged today" and then charges.

     So the trial is simply the offer now. PAYMENT_LINK_TRIAL being null is the
     kill switch: unset it and everyone falls back to PAYMENT_LINK, no other
     edit needed. Both Stripe links still need the same After-payment redirect
     to welcome.html, since that is a per-link setting in the dashboard. */
  const trial = !!PAYMENT_LINK_TRIAL;
  const rate = STANDARD_RATE;

  // ---- render the offer ----
  const offer = document.getElementById('kt-offer');
  const badge = document.getElementById('kt-offer-badge');
  const price = document.getElementById('kt-offer-price');
  const terms = document.getElementById('kt-offer-terms');

  if (trial) {
    /* Lead with the free period, but never hide what happens after it -- the
       whole point of the offer is that the date is far off and the price
       afterwards is already good. */
    badge.textContent = `\u2605 ${FREE_MONTHS} months free`;
    /* The span is inline with no margin -- a slash needs no space, so it works
       for `$29.99<span>/month`, and here it needs the &nbsp;. */
    price.innerHTML = `Free<span>&nbsp;for 6 months</span>`;
    terms.textContent = `then ${AFTER_FREE_RATE} \u00b7 cancel anytime`;
    const was = document.getElementById('kt-offer-was');
    if (was) was.hidden = true;
    /* No saving to quote. There is one rate and no discount running against
       it, and an invented "was" price on the screen where somebody decides to
       pay is the kind of thing that gets read back to you later. Say what the
       trial actually does instead, since that IS the thing they are agreeing
       to at checkout. */
    const save = document.getElementById('kt-offer-save');
    if (save) {
      save.textContent = `Nothing to pay today. Cancel before day ${TRIAL_DAYS + 1} and you're never charged.`;
    }
  } else {
    offer.classList.add('standard');
    badge.textContent = 'Kindred Membership';
    price.innerHTML = `$${STANDARD_RATE.toFixed(2)}<span>/month</span>`;
    terms.textContent = 'billed monthly \u00b7 cancel anytime';
    /* no discount running — don't show a comparison that isn't real */
    ['kt-offer-was', 'kt-offer-save'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  }


  // ---- wire the checkout button (or show the graceful fallback) ----
  const btn = document.getElementById('kt-checkout-btn');
  const wrap = document.getElementById('kt-checkout-wrap');
  const notReady = document.getElementById('kt-notready');

  const link = trial ? PAYMENT_LINK_TRIAL : PAYMENT_LINK;
  if (!link) {
    // Stripe link not configured yet — never show a dead checkout button.
    wrap.hidden = true;
    notReady.hidden = false;
    return;
  }

  const url = new URL(link);
  // Carry the therapist's email through so Stripe prefills it and the
  // resulting subscription can be matched back to their Kindred account.
  /* A session on this browser is more trustworthy than a query string anyone
     could have edited -- and on the account-first path there IS no ?email=. */
  let sessionEmail = null;
  try {
    const st = JSON.parse(localStorage.getItem('kindred-session') || 'null');
    sessionEmail = (st && st.user && st.user.email) || null;
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  const email = sessionEmail || params.get('email');
  if (email) {
    url.searchParams.set('prefilled_email', email);
    url.searchParams.set('client_reference_id', email); // ties the Stripe session to the account
  }
  btn.href = url.toString();
  /* On the trial the price on the button contradicted the whole card above it:
     "nothing to pay today", then a button naming a monthly figure. The trial
     version names what the click actually does instead. */
  btn.textContent = trial
    ? 'Secure my spot and build my profile'
    : `Continue to secure checkout — $${rate.toFixed(2)}/mo`;

  /* "You'll be billed monthly" is also wrong on the trial, and the card IS
     collected at checkout -- saying so here is better than letting them meet
     a card form they were not expecting one screen later. */
  /* The hero carries the same offer, so it has to tell the same story. This
     used to overwrite the static hero with "then $29.99/month for your first
     12 months" -- a twelve-month lock that no longer existed, printed over
     correct markup by the script meant to keep it in sync. */
  const heroRate = document.getElementById('kt-hero-rate');
  const heroOffer = document.getElementById('kt-hero-offer');
  const heroName = document.querySelector('.kt-offer-name');
  if (heroRate) heroRate.textContent = `Your first ${FREE_PERIOD_LABEL} are free`;
  if (heroOffer) {
    heroOffer.innerHTML = `<b>Your first ${FREE_PERIOD_LABEL} are free</b> &mdash; then ${AFTER_FREE_RATE}`;
    if (heroName) heroName.textContent = 'Kindred for therapists';
  }

  /* The heading names the offer they actually clicked, so the page they land
     on matches the link that brought them. */
  const headTitle = document.getElementById('kt-head-title');
  const headSub   = document.getElementById('kt-head-sub');
  if (headTitle) {
    headTitle.textContent = 'Join Kindred';
  }
  if (headSub && trial) {
    headSub.textContent = `A sign-in, then your card — about two minutes, and nothing is charged for ${TRIAL_DAYS} days. Your profile comes next, and you go live once we've checked your license and identity.`;
  }

  const fine = document.getElementById('kt-checkout-fine');
  if (fine && trial) {
    fine.textContent = `Payments are processed securely by Stripe. Your card is saved now and nothing is charged for ${TRIAL_DAYS} days — cancel before then from your therapist portal and you're never billed.`;
  }
})();

/* ===========================================================================
   Step 1 — the Kindred account.
   Same Supabase project the app uses, same raw GoTrue endpoints (no SDK), so
   ONE account works on the website and in the app. We create the account
   BEFORE payment so the Stripe email always matches the Kindred account, and
   so anyone who drops off mid-way is still reachable.
   =========================================================================== */
const KINDRED_AUTH = {
  url: 'https://izukppxgoerqtustfbnk.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk'
};
const AUTH_SESSION_KEY = 'kindred-session';   /* same key the app uses */
const PENDING_EMAIL_KEY = 'kindred-pending-email';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch (e) { return null; }
}
function saveSession(d) {
  if (!d || !d.access_token) return null;
  const s = { access_token: d.access_token, refresh_token: d.refresh_token,
              expires_at: Date.now() + ((d.expires_in || 3600) * 1000), user: d.user };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s));
  return s;
}
async function authPost(path, body) {
  const res = await fetch(KINDRED_AUTH.url + '/auth/v1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': KINDRED_AUTH.key },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || ('Something went wrong (' + res.status + ')'));
  return data;
}

(function initAccount() {
  const form   = document.getElementById('kt-acct-form');
  const step2  = document.getElementById('kt-step2');
  const acct   = document.getElementById('kt-acct');
  const who    = document.getElementById('kt-acct-who');
  const err    = document.getElementById('ka-err');
  const submit = document.getElementById('ka-submit');
  const toggle = document.getElementById('ka-signin-toggle');
  if (!form) return;

  let mode = 'signup';   /* or 'signin' */

  function markStep(n) {
    document.querySelectorAll('.kt-track-step').forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle('on', s === n);
      el.classList.toggle('done', s < n);
    });
  }

  function revealStep2(email) {
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    acct.hidden = true;
    step2.hidden = false;
    if (who) who.innerHTML = 'Account ready for <b>' + email.replace(/[<>&]/g, '') + '</b>. Next: start your membership.';
    markStep(2);
    /* Carry the account into Stripe. BOTH parameters matter, differently:
         prefilled_email     - a suggestion. The customer can edit it at
                               checkout, and Stripe Link will auto-fill a saved
                               address over it. Never authoritative.
         client_reference_id - passed through untouched and unreachable by the
                               customer. stripe-webhook prefers it over
                               customer_details.email, so this is what actually
                               ties the subscription to the Kindred account.
       Setting only prefilled_email meant a first live test attached the
       membership to a different account than the one just created. */
    if (window.kTrack) window.kTrack('therapist_reached_checkout');
    const btn = document.getElementById('kt-checkout-btn');
    if (btn && btn.href && btn.href.indexOf('buy.stripe.com') !== -1) {
      const u = new URL(btn.href);
      u.searchParams.set('prefilled_email', email);
      u.searchParams.set('client_reference_id', email);
      btn.href = u.toString();
    }
    /* checkout=now: the app already showed them the offer in its own modal, so
       rendering it again here and asking them to press Continue a second time
       is one screen too many. The Stripe URL is built above -- the payment
       ladder and the trial link live in this file, deliberately in one place
       -- so go straight there.
       replace() so Back does not land them on a page that immediately
       forwards again. */
    if (new URLSearchParams(location.search).get('checkout') === 'now') {
      const b = document.getElementById('kt-checkout-btn');
      if (b && b.href && b.href.indexOf('buy.stripe.com') !== -1) { location.replace(b.href); return; }
    }
    step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* No profile yet, however they arrived: show them the offer, with a button
     that starts the free build.

     This used to location.replace() straight to /app/#therapist-signup on the
     theory that "the pitch already happened in the email that brought them".
     It hadn't. ?offer=trial30 IS the pitch -- it is the page the outreach link
     points AT -- so redirecting away from it before it painted meant the offer
     was never read by anyone who clicked. A link that bounces you somewhere
     else the instant you open it also reads like a broken link, which is the
     opposite of what an outreach click should feel like.

     The page now stays put and #kt-coldstart carries the ask. */
  function ktGoBuildProfile() {
    window.__ktShowColdStart();
  }

  window.__ktShowColdStart = function () {
    const cold = document.getElementById('kt-coldstart');
    if (cold) {
      cold.hidden = false;
      /* The heading was written for the old order -- "a sign-in, then your
         card" -- which is now the opposite of what happens next. */
      const ht = document.getElementById('kt-head-title');
      const hs = document.getElementById('kt-head-sub');
      /* FREE UNTIL MARCH 2027. There is no checkout in onboarding any more, so
         a cold visitor is never being sold anything here -- this page is now an
         offer page whose only button goes to the app. The Stripe machinery
         below still exists for RENEWALS, which reach this file with
         ?checkout=now and never render this branch. */
      if (ht) ht.textContent = `${FREE_PERIOD_LABEL} free for every therapist`;
      if (hs) hs.textContent = `Build your profile — about ten minutes, no card, nothing to cancel. Your first ${FREE_PERIOD_LABEL} are free, then ${AFTER_FREE_RATE}.`;
      /* Named for what the click does, not for the work behind it. "Build my
         profile — free" describes a chore; this is the button on an offer
         page, and the offer is the spot. */
      const ctaBtn = document.getElementById('kt-coldstart-cta');
      if (ctaBtn) ctaBtn.innerHTML = 'Secure my spot <span aria-hidden="true">&rarr;</span>';
      /* The account form and its 1-2-3 tracker belong to the pay-now path.
         A cold visitor makes their account in the app, one screen along. */
      ['kt-track', 'kt-acct'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });

      /* THE OFFER ITSELF still has to be on the page. The priced card and the
         what-you-get list live inside #kt-step2, which stays hidden until an
         account exists -- built for the pay-now path, where by definition one
         does. Hiding the account form therefore stripped the page back to a
         headline and a button, and the pitch this link exists to make went
         with it.
         So: reveal the offer, keep the checkout button out of it. A cold
         visitor has no account to check out with -- their next step is the
         Secure my spot button, which is moved below the offer so the page
         reads pitch first, ask second. */
      const step2 = document.getElementById('kt-step2');
      if (step2) {
        step2.hidden = false;
        /* Overwrite the priced card. initActivate() fills it for the renewal
           flow; a cold visitor is not buying anything and must not be shown a
           rate as though they were. */
        const badge = document.getElementById('kt-offer-badge');
        const price = document.getElementById('kt-offer-price');
        const terms = document.getElementById('kt-offer-terms');
        const save  = document.getElementById('kt-offer-save');
        const was   = document.getElementById('kt-offer-was');
        if (badge) badge.textContent = `\u2605 ${FREE_MONTHS} months free`;
        if (price) price.innerHTML = `Free<span>&nbsp;for 6 months</span>`;
        if (terms) terms.textContent = `then ${AFTER_FREE_RATE} \u00b7 no card up front \u00b7 cancel anytime`;
        if (save)  save.textContent  = 'No card on file, so nothing renews on its own — when the six months are up you decide.';
        if (was)   was.hidden = true;
        // "Account ready for x@y" — there is no account yet.
        const who = document.getElementById('kt-acct-who');
        if (who) who.hidden = true;
        const wrap = document.getElementById('kt-checkout-wrap');
        if (wrap) wrap.hidden = true;
        step2.parentNode.insertBefore(step2, cold);   // offer above the ask
      }
      const signin = document.getElementById('kt-coldstart-signin');
      if (signin) signin.addEventListener('click', () => {
        cold.hidden = true;
        ['kt-track', 'kt-acct'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = false; });
        /* Undo the pitch layout. revealStep2() only toggles #kt-acct and
           #kt-step2 -- it has never known about the checkout button, because
           on the pay-now path nothing ever hides it. Leaving it hidden here
           would drop someone who signed in onto the offer with no way to buy,
           and step2 must go back to hidden so revealStep2() is the thing that
           opens it, after the account is confirmed. */
        const step2b = document.getElementById('kt-step2');
        if (step2b) step2b.hidden = true;
        const wrapB = document.getElementById('kt-checkout-wrap');
        if (wrapB) wrapB.hidden = false;
        const whoB = document.getElementById('kt-acct-who');
        if (whoB) whoB.hidden = false;
        const ht2 = document.getElementById('kt-head-title');
        const hs2 = document.getElementById('kt-head-sub');
        if (ht2) ht2.textContent = 'Build your profile';
        if (hs2) hs2.textContent = 'Sign in and pick up where you left off — six months free, no card required.';
        if (mode === 'signup') toggle.click();          // open on sign-in, not signup
        document.getElementById('ka-email')?.focus();
      });
    }
  };

  const existing = loadSession();
  if (existing && existing.user && existing.user.email) {
    /* A session only proves they have an ACCOUNT. Someone who signed up and
       has not built anything was still being sent straight to checkout --
       the exact pay-first order this page just stopped doing for everyone
       else. Ask what they actually have.
       Errs toward building: if the lookup fails they get the free path, never
       an unexpected paywall. */
    fetch(`${KINDRED_AUTH.url}/rest/v1/therapists?select=name,specialties&limit=1`, {
      headers: { apikey: KINDRED_AUTH.key, Authorization: `Bearer ${existing.access_token}` }
    })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => {
        const t = rows && rows[0];
        const built = !!(t && t.name && String(t.name).trim() && (t.specialties || []).length);
        if (built) revealStep2(existing.user.email);
        else ktGoBuildProfile();
      })
      .catch(ktGoBuildProfile);
  } else {
    /* Arriving from the APP with ?email= means they built a profile there and
       pressed Activate. They have an account -- they just cannot prove it
       here, because the app and the site are different origins and the
       session does not cross. Opening on "create account" would offer them a
       second one and fail with "already registered". Default to sign-in. */
    const fromApp = new URLSearchParams(location.search).get('email');

    /* COLD VISITOR -- no account on this browser and none passed from the app.
       This link went out to real people before onboarding was reordered, so it
       cannot be retired; it just has to stop being the one path that still
       charges first. These are cold contacts: the least context and the most
       scepticism of anyone who reaches this page, and the hardest possible
       audience to ask for a card before showing them anything.

       So they get what the website button gives -- build a profile free -- and
       the account and checkout steps stay out of the way until there is
       something to activate. Anyone who already has a profile can still sign
       in from here. */
    /* Named so the signed-in branch can use it too: whether someone sees the
       free path depends on having a PROFILE, not on having a session. */
    if (!fromApp) ktGoBuildProfile();

    if (fromApp) {
      /* They built a profile in the app and pressed Activate. This page is now
         a checkout counter for them, not a pitch: the hero sells something
         they have already bought into, and the tracker was telling them their
         profile still lay ahead when it is finished and waiting. */
      const hero = document.getElementById('kt-hero');
      if (hero) hero.hidden = true;
      const labels = ['Profile', 'Activate', 'Go live'];
      document.querySelectorAll('#kt-track .kt-track-label')
        .forEach((el, i) => { el.textContent = labels[i]; });
      const steps = document.querySelectorAll('.kt-track-step');
      if (steps[0]) { steps[0].classList.add('done'); steps[0].classList.remove('on'); }
      if (steps[1]) steps[1].classList.add('on');
      const ht = document.getElementById('kt-head-title');
      const hs = document.getElementById('kt-head-sub');
      if (ht) ht.textContent = 'Your profile is ready';
      if (hs) hs.textContent = 'We check your license and identity next. Your first six months are free, then $29.99/month — no card required now.';

      const f = document.getElementById('ka-email');
      if (f) f.value = fromApp;
      mode = 'signin';
      submit.innerHTML = 'Sign in &amp; continue <span aria-hidden="true">→</span>';
      toggle.textContent = 'Create an account instead';
      document.querySelector('#kt-acct h2').textContent = 'Sign in to activate';
      document.querySelector('.kt-acct-sub').textContent =
        'Your profile is saved. Sign in with the password you chose in the app and we\u2019ll start your membership.';
      document.getElementById('ka-pass').setAttribute('autocomplete', 'current-password');
    }
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'signup' ? 'signin' : 'signup';
    submit.innerHTML = (mode === 'signup' ? 'Create account &amp; continue' : 'Sign in &amp; continue') + ' <span aria-hidden="true">→</span>';
    toggle.textContent = mode === 'signup' ? 'Sign in instead' : 'Create an account instead';
    document.querySelector('#kt-acct h2').textContent = mode === 'signup' ? 'First, a way to sign back in' : 'Sign in to Kindred';
    document.getElementById('ka-pass').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
    err.hidden = true;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('ka-email').value.trim();
    const pass  = document.getElementById('ka-pass').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      err.textContent = 'Please enter a valid email.'; err.hidden = false; return;
    }
    if (mode === 'signup' && pass.length < 8) {
      err.textContent = 'Please use at least 8 characters.'; err.hidden = false; return;
    }
    err.hidden = true;
    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing you in…';

    try {
      if (mode === 'signup') {
        const data = await authPost('/signup', { email, password: pass });
        saveSession(data);   /* null-safe: returns null when confirmation is required */
        /* The number that matters: a therapist account actually exists now.
           Counted here rather than on the button, so an attempt that failed
           validation or hit "already registered" is not counted as a signup. */
        if (window.kTrack) window.kTrack('therapist_account_created');
        /* Whether or not Supabase requires email confirmation, the account now
           exists — so we let them continue to payment rather than stranding
           them at a "check your inbox" wall with their card already out. */
      } else {
        const data = await authPost('/token?grant_type=password', { email, password: pass });
        saveSession(data);
        if (window.kTrack) window.kTrack('therapist_signed_in');
      }
      revealStep2(email);
    } catch (ex) {
      const m = String(ex.message || '');
      if (/already registered|already been registered/i.test(m)) {
        err.innerHTML = 'That email already has a Kindred account — <button type="button" class="kt-linkish" id="ka-jump">sign in instead</button>.';
        err.hidden = false;
        const jump = document.getElementById('ka-jump');
        if (jump) jump.addEventListener('click', () => toggle.click());
      } else if (/invalid login/i.test(m)) {
        err.textContent = 'That email and password don’t match. Try again, or create an account.';
        err.hidden = false;
      } else {
        err.textContent = m;
        err.hidden = false;
      }
    } finally {
      submit.disabled = false;
      submit.innerHTML = (mode === 'signup' ? 'Create account &amp; continue' : 'Sign in &amp; continue') + ' <span aria-hidden="true">→</span>';
    }
  });
})();
