/* ===========================================================================
   Kindred — therapist listing activation (Stripe Payment Links)
   ---------------------------------------------------------------------------
   Therapists pay HERE, on the website — never inside the iOS app. That keeps
   Apple's cut at 0% and avoids any in-app-purchase surface in the App Store
   build. The app links here; this page hands off to Stripe.

   >>> THE ONLY THING YOU NEED TO EDIT IS THE `PAYMENT_LINKS` BLOCK BELOW. <<<

   THE OFFER — an escalating founding ladder. The earlier a therapist joins, the
   lower their rate, and they KEEP it for 12 months before moving to $29.99:
       by Sep 1 → $9.99/mo        by Nov 1 → $16.99/mo
       by Oct 1 → $14.99/mo       by Dec 1 → $19.99/mo       after → $29.99/mo

   HOW TO BUILD THIS IN STRIPE (~15 minutes):
     1. Products → Add product → "Kindred Listing".
        Add a RECURRING price: $29.99 USD / month. (Everyone lands here; the
        founding discounts ride on top of it, which is what makes the step-up
        to $29.99 automatic.)
     2. Product catalog → Coupons → New coupon. Make FOUR, each with
        Duration = "Multiple months" = 13, and a "Redeem by" date:
             $20.00 off → $9.99/mo   · redeem by Sep 1
             $15.00 off → $14.99/mo  · redeem by Oct 1
             $13.00 off → $16.99/mo  · redeem by Nov 1
             $10.00 off → $19.99/mo  · redeem by Dec 1
        The Redeem-by dates are what actually enforce the ladder, since the
        promo-code box is visible at checkout.

        WHY 13 AND NOT 12. Stripe starts the coupon clock when the
        subscription is CREATED, not at the first payment. On the 30-day
        trial link that is day 0 of the trial, so a 12-month coupon runs out
        after only 11 paid invoices. 13 gives the trial cohort a full 12
        months of paying the founding rate, and gives everyone else 13 --
        which is why the page still promises 12. Under-promise.

        COUPONS ARE IMMUTABLE. Stripe lets you edit a coupon's name and
        metadata and nothing else -- not duration, not amount. Changing 12 to
        13 means NEW coupons and NEW promotion codes; the old ones stay valid
        for anyone already on them, which is correct, since a live discount
        should never be shortened underneath someone.
     3. Create a PROMOTION CODE for each coupon (FOUNDINGSEPT, FOUNDINGOCT,
        FOUNDINGNOV, FOUNDINGDEC) and put them in PRICING_TIERS below.
     4. Payment links → New → the $29.99/month price → tick "Allow promotion
        codes" → Create link. ONE link is all we need; paste it as
        PAYMENT_LINK. (Stripe Payment Links have no attach-a-coupon option,
        which is why tiers are promo codes pre-applied via the URL.)

   Leave PAYMENT_LINK as null and this page gracefully shows the "opening soon"
   note instead of a broken checkout button.
   =========================================================================== */

/* ONE Stripe Payment Link for the $29.99/mo price, with "Allow promotion codes"
   enabled on it. Each founding tier is a promotion code we pre-apply via the
   URL (?prefilled_promo_code=…), so the therapist never types anything and the
   discount is already applied when checkout opens.
   Stripe Payment Links have no attach-a-coupon option, which is why this is
   done with promo codes rather than five separate links. */
const PAYMENT_LINK = 'https://buy.stripe.com/bJe5kD6Vs8iz2hR5dJfjG00';

/* ---- 30 days free, for outreach -------------------------------------------
   Stripe applies ONE promotion code per checkout, and the founding tier
   already uses it. So a "first month free" coupon cannot be stacked on top of
   FOUNDINGSEPT -- one would replace the other.

   A free trial is not a promotion code, it is a property of the payment link,
   so the two compose. This is the SAME $29.99 price and the SAME tier promo
   code, on a second link that carries a 30-day trial:

       days 1-30    free
       months 1-12  the founding rate they'd have got anyway
       month 13+    $29.99

   Reached by ?offer=trial30, so it is only ever what you send in outreach --
   the public activate page is untouched.

   SETUP (Stripe -> Payment links -> New):
     1. Same $29.99/month price as the link above
     2. Tick "Allow promotion codes"  (the founding code still has to apply)
     3. Under Subscription options, set a free trial of 30 days
     4. Leave "collect payment method" ON, or nothing charges at day 31
     5. Paste the link here. Until then the offer falls back to the normal
        founding flow rather than showing a dead button. */
