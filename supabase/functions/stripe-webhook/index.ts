// ============================================================================
// Kindred — Stripe webhook  (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Turns a completed Stripe checkout into a LIVE listing, with no manual step.
//
// Flow:
//   therapist pays on kindredtherapymatch.com/activate.html
//     -> Stripe fires checkout.session.completed to this function
//     -> we verify the signature, then flip therapists.published = true
//
// It also keeps the listing honest over time: if a subscription lapses, is
// cancelled, or payment fails, the profile unlists automatically (nothing is
// deleted — they just stop appearing in matching).
//
// SECURITY
//   * The Stripe signature is verified before we trust ANY payload. Without
//     that, anyone who found this URL could publish themselves for free.
//   * SUPABASE_SERVICE_ROLE_KEY is injected by Supabase into this function's
//     environment. It never reaches a browser. The DB functions it calls are
//     revoked from anon/authenticated for the same reason.
//
// Required secrets (set once, see DEPLOY.md):
//   STRIPE_SECRET_KEY       sk_live_...
//   STRIPE_WEBHOOK_SECRET   whsec_...      (from the Stripe webhook endpoint)
// Provided automatically by Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
// Deno has no Node crypto, so Stripe needs its SubtleCrypto provider for
// signature verification (and constructEventAsync rather than constructEvent).
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Call a SECURITY DEFINER function with the service role. */
async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed: HTTP ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  // Must read the RAW body — parsing it first would break signature verification.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    // Bad signature = not actually from Stripe. Refuse it.
    console.error('signature verification failed:', (err as Error).message);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  try {
    switch (event.type) {
      // ---- payment succeeded: activate the listing -------------------------
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        // activate.js sets client_reference_id to the therapist's email; fall
        // back to whatever they typed into Stripe.
        const email = s.client_reference_id || s.customer_details?.email || null;
        const result = await rpc('stripe_activate_listing', {
          p_email: email,
          p_customer_id: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
          p_subscription_id: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null,
          p_status: 'active',
        });
        if (!result?.ok) {
          // Paid but unmatched (e.g. checked out with a different email).
          // Loud log so it can be reconciled by hand — never silently dropped.
          console.error('ACTIVATION NEEDS MANUAL REVIEW', { email, session: s.id, result });
        } else {
          console.log('listing activated', result);
        }
        break;
      }

      // ---- subscription changed: keep the listing in sync ------------------
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
        const result = await rpc('stripe_sync_subscription', {
          p_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
          p_subscription_id: sub.id,
          p_status: status,
        });
        console.log('subscription synced', { status, result });
        break;
      }

      // ---- payment failed: unlist until they fix it ------------------------
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const result = await rpc('stripe_sync_subscription', {
          p_customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
          p_subscription_id: typeof inv.subscription === 'string' ? inv.subscription : null,
          p_status: 'past_due',
        });
        console.log('payment failed, listing paused', result);
        break;
      }

      default:
        // Ignore everything else, but 200 so Stripe doesn't retry forever.
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry with backoff, which is what we want for a
    // transient DB hiccup.
    console.error('handler error:', (err as Error).message);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
