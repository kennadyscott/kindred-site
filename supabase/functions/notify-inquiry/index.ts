// ============================================================================
// Kindred -- "a client sent an inquiry" email, and the first-client tripwire
// ----------------------------------------------------------------------------
// Called by a Supabase Database Webhook on INSERT into client_inquiries.
// A webhook, not a browser call, on purpose: the alert must not depend on the
// visitor's tab surviving the moment after they hit send.
//
// VERIFY JWT: turn it OFF (a database webhook sends no Supabase user token),
// and set NOTIFY_SECRET instead. The webhook is configured with a matching
// x-kindred-secret header; without it this endpoint would be an open
// email-sending relay for anyone who found the URL.
//
// Secrets (same three as notify-signup, plus the service role):
//   RESEND_API_KEY             from resend.com
//   NOTIFY_TO                  where alerts go (personal address)
//   NOTIFY_FROM                a verified sender
//   NOTIFY_SECRET              must match the webhook header
//   SUPABASE_URL               provided by the platform
//   SUPABASE_SERVICE_ROLE_KEY  provided by the platform; never leaves this file
// ============================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const NOTIFY_TO = Deno.env.get('NOTIFY_TO') ?? '';
const NOTIFY_FROM = Deno.env.get('NOTIFY_FROM') ?? 'Kindred <onboarding@resend.dev>';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* Insert a marker and report whether WE were the one who inserted it. The
   database decides, so two webhooks firing at once cannot both win, and a
   retry of the same delivery cannot send a second email. */
async function claimOnce(key: string): Promise<boolean> {
  if (!SB_URL || !SB_SERVICE) return false;
  const res = await fetch(`${SB_URL}/rest/v1/ops_notifications`, {
    method: 'POST',
    headers: {
      apikey: SB_SERVICE,
      Authorization: `Bearer ${SB_SERVICE}`,
      'Content-Type': 'application/json',
      // ignore-duplicates: a conflict returns 200 with an empty array rather
      // than an error, which is exactly the "someone else got there" signal.
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    console.error('claimOnce failed:', res.status, await res.text());
    return false;
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function send(subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: NOTIFY_FROM, to: [NOTIFY_TO], subject, html }),
  });
  if (!res.ok) console.error('resend failed:', res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!NOTIFY_SECRET || req.headers.get('x-kindred-secret') !== NOTIFY_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  if (!RESEND_API_KEY || !NOTIFY_TO) {
    console.error('notify-inquiry: RESEND_API_KEY or NOTIFY_TO missing; skipped');
    return new Response(JSON.stringify({ skipped: 'not_configured' }), { status: 200 });
  }

  /* ==========================================================================
     CONTENT-FREE, AND HERE IT IS NOT A STYLE CHOICE.
     The webhook posts {type, table, record} and `record` is a client inquiry:
     an email address and a message about why someone is seeking therapy. That
     is PHI. Resend has no BAA with Kindred, so a single field lifted out of
     that record into a subject line is a disclosure -- a violation with
     nothing to do with the database, arrived at by making an email "more
     useful".

     So the body is never parsed. Not into a variable, not for logging, not
     "just the id". The only thing this function knows is that a row appeared,
     which is all the alert needs to say.
     ========================================================================== */

  const tripwire = await claimOnce('first_client');

  if (tripwire) {
    await send(
      'FIRST CLIENT — Kindred is now holding client data',
      `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2c40;">
        <h2 style="color:#8a2f1d;margin:0 0 12px;">Someone just contacted a therapist through Kindred.</h2>
        <p style="margin:0 0 14px;"><strong>This is the first one.</strong> Kindred is now storing
        client data, which means the compliance posture stopped being theoretical the moment
        this email was sent.</p>
        <p style="margin:0 0 14px;">Worth confirming today, not this month:</p>
        <ul style="margin:0 0 18px;padding-left:20px;">
          <li>The BAA with Supabase is signed and countersigned</li>
          <li>Supabase is on a paid plan &mdash; the free tier keeps no backups and auto-pauses after 7 days</li>
          <li>Someone knows what to do if this data is ever exposed</li>
        </ul>
        <p style="margin:0;">
          <a href="https://kindredtherapymatch.com/app/"
             style="display:inline-block;background:#8a2f1d;color:#fff;text-decoration:none;
                    padding:11px 20px;border-radius:999px;font-weight:600;">Open Kindred</a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#77687d;">Nothing about the person or their
        message is in this email, and never will be.</p>
      </div>`
    );
  }

  await send(
    'A new inquiry is waiting',
    `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2c40;">
      <h2 style="color:#422448;margin:0 0 12px;">Someone reached out to a therapist</h2>
      <p style="margin:0 0 18px;">An inquiry arrived through a therapist's page. It is waiting
      in their Inquiries, behind sign-in.</p>
      <p style="margin:0;">
        <a href="https://kindredtherapymatch.com/app/"
           style="display:inline-block;background:#422448;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:999px;font-weight:600;">Open Kindred</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#77687d;">Who it was and what they said are
      deliberately not in this email.</p>
    </div>`
  );

  return new Response(JSON.stringify({ ok: true, tripwire }), { status: 200 });
});