const PAYMENT_LINK_TRIAL = 'https://buy.stripe.com/fZu6oH1B8cyP4pZ6hNfjG01';
const TRIAL_DAYS = 30;

/* The ladder. `promo` is the Stripe PROMOTION CODE for that tier; each points
   at a coupon set to "Multiple months / 12" so the rate is locked for a year
   and then steps up to $29.99 automatically.
   Keep the dates in sync with PRICING_TIERS in the app (kindred-app/app.js). */
const PRICING_TIERS = [
  { key: 'tier1', until: new Date('2026-09-01T00:00:00'), rate: 9.99,  promo: 'FOUNDINGSEPT' },
  { key: 'tier2', until: new Date('2026-10-01T00:00:00'), rate: 14.99, promo: 'FOUNDINGOCT' },
  { key: 'tier3', until: new Date('2026-11-01T00:00:00'), rate: 16.99, promo: 'FOUNDINGNOV' },
  { key: 'tier4', until: new Date('2026-12-01T00:00:00'), rate: 19.99, promo: 'FOUNDINGDEC' }
];
const STANDARD_RATE = 29.99;
const FOUNDING_LOCK_MONTHS = 12;

(function initActivate() {
  const now = new Date();
  /* Outreach offer. Falls back silently if the trial link isn't configured
     yet, so a half-finished setup can never produce a broken checkout. */
  const wantsTrial = new URLSearchParams(location.search).get('offer') === 'trial30';
  const trial = wantsTrial && !!PAYMENT_LINK_TRIAL;
  const idx = PRICING_TIERS.findIndex(t => now < t.until);
  const founding = idx !== -1;
  const tier = founding ? PRICING_TIERS[idx] : null;
  const nextRate = founding
    ? (PRICING_TIERS[idx + 1] ? PRICING_TIERS[idx + 1].rate : STANDARD_RATE)
    : null;
  const rate = founding ? tier.rate : STANDARD_RATE;
  const fmt = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // ---- render the offer ----
  const offer = document.getElementById('kt-offer');
  const badge = document.getElementById('kt-offer-badge');
  const price = document.getElementById('kt-offer-price');
  const terms = document.getElementById('kt-offer-terms');

  if (trial) {
    /* Lead with the free month, but never hide what happens after it -- the
       whole point of the offer is that the price afterwards is already good. */
    badge.textContent = `★ ${TRIAL_DAYS} days free`;
    /* The span is inline with no margin -- it works for `$9.99<span>/month`
       because a slash needs no space, and renders "Freefor 30 days" here. */
    price.innerHTML = `Free<span>&nbsp;for ${TRIAL_DAYS} days</span>`;
    terms.textContent = founding
      ? `then $${rate.toFixed(2)}/month, locked in for ${FOUNDING_LOCK_MONTHS} months · cancel anytime`
      : `then $${STANDARD_RATE.toFixed(2)}/month · cancel anytime`;
    const was = document.getElementById('kt-offer-was');
    if (was) was.hidden = true;
    /* Stated rather than calculated: the trial shifts every subsequent billing
       date, so any "you save $X in year one" figure here would be off by a
       month and wrong in a way nobody would catch. */
    const save = document.getElementById('kt-offer-save');
    if (save) {
      save.textContent = founding
        ? `Nothing to pay today. After ${TRIAL_DAYS} days it's $${rate.toFixed(2)}/month instead of $${STANDARD_RATE.toFixed(2)}.`
        : `Nothing to pay today. Cancel before day ${TRIAL_DAYS + 1} and you're never charged.`;
    }
  } else if (founding) {
    badge.textContent = '★ Founding Therapist offer';
    price.innerHTML = `$${rate.toFixed(2)}<span>/month</span>`;
    terms.textContent = `locked in for your first ${FOUNDING_LOCK_MONTHS} months`;
    const save = document.getElementById('kt-offer-save');
    if (save) save.textContent = `You save $${Math.round((STANDARD_RATE - rate) * FOUNDING_LOCK_MONTHS)} in your first year.`;
  } else {
    offer.classList.add('standard');
    badge.textContent = 'Kindred Membership';
    price.innerHTML = `$${STANDARD_RATE.toFixed(2)}<span>/month</span>`;
    terms.textContent = 'billed monthly · cancel anytime';
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
  // Pre-apply this tier's promotion code so the founding rate is already on the
  // invoice when checkout opens — the therapist never has to type a code.
  if (founding && tier.promo) url.searchParams.set('prefilled_promo_code', tier.promo);

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
     "Free for 30 days / nothing to pay today", then a button asking for $9.99.
     The trial version names what the click actually does instead. */
  btn.textContent = trial
    ? 'Secure my spot and build my profile'
    : `Continue to secure checkout — $${rate.toFixed(2)}/mo`;

  /* "You'll be billed monthly" is also wrong on the trial, and the card IS
     collected at checkout -- saying so here is better than letting them meet
     a card form they were not expecting one screen later. */
  /* The hero carries the same offer, so it has to tell the same story -- a
     hero promising "$9.99/month" above a card promising 30 days free is the
     mismatch we just removed from the button, one section higher. */
  const heroRate = document.getElementById('kt-hero-rate');
  const heroOffer = document.getElementById('kt-hero-offer');
  const heroName = document.querySelector('.kt-offer-name');
  if (heroRate) heroRate.textContent = `$${rate.toFixed(2)}`;
  if (trial && heroOffer) {
    heroOffer.innerHTML = `<b>Free for ${TRIAL_DAYS} days</b>, then $${rate.toFixed(2)}/month for your first ${FOUNDING_LOCK_MONTHS} months`;
    if (heroName) heroName.textContent = `${TRIAL_DAYS} days free \u00b7 Founding Therapist offer`;
  } else if (!founding && heroOffer) {
    heroOffer.innerHTML = `<b>$${STANDARD_RATE.toFixed(2)}</b>/month &middot; cancel anytime`;
    if (heroName) heroName.textContent = 'Kindred Membership';
  }

  /* The heading names the offer they actually clicked, so the page they land
     on matches the link that brought them. */
  const headTitle = document.getElementById('kt-head-title');
  const headSub   = document.getElementById('kt-head-sub');
  if (headTitle) {
    headTitle.textContent = trial ? `Start your ${TRIAL_DAYS} days free`
                          : founding ? 'Claim your founding rate'
                          : 'Join Kindred';
  }
  if (headSub && trial) {
    headSub.textContent = `A sign-in, then your card — about two minutes, and nothing is charged for ${TRIAL_DAYS} days. Your profile comes next, and you go live once we've checked your licence and identity.`;
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
    step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* already signed in on this browser? skip straight to membership */
  /* No profile yet, however they arrived: send them straight into building
     one. This page is the checkout counter -- standing them in front of it
     with a "build a profile first" button was an extra click on the way to
     the only thing they can actually do, and the pitch already happened on
     the landing page or in the email that brought them.

     replace() rather than assign() so Back returns them to wherever they came
     from rather than bouncing them through here again. */
  function ktGoBuildProfile() {
    location.replace('/app/#therapist-signup');
  }

  window.__ktShowColdStart = function () {
    const cold = document.getElementById('kt-coldstart');
    if (cold) {
      cold.hidden = false;
      /* The heading was written for the old order -- "a sign-in, then your
         card" -- which is now the opposite of what happens next. */
      const ht = document.getElementById('kt-head-title');
      const hs = document.getElementById('kt-head-sub');
      if (ht) ht.textContent = 'Start with your profile';
      if (hs) hs.textContent = "Build it free — about ten minutes, no card. When it's ready you activate with 30 days free, and we check your licence and identity from there.";
      ['kt-track', 'kt-acct'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
      const signin = document.getElementById('kt-coldstart-signin');
      if (signin) signin.addEventListener('click', () => {
        cold.hidden = true;
        ['kt-track', 'kt-acct'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = false; });
        const ht2 = document.getElementById('kt-head-title');
        const hs2 = document.getElementById('kt-head-sub');
        if (ht2) ht2.textContent = 'Activate your profile';
        if (hs2) hs2.textContent = 'Sign in and we\u2019ll start your membership — 30 days free, nothing charged until day 31.';
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
      if (hs) hs.textContent = 'Activate to go live. We check your licence and identity next, and nothing is charged for 30 days.';

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
