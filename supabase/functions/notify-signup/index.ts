// ============================================================================
// Kindred -- "a therapist just signed up" email
// ----------------------------------------------------------------------------
// Called by a Supabase Database Webhook on INSERT into therapists. Sends one
// email so a new signup does not sit unreviewed.
//
// VERIFY JWT: turn it OFF (a database webhook sends no Supabase user token),
// and set NOTIFY_SECRET instead. The webhook is configured with a matching
// x-kindred-secret header; without it this endpoint would be an open
// email-sending relay for anyone who found the URL.
//
// Secrets:
//   RESEND_API_KEY   from resend.com
//   NOTIFY_TO        where to send, e.g. kennady.nickell@gmail.com (personal, NOT the ClearK12 work address)
//   NOTIFY_FROM      a verified sender, e.g. "Kindred <alerts@kindredtherapymatch.com>"
//   NOTIFY_SECRET    any long random string; must match the webhook header
// ============================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const NOTIFY_TO = Deno.env.get('NOTIFY_TO') ?? '';
const NOTIFY_FROM = Deno.env.get('NOTIFY_FROM') ?? 'Kindred <onboarding@resend.dev>';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Shared-secret check. Constant-time comparison is overkill here, but an
  // unguarded endpoint is not: this sends mail on demand.
  if (!NOTIFY_SECRET || req.headers.get('x-kindred-secret') !== NOTIFY_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  /* The body is not read at all. The webhook posts {type, table, record}, and
     `record` is the therapist row -- but this email says nothing about them,
     so the row never enters scope. Pulling the name into a variable "just in
     case" is how it reaches a subject line six months from now. The
     shared-secret header above is the authentication; the body adds nothing. */

  if (!RESEND_API_KEY || !NOTIFY_TO) {
    // Do not fail the webhook over configuration -- log loudly and return 200
    // so Supabase does not retry an email that can never send.
    console.error('notify-signup: RESEND_API_KEY or NOTIFY_TO missing; skipped');
    return new Response(JSON.stringify({ skipped: 'not_configured' }), { status: 200 });
  }

  /* ============================================================================
     CONTENT-FREE BY RULE. No notification email carries anything about a
     person -- no name, no license, no reason, no message. It says only THAT
     something happened and links to a page behind sign-in.

     This particular email is about a therapist, which is business data and not
     PHI, so it is not itself a HIPAA problem. It is the template every future
     notification will be copied from, and the next one is "a client sent you a
     message". The moment a client's name reaches a subject line, PHI has left
     Kindred's infrastructure through Resend, a vendor with no BAA -- a
     violation with nothing to do with the database, arrived at by copying a
     pattern that looked like plumbing.

     Cheaper to make the pattern right while the only email is a harmless one.
     Audit logs are the opposite case and stay detailed: they live in Supabase,
     a BAA covers them, and HIPAA requires them.
     ============================================================================ */
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2c40;">
      <h2 style="color:#422448;margin:0 0 12px;">A new therapist is waiting for review</h2>
      <p style="margin:0 0 18px;">Someone has finished signing up. They will not appear to
      clients until their license is verified against the state board and their ID is
      confirmed.</p>
      <p style="margin:0;">
        <a href="https://kindredtherapymatch.com/review"
           style="display:inline-block;background:#422448;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:999px;font-weight:600;">Open the review queue</a>
      </p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        subject: 'A new therapist is waiting for review',
        html,
      }),
    });
    if (!res.ok) {
      console.error('resend failed:', res.status, await res.text());
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    console.log('signup notification sent');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('notify-signup error:', (err as Error).message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
