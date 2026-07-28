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
        discounts below ride on top of it.)
     2. Product catalog → Coupons → New coupon. Make FOUR, each with
        Duration = "Repeating" and Duration in months = 12:
             tier1 → Amount off $20.00  (=> $9.99/mo)
             tier2 → Amount off $15.00  (=> $14.99/mo)
             tier3 → Amount off $13.00  (=> $16.99/mo)
             tier4 → Amount off $10.00  (=> $19.99/mo)
        Recommended: set each coupon's "Redeem by" date to its deadline so an
        old link can't be used after that tier closes.
     3. Payment links → New → pick the $29.99/month price → under Options add
        the matching coupon → create. Once per tier, plus one with NO coupon
        for the standard rate.
     4. Paste the five URLs below.

   Leave a value as null and this page gracefully shows the "opening soon" note
   instead of a broken checkout button.
   =========================================================================== */

const PAYMENT_LINKS = {
  tier1:    null,   // $9.99  — by Sep 1    e.g. 'https://buy.stripe.com/xxxx'
  tier2:    null,   // $14.99 — by Oct 1
  tier3:    null,   // $16.99 — by Nov 1
  tier4:    null,   // $19.99 — by Dec 1
  standard: null    // $29.99 — after the ladder closes
};

/* The ladder. Keep in sync with PRICING_TIERS in the app (kindred-app/app.js). */
const PRICING_TIERS = [
  { key: 'tier1', until: new Date('2026-09-01T00:00:00'), rate: 9.99 },
  { key: 'tier2', until: new Date('2026-10-01T00:00:00'), rate: 14.99 },
  { key: 'tier3', until: new Date('2026-11-01T00:00:00'), rate: 16.99 },
  { key: 'tier4', until: new Date('2026-12-01T00:00:00'), rate: 19.99 }
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
    badge.textContent = `★ Rate rises to $${nextRate.toFixed(2)} on ${fmt(tier.until)}`;
    price.innerHTML = `$${rate.toFixed(2)}<span>/month</span>`;
    terms.textContent = `locked for ${FOUNDING_LOCK_MONTHS} months, then $${STANDARD_RATE.toFixed(2)}/month`;
  } else {
    offer.classList.add('standard');
    badge.textContent = 'Kindred Membership';
    price.innerHTML = `$${STANDARD_RATE.toFixed(2)}<span>/month</span>`;
    terms.textContent = 'billed monthly · cancel anytime';
  }

  // ---- the full ladder, so the urgency is visible and honest ----
  const ladder = document.getElementById('kt-ladder');
  if (ladder) {
    ladder.innerHTML = PRICING_TIERS.map((t, i) => {
      const past = now >= t.until;
      const current = founding && i === idx;
      return `<li class="${past ? 'past' : ''}${current ? ' current' : ''}">
        <span class="kt-ladder-when">by ${fmt(t.until)}</span>
        <span class="kt-ladder-rate">$${t.rate.toFixed(2)}/mo</span>
      </li>`;
    }).join('') + `<li class="${founding ? '' : 'current'}">
        <span class="kt-ladder-when">after December 1</span>
        <span class="kt-ladder-rate">$${STANDARD_RATE.toFixed(2)}/mo</span>
      </li>`;
  }

  // ---- wire the checkout button (or show the graceful fallback) ----
  const link = founding ? PAYMENT_LINKS[tier.key] : PAYMENT_LINKS.standard;
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
  btn.textContent = `Continue to secure checkout — $${rate.toFixed(2)}/mo`;
})();
