/* ===========================================================================
   Kindred — therapist listing activation (Stripe Payment Links)
   ---------------------------------------------------------------------------
   Therapists pay HERE, on the website — never inside the iOS app. That keeps
   Apple's cut at 0% and avoids any in-app-purchase surface in the App Store
   build. The app links here; this page hands off to Stripe.

   >>> THE ONLY THING YOU NEED TO EDIT IS THE `PAYMENT_LINKS` BLOCK BELOW. <<<

   HOW TO GET THOSE TWO LINKS (in the Stripe Dashboard, ~10 minutes):
     1. Products → Add product → "Kindred Listing".
        Add a RECURRING price: $29.99 USD / month.
     2. Product catalog → Coupons → New coupon:
          - Amount off: $10.00 USD
          - Duration:   Repeating, 3 months
          - Name it e.g. "Founding rate"
     3. Payment links → New → pick the $29.99/month price →
          under Options, add the founding coupon → create.
          Paste that URL as `founding` below.
     4. Payment links → New → same $29.99/month price, NO coupon → create.
          Paste that URL as `standard` below.

   $29.99 − $10.00 = $19.99/mo for the first 3 months, then it bills $29.99.
   Leave a value as null and this page gracefully shows the "opening soon"
   note instead of a broken checkout button.
   =========================================================================== */

const PAYMENT_LINKS = {
  founding: null,   // e.g. 'https://buy.stripe.com/xxxxxxxxxxxxxxx'
  standard: null    // e.g. 'https://buy.stripe.com/yyyyyyyyyyyyyyy'
};

/* Founding window — sign up before this date and your first 3 months are
   $19.99/mo. On or after it, everyone pays the standard rate. Keep this in
   sync with FOUNDING_DEADLINE in the app (kindred-app/app.js). */
const FOUNDING_DEADLINE = new Date('2026-12-01T00:00:00');
const FOUNDING_INTRO_RATE = 19.99;
const FOUNDING_INTRO_MONTHS = 3;
const STANDARD_RATE = 29.99;

(function initActivate() {
  const founding = new Date() < FOUNDING_DEADLINE;
  const deadlineLabel = FOUNDING_DEADLINE.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // ---- render the offer ----
  const offer = document.getElementById('kt-offer');
  const badge = document.getElementById('kt-offer-badge');
  const price = document.getElementById('kt-offer-price');
  const terms = document.getElementById('kt-offer-terms');

  if (founding) {
    badge.textContent = `★ Founding rate — join before ${deadlineLabel}`;
    price.innerHTML = `$${FOUNDING_INTRO_RATE.toFixed(2)}<span>/month</span>`;
    terms.textContent = `for your first ${FOUNDING_INTRO_MONTHS} months, then $${STANDARD_RATE.toFixed(2)}/month`;
  } else {
    offer.classList.add('standard');
    badge.textContent = 'Kindred Membership';
    price.innerHTML = `$${STANDARD_RATE.toFixed(2)}<span>/month</span>`;
    terms.textContent = 'billed monthly · cancel anytime';
  }

  // ---- wire the checkout button (or show the graceful fallback) ----
  const link = founding ? PAYMENT_LINKS.founding : PAYMENT_LINKS.standard;
  const btn = document.getElementById('kt-checkout-btn');
  const wrap = document.getElementById('kt-checkout-wrap');
  const notReady = document.getElementById('kt-notready');

  if (!link) {
    // Stripe links not configured yet — never show a dead checkout button.
    wrap.hidden = true;
    notReady.hidden = false;
    return;
  }

  // Carry the therapist's email through so Stripe prefills it and the
  // resulting subscription can be matched back to their Kindred account.
  const params = new URLSearchParams(location.search);
  const email = params.get('email');
  const url = new URL(link);
  if (email) {
    url.searchParams.set('prefilled_email', email);
    url.searchParams.set('client_reference_id', email); // ties the Stripe session to the account
  }
  btn.href = url.toString();
  btn.textContent = founding
    ? `Continue to secure checkout — $${FOUNDING_INTRO_RATE.toFixed(2)}/mo`
    : `Continue to secure checkout — $${STANDARD_RATE.toFixed(2)}/mo`;
})();
