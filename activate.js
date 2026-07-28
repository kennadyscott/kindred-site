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
const PAYMENT_LINK = null;   // e.g. 'https://buy.stripe.com/xxxxxxxx'

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
  const params = new URLSearchParams(location.search);
  const email = params.get('email');
  if (email) {
    url.searchParams.set('prefilled_email', email);
    url.searchParams.set('client_reference_id', email); // ties the Stripe session to the account
  }
  btn.href = url.toString();
  btn.textContent = `Continue to secure checkout — $${rate.toFixed(2)}/mo`;
})();
