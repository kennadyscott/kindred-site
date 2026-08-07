// ============================================================================
// Kindred -- create a Stripe Identity verification session
// ----------------------------------------------------------------------------
// Called by a signed-in therapist from the app. Creates a Stripe Identity
// VerificationSession, records its id against their therapist row, and returns
// the hosted URL for the app to redirect to.
//
// WHY THIS IS SERVER-SIDE
// Creating a VerificationSession requires the Stripe SECRET key. That key can
// never reach a browser, so this cannot be done from app.js.
//
// VERIFY JWT: LEAVE IT **ON** for this function.
// Unlike stripe-webhook (which Stripe calls with no Supabase token, and which
// authenticates via Stripe's own signature), this endpoint is called by a
// logged-in therapist. We need Supabase to prove who they are -- otherwise
// anyone could burn $1.50 sessions and, worse, attach a session to someone
// else's row.
//
// We deliberately do NOT trust a user_id from the request body: it is read from
// the verified JWT. A body-supplied id would let a therapist attach their own
// completed verification to a different therapist's profile.
//
// Required secrets (shared with stripe-webhook):
//   STRIPE_SECRET_KEY
// Provided automatically by Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================================

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Where Stripe sends them back to. The app reads ?identity=done and shows the
// pending state -- the flag itself is set by the webhook, never by this return.
// The app moved from a subdomain to /app/ on the main origin. The old address
// still redirects, but Stripe should send people to the real one rather than
// through a hop -- a redirect in the middle of an identity return is exactly
// where a session gets dropped.
const RETURN_URL = 'https://kindredtherapymatch.com/app/?identity=done';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // apikey must be listed: review.html / app.js send it alongside the bearer
  // token, and a header the preflight does not allow makes the browser block
  // the real request entirely -- fetch() rejects before it reaches this code.
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Service-role RPC. Same helper shape as stripe-webhook.
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
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // Identify the caller from their token -- NOT from the request body.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return new Response('Missing authorization', { status: 401, headers: CORS });

  let userId: string;
  let email: string | null = null;
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!who.ok) return new Response('Invalid session', { status: 401, headers: CORS });
    const user = await who.json();
    userId = user.id;
    email = user.email ?? null;
    if (!userId) return new Response('Invalid session', { status: 401, headers: CORS });
  } catch (_err) {
    return new Response('Invalid session', { status: 401, headers: CORS });
  }

  try {
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      // Ties the Stripe side back to a Kindred account for support/debugging.
      metadata: { kindred_user_id: userId, kindred_email: email ?? '' },
      options: {
        document: {
          // A selfie match is the point: it binds the document to the person
          // presenting it, rather than to whoever is holding a photo of an ID.
          require_matching_selfie: true,
          require_live_capture: true,
        },
      },
      return_url: RETURN_URL,
    });

    // Record which session belongs to this therapist. The webhook matches on
    // this later -- identity events carry no email.
    const attached = await rpc('stripe_attach_identity_session', {
      p_user_id: userId,
      p_session_id: session.id,
    });
    if (!attached?.ok) {
      console.error('could not attach identity session', { userId, session: session.id, attached });
      return new Response(JSON.stringify({ error: 'no_therapist_profile' }), {
        status: 409,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('identity session error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'could_not_start' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
