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

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Shared-secret check. Constant-time comparison is overkill here, but an
  // unguarded endpoint is not: this sends mail on demand.
  if (!NOTIFY_SECRET || req.headers.get('x-kindred-secret') !== NOTIFY_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: Record<string, any> = {};
  try { payload = await req.json(); } catch (_err) { /* fall through to empty */ }

  // Supabase webhooks post {type, table, record, old_record}
  const r = payload.record ?? {};
  const name = r.name || '(no name yet)';
  const license = r.license_number || '(none given)';
  const states = Array.isArray(r.license_states) ? r.license_states.join(', ') : '(none)';

  if (!RESEND_API_KEY || !NOTIFY_TO) {
    // Do not fail the webhook over configuration -- log loudly and return 200
    // so Supabase does not retry an email that can never send.
    console.error('notify-signup: RESEND_API_KEY or NOTIFY_TO missing; skipped', { name });
    return new Response(JSON.stringify({ skipped: 'not_configured' }), { status: 200 });
  }

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.6;color:#3a2c40;">
      <h2 style="color:#422448;margin:0 0 12px;">New therapist signup</h2>
      <table style="border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 14px 4px 0;color:#6b5a70;">Name</td><td><strong>${esc(name)}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#6b5a70;">License</td><td>${esc(license)}</td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#6b5a70;">States</td><td>${esc(states)}</td></tr>
      </table>
      <p style="margin:18px 0 8px;">They will not appear to clients until their license is verified
      against the state board and their ID is confirmed.</p>
      <p style="margin:0;">
        <a href="https://kindredtherapymatch.com/admin.html"
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
        subject: `New therapist signup: ${name}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error('resend failed:', res.status, await res.text());
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    console.log('signup notification sent', { name });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('notify-signup error:', (err as Error).message);
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
});
