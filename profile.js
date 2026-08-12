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

/* Per-therapist page metadata.

   READ THIS BEFORE TRUSTING IT: Facebook, iMessage, Slack, WhatsApp and
   LinkedIn do NOT run JavaScript. They read the raw HTML and stop. So this
   function cannot fix link previews on any of them -- the static tags in
   profile.html are what those crawlers will always see, which is why those
   were rewritten to be a sensible generic rather than "My profile on Kindred".

   What it DOES do: Google renders JavaScript before indexing, so the title,
   description and canonical here are what search results use. For a directory
   whose whole value is being findable, that is the half that pays.

   Real per-therapist link previews need the HTML to already contain the tags,
   which means prerendering a file per therapist at build time (works on GitHub
   Pages) or moving to a host that renders on the server. Deliberately deferred
   -- it is not worth building until there are profiles worth sharing. */
function setSocialMeta(t, name, creds) {
  const set = (sel, attr, val) => {
    if (!val) return;
    let el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      const [k, v] = sel.replace(/[[\]"']/g, '').split('=');
      el.setAttribute(sel.startsWith('meta[property') ? 'property' : 'name', v || k);
      document.head.appendChild(el);
    }
    el.setAttribute(attr, val);
  };

  const loc  = t.location || {};
  const city = [loc.city, loc.state].filter(Boolean).join(', ');
  const title = `${name}${creds ? ', ' + creds : ''}${city ? ' — ' + city : ''} | Kindred`;
  /* Their own sentence first. It is the line they wrote to introduce
     themselves, so it beats anything generated from their fields. */
  const desc = (t.best_for && String(t.best_for).trim())
    || (t.prompt_fit && String(t.prompt_fit).trim())
    || `${name} is a therapist on Kindred${city ? ' in ' + city : ''}. See how they work and whether you two would be a fit.`;

  document.title = title;
  set('meta[name="description"]',       'content', desc);
  set('meta[property="og:title"]',      'content', title);
  set('meta[property="og:description"]','content', desc);
  set('meta[property="og:url"]',        'content', location.href);
  set('meta[name="twitter:card"]',      'content', 'summary_large_image');
  set('meta[name="twitter:title"]',     'content', title);
  set('meta[name="twitter:description"]','content', desc);

  /* Only a real URL. Photos are currently base64 data: URLs stored in Postgres,
     and no scraper will fetch one of those -- setting it would produce a
     broken image rather than none. Starts working by itself once photos move
     to Storage and this field holds an https URL. */
  const photo = t.photo || '';
  if (/^https?:\/\//i.test(photo)) {
    set('meta[property="og:image"]',  'content', photo);
    set('meta[name="twitter:image"]', 'content', photo);
  }

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = location.origin + location.pathname + location.search;
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
  setSocialMeta(t, name, creds);

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
  /* Keys off license_verified, not "they typed a number".

     Two things were wrong before. It tested t.license_number, which only ever
     meant a number had been entered -- and 0042 removes that column from the
     public view anyway, since the number was never displayed and had no
     business being readable with the anon key.

     And the wording was false. Stripe Identity checks a person's ID and
     selfie; it has never seen a license. The license is confirmed by a human
     against the issuing state board -- a different check, done by a different
     party, and the more meaningful of the two to say out loud on a public
     profile about someone's credentials. */
  if (t.license_verified) {
    $('kp-verified-wrap').innerHTML = `<span class="kp-verified">&#10003; License verified with the state board</span>`;
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
