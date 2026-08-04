// ============================================================================
// Kindred -- admin API
// ----------------------------------------------------------------------------
// The only bridge between review.html and the service-role functions.
//
// WHY THIS EXISTS AT ALL
// verify_therapist_license() and the review queue are service-role only. The
// service_role key bypasses every RLS policy on every table, so it can never
// sit in a browser -- review.html would become a public master key. This
// function holds the key instead, and only acts after proving who is asking.
//
// TWO CHECKS, BOTH REQUIRED
//   1. Supabase verifies the JWT (leave Verify JWT ON for this function)
//   2. we check that token's email against ADMIN_EMAILS
// The email comes from /auth/v1/user using the caller's own token -- never
// from the request body, which the caller controls.
//
// Secrets:
//   ADMIN_EMAILS   comma-separated allowlist, e.g. "kennady.nickell@gmail.com" (personal, NOT the ClearK12 work address)
// Provided automatically by Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // apikey must be listed: review.html / app.js send it alongside the bearer
  // token, and a header the preflight does not allow makes the browser block
  // the real request entirely -- fetch() rejects before it reaches this code.
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  // ---- who is asking? (from the token, not the body) ----------------------
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  let email: string;
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!who.ok) return json({ error: 'unauthorized' }, 401);
    const user = await who.json();
    email = (user.email ?? '').toLowerCase();
  } catch (_err) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Fail closed: an empty or unset allowlist admits nobody. A misconfigured
  // deploy should lock the admin out, never open the door.
  if (!email || !ADMIN_EMAILS.includes(email)) {
    console.warn('admin-api: rejected non-admin', { email });
    return json({ error: 'forbidden' }, 403);
  }

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_err) { /* action-less call */ }
  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'counts':
        return json({ ok: true, counts: await rpc('admin_review_counts', {}) });

      case 'queue': {
        const filter = ['pending', 'verified', 'rejected', 'all'].includes(body.filter) ? body.filter : 'pending';
        return json({ ok: true, rows: await rpc('admin_review_queue', { p_filter: filter }) });
      }

      case 'verify_license': {
        if (!body.email) return json({ error: 'email_required' }, 400);
        if (!body.state) return json({ error: 'state_required' }, 400);
        // Per state: a therapist licensed in TX and CA holds two licences, and
        // verifying one must never vouch for the other.
        const result = await rpc('verify_therapist_license', {
          p_email: String(body.email),
          p_state: String(body.state),
          p_verifier: email,          // recorded as who approved it
        });
        console.log('license verified', { by: email, subject: body.email, result });
        return json({ ok: true, result });
      }

      case 'reject_license': {
        if (!body.email) return json({ error: 'email_required' }, 400);
        if (!body.state) return json({ error: 'state_required' }, 400);
        if (!body.reason || !String(body.reason).trim()) return json({ error: 'reason_required' }, 400);
        const result = await rpc('reject_therapist_license', {
          p_email: String(body.email),
          p_state: String(body.state),
          p_reason: String(body.reason),
          p_verifier: email,
        });
        console.log('license REJECTED', { by: email, subject: body.email, result });
        return json({ ok: true, result });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    console.error('admin-api error:', (err as Error).message);
    return json({ error: 'server_error' }, 500);
  }
});
