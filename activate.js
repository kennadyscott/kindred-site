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
        Duration = "Multiple months" = 12, and a "Redeem by" date:
             $20.00 off → $9.99/mo   · redeem by Sep 1
             $15.00 off → $14.99/mo  · redeem by Oct 1
             $13.00 off → $16.99/mo  · redeem by Nov 1
             $10.00 off → $19.99/mo  · redeem by Dec 1
        The Redeem-by dates are what actually enforce the ladder, since the
        promo-code box is visible at checkout.
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

  if (founding) {
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

  if (!PAYMENT_LINK) {
    // Stripe link not configured yet — never show a dead checkout button.
    wrap.hidden = true;
    notReady.hidden = false;
    return;
  }

  const url = new URL(PAYMENT_LINK);
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
  btn.textContent = `Continue to secure checkout — $${rate.toFixed(2)}/mo`;
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
  const existing = loadSession();
  if (existing && existing.user && existing.user.email) {
    revealStep2(existing.user.email);
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'signup' ? 'signin' : 'signup';
    submit.innerHTML = (mode === 'signup' ? 'Create account &amp; continue' : 'Sign in &amp; continue') + ' <span aria-hidden="true">→</span>';
    toggle.textContent = mode === 'signup' ? 'Sign in instead' : 'Create an account instead';
    document.querySelector('#kt-acct h2').textContent = mode === 'signup' ? 'Create your Kindred account' : 'Sign in to Kindred';
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
        /* Whether or not Supabase requires email confirmation, the account now
           exists — so we let them continue to payment rather than stranding
           them at a "check your inbox" wall with their card already out. */
      } else {
        const data = await authPost('/token?grant_type=password', { email, password: pass });
        saveSession(data);
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
