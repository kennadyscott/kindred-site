/* ===========================================================================
   Kindred — public therapist profile (the page therapists share)
   ---------------------------------------------------------------------------
   This is the landing page for "check out my profile on Kindred". It has to
   work for someone with no app, no account, and no context — so it renders on
   the open web and funnels into matching.

   Data comes from the `therapists_public` VIEW via the anon key. That view is
   deliberately incapable of returning `ideal_client` — a therapist's private
   ideal-client spec can never leak here, by construction (see 0001/0007).
   Only published + accepting profiles are in the view at all.

   URL forms:
     profile.html?t=maya-chen     (slug — the pretty one therapists share)
     profile.html?id=<uuid>       (works before slugs are backfilled)
   =========================================================================== */

const SUPABASE_URL = 'https://izukppxgoerqtustfbnk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk';
const APP_URL = '/app/';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showMissing() {
  $('kp-loading').hidden = true;
  $('kp-missing').hidden = false;
}

async function fetchProfile() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('t');
  const id = params.get('id');
  if (!slug && !id) return null;

  const filter = slug ? `slug=eq.${encodeURIComponent(slug)}` : `user_id=eq.${encodeURIComponent(id)}`;
  const url = `${SUPABASE_URL}/rest/v1/therapists_public?${filter}&select=*&limit=1`;
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  } catch (e) {
    return null;
  }
}

function render(t) {
  const name = t.name || 'Kindred Therapist';
  const creds = (t.credentials && t.credentials.length) ? t.credentials.join(' • ') : 'Licensed Therapist';

  document.title = `${name} — Kindred`;

  // photo (or initials fallback)
  const initials = name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean)
    .map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'K';
  $('kp-photo-wrap').innerHTML = t.photo
    ? `<img class="kp-photo" src="${esc(t.photo)}" alt="${esc(name)}">`
    : `<div class="kp-photo-fallback">${esc(initials)}</div>`;

  $('kp-name').textContent = name;
  $('kp-creds').textContent = creds;
  if (t.pronouns && t.show_pronouns !== false) {
    $('kp-pronouns').textContent = t.pronouns;
    $('kp-pronouns').hidden = false;
  }
  if (t.license_number) {
    $('kp-verified-wrap').innerHTML = `<span class="kp-verified">✓ License verified via Stripe Identity</span>`;
  }

  // facts row
  const formats = t.formats || [];
  const formatLabel = formats.length >= 2 ? 'Online & In-person'
    : formats.includes('video') ? 'Online only'
    : formats.includes('in-person') ? 'In-person only' : null;
  const loc = t.location || {};
  const facts = [];
  if (loc.city || loc.state) facts.push(`📍 ${esc([loc.city, loc.state].filter(Boolean).join(', '))}`);
  if (formatLabel) facts.push(`🎥 ${formatLabel}`);
  if (t.rate_min) facts.push(`💵 $${t.rate_min}/session`);
  if (t.insurance && t.insurance.length) facts.push(`🛡️ Accepts ${esc(t.insurance.join(', '))}`);
  if (t.languages && t.languages.length > 1) facts.push(`🗣️ ${esc(t.languages.join(', '))}`);
  $('kp-facts').innerHTML = facts.map(f => `<span>${f}</span>`).join('');

  if (t.best_for) {
    $('kp-bestfor').textContent = t.best_for;
    $('kp-bestfor').hidden = false;
  }

  const specialties = t.specialties || [];
  if (specialties.length) {
    $('kp-specialties').innerHTML = specialties.slice(0, 8).map(s => `<span class="kp-tag">${esc(s)}</span>`).join('');
    $('kp-specialties-wrap').hidden = false;
  }

  // "in their words" — the prompts that make this feel like a person
  const prompts = [];
  if (t.prompt_style) prompts.push(['My therapy style is…', t.prompt_style]);
  if (t.prompt_fit) prompts.push(['You may be right for each other if…', t.prompt_fit]);
  if (t.prompt_first_session) prompts.push(['First sessions feel like…', t.prompt_first_session]);
  (Array.isArray(t.optional_prompts) ? t.optional_prompts : []).forEach(p => {
    if (p && p.question && p.answer) prompts.push([p.question, p.answer]);
  });
  const persona = t.persona || {};
  if (persona.inOffice) prompts.push(['Who I am in the office…', persona.inOffice]);
  if (persona.outOfOffice) prompts.push(['Who I am out of the office…', persona.outOfOffice]);

  if (prompts.length) {
    $('kp-prompts').innerHTML = `<p class="kp-section-title">In their words</p>` +
      prompts.slice(0, 6).map(([q, a]) =>
        `<div class="kp-prompt"><p class="kp-prompt-q">${esc(q)}</p><p class="kp-prompt-a">${esc(a)}</p></div>`
      ).join('');
  }

  // CTA — carry the therapist through so the app can surface them first
  const ref = t.slug || t.user_id;
  $('kp-cta-btn').href = `${APP_URL}/#therapist=${encodeURIComponent(t.user_id)}`;
  $('kp-cta').hidden = false;

  $('kp-loading').hidden = true;
  $('kp-card').hidden = false;
}

(async () => {
  const t = await fetchProfile();
  if (!t) { showMissing(); return; }
  render(t);
})();
