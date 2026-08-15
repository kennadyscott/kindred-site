/* ===========================================================================
   Kindred — the therapist's public WEBSITE (step 2 of the website build)
   ---------------------------------------------------------------------------
   This is the page a therapist shares as "my website". It renders the Warm
   template around their published profile: their nav is the only permanent
   chrome, and Kindred shows up exactly four ways — the ?from=browse return
   ribbon, the verified badge, the contact CTA into matching, and the footer
   mark.

   Data comes from the `therapists_public` VIEW via the anon key. That view is
   deliberately incapable of returning `ideal_client` or `license_number`, and
   it excludes anyone unverified, reported, removed or with website_live off
   (0042/0043) — so this file never has to make a safety decision.

   URL forms:
     profile.html?t=maya-chen        (slug — the pretty one therapists share)
     profile.html?id=<uuid>          (works before slugs are backfilled)
     ...&from=browse                 (arrived from Kindred — show the ribbon)
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

/* Per-therapist page metadata.

   READ THIS BEFORE TRUSTING IT: Facebook, iMessage, Slack, WhatsApp and
   LinkedIn do NOT run JavaScript. They read the raw HTML and stop, so this
   cannot fix link previews — the static tags in profile.html are what those
   crawlers see. Google DOES render JavaScript, so search results use these;
   for a directory, that is the half that pays. Real per-therapist previews
   arrive with prerendering (step 5). */
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
  const loc = t.location || {};
  const city = [loc.city, loc.state].filter(Boolean).join(', ');
  const title = `${name}${creds ? ', ' + creds : ''}${city ? ' — ' + city : ''} | Kindred`;
  const desc = (t.best_for && String(t.best_for).trim())
    || (t.prompt_fit && String(t.prompt_fit).trim())
    || `${name} is a therapist on Kindred${city ? ' in ' + city : ''}. See how they work and whether you two would be a fit.`;
  document.title = title;
  set('meta[name="description"]', 'content', desc);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', desc);
  set('meta[property="og:url"]', 'content', location.href);
  set('meta[name="twitter:card"]', 'content', 'summary_large_image');
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', desc);
  /* Only a real URL: photos still stored as base64 data URLs cannot be
     fetched by a scraper. Works automatically as photos migrate to Storage. */
  const photo = t.photo || '';
  if (/^https?:\/\//i.test(photo)) {
    set('meta[property="og:image"]', 'content', photo);
    set('meta[name="twitter:image"]', 'content', photo);
  }
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = location.origin + location.pathname + location.search;
}

/* THE FEED — what the therapist actually built: photos and answers in the
   order they dragged into place. Rendered exactly as stored, no cap: a
   listing gets truncated, a website does not.

   The legacy path matters: `blocks` arrived in 0024, and a profile written
   before that has its answers in optional_prompts and persona with nothing in
   blocks — it would otherwise render an empty page. */
function feedHtml(t, name) {
  const promptCard = (q, a) =>
    `<div class="w-prompt"><p class="q">${esc(q)}</p><p>${esc(a)}</p></div>`;
  const filled = v => !!(v && String(v).trim());

  const blocks = Array.isArray(t.blocks) ? t.blocks : [];
  if (blocks.length) {
    const out = blocks.map(b => {
      if (!b) return '';
      if (b.type === 'prompt' && filled(b.answer)) return promptCard(b.question || '', b.answer);
      if (b.type === 'photo' && filled(b.src)) {
        /* loading=lazy pays once photos are Storage URLs; harmless on data:.
           In a non-painting context a lazy image reports naturalWidth 0 —
           that is the environment, not a broken image. */
        return `<figure class="w-photo" style="margin-left:0;margin-right:0"><img src="${esc(b.src)}" alt="A photo shared by ${esc(name)}" loading="lazy"></figure>`;
      }
      /* http(s) only — a blob: src died with the tab that made it (0038). */
      if (b.type === 'video' && /^https?:\/\//i.test(b.src || '')) {
        return `<figure class="w-video" style="margin-left:0;margin-right:0"><video src="${esc(b.src)}" controls preload="metadata" playsinline></video></figure>`;
      }
      return '';
    }).filter(Boolean);
    if (out.length) return out.join('');
  }

  const prompts = [];
  if (filled(t.prompt_style)) prompts.push(['My therapy style is…', t.prompt_style]);
  if (filled(t.prompt_fit)) prompts.push(['You may be right for each other if…', t.prompt_fit]);
  if (filled(t.prompt_first_session)) prompts.push(['First sessions feel like…', t.prompt_first_session]);
  (Array.isArray(t.optional_prompts) ? t.optional_prompts : []).forEach(p => {
    if (p && p.question && filled(p.answer)) prompts.push([p.question, p.answer]);
  });
  const persona = t.persona || {};
  if (filled(persona.inOffice)) prompts.push(['Who I am in the office…', persona.inOffice]);
  if (filled(persona.outOfOffice)) prompts.push(['Who I am out of the office…', persona.outOfOffice]);
  return prompts.map(([q, a]) => promptCard(q, a)).join('');
}

const PAYMENT_LABELS = {
  superbills: 'Superbills for out-of-network', cash_only: 'Cash pay',
  hsa_fsa: 'HSA / FSA accepted', sliding_scale: 'Sliding scale available'
};

function render(t) {
  const name = t.name || 'Kindred Therapist';
  const first = name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || name;
  const creds = (t.credentials && t.credentials.length) ? t.credentials.join(' • ') : 'Licensed Therapist';
  setSocialMeta(t, name, creds);

  const initials = name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean)
    .map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'K';
  const loc = t.location || {};
  const formats = t.formats || [];
  const formatLabel = formats.length >= 2 ? 'Online & In-person'
    : formats.includes('video') ? 'Online only'
    : formats.includes('in-person') ? 'In-person only' : null;

  const facts = [];
  if (loc.city || loc.state) facts.push(`\u{1F4CD} ${esc([loc.city, loc.state].filter(Boolean).join(', '))}`);
  if (formatLabel) facts.push(`\u{1F3A5} ${formatLabel}`);
  if (t.rate_min) facts.push(`\u{1F4B5} $${esc(t.rate_min)}/session`);

  const feed = feedHtml(t, name);
  const chips = (t.specialties || []).slice(0, 6).map(s => `<span class="chip">${esc(s)}</span>`).join('');

  /* Good to know: the practical facts, each only if it exists. Insurance is
     three-and-a-count — the 30-carrier flood never comes back. */
  const kv = [];
  const ins = (t.insurance || []).filter(Boolean);
  if (ins.length) {
    const rest = ins.length - 3;
    kv.push(`<span><b>Insurance</b> — ${esc(ins.slice(0, 3).join(', '))}${rest > 0 ? ` + ${rest} more` : ''}</span>`);
  }
  (t.payment_options || []).filter(k => k !== 'no_insurance' && PAYMENT_LABELS[k])
    .forEach(k => kv.push(`<span><b>${PAYMENT_LABELS[k]}</b></span>`));
  const langs = (t.languages || []).filter(Boolean);
  if (langs.length > 1 || (langs.length === 1 && langs[0] !== 'English')) {
    kv.push(`<span><b>Languages</b> — ${esc(langs.join(', '))}</span>`);
  }
  if (t.website) {
    const url = /^https?:\/\//i.test(t.website) ? t.website : 'https://' + t.website;
    kv.push(`<span><b>Elsewhere</b> — <a href="${esc(url)}" target="_blank" rel="noopener">${esc(t.website)}</a></span>`);
  }

  const cta = `${APP_URL}#therapist=${encodeURIComponent(t.user_id)}`;
  const navLinks = [
    feed ? `<a class="navlink" href="#story">My story</a>` : '',
    kv.length ? `<a class="navlink" href="#practical">Good to know</a>` : ''
  ].filter(Boolean).join('');

  $('site').innerHTML = `
  <nav class="topnav">
    <a class="navbrand" href="#top">${esc(name)}</a>
    <div class="navlinks">${navLinks}</div>
    <a class="navcta" href="#contact">Contact</a>
  </nav>

  <div class="layout" id="top">
    <aside class="aside-card">
      ${t.photo
        ? `<img src="${esc(t.photo)}" alt="${esc(name)}">`
        : `<div class="aside-fallback">${esc(initials)}</div>`}
      <h1>${esc(name)}</h1>
      <p class="soft" style="margin:.2rem 0 0">${esc(creds)}${(t.pronouns && t.show_pronouns !== false) ? ' · ' + esc(t.pronouns) : ''}</p>
      <div class="facts">${facts.map(f => `<span>${f}</span>`).join('')}</div>
      ${t.license_verified ? `<span class="badge">✓ License verified with the state board</span>` : ''}
      ${chips ? `<div style="margin:1rem 0 .4rem">${chips}</div>` : ''}
      ${t.accepting === false ? `<p class="paused">Not taking new clients right now — you can still say hello and ask about the waitlist.</p>` : ''}
      <a class="btn" href="${esc(cta)}" style="margin-top:.6rem">Say hello</a>
    </aside>

    <main>
      ${t.best_for ? `<section><p class="statement">${esc(t.best_for)}</p></section>` : ''}
      ${feed ? `<section id="story"><p class="section-title">Get to know ${esc(first)}</p>${feed}</section>` : ''}
      ${kv.length ? `<section id="practical"><p class="section-title">Good to know</p><div class="kv">${kv.join('')}</div></section>` : ''}
      <section id="contact">
        <div class="contact-in">
          <h2>Ready when you are.</h2>
          <p class="soft">A few questions first, so ${esc(first)} knows you two are likely to fit — then the conversation is yours.</p>
          <a class="btn" href="${esc(cta)}">See if we’re a fit</a>
          <p class="fine">Free for clients, always. Takes about three minutes.</p>
        </div>
      </section>
    </main>
  </div>

  <footer><div class="foot">
    <span>&copy; ${new Date().getFullYear()} ${esc(name)}, ${esc(creds)}</span>
    <a href="mailto:info@kindredtherapymatch.com?subject=${encodeURIComponent('Report profile: ' + (t.slug || t.user_id))}">Report this profile</a>
    <a class="made" href="/" title="Kindred"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 8 C44 8 46 20 46 34 L46 66 C46 82 42 92 30 92 C24 92 22 84 22 66 L22 34 C22 16 24 8 30 8 Z" fill="#8a6f96"/><path d="M52 34 C52 20 62 10 78 8 C80 22 72 36 56 38 C53.5 38.3 52 37 52 34 Z" fill="#B8A3C4"/><path d="M52 46 C68 46 78 56 80 72 C66 74 52 66 52 50 Z" fill="#BE765F"/></svg> Made with Kindred</a>
  </div></footer>`;

  $('kp-loading').hidden = true;
  $('kp-missing').hidden = true;   // states are exclusive, whatever order they ran in
  $('site').hidden = false;
}

(async () => {
  /* The ribbon is context, not chrome: only for visitors arriving from
     Kindred browse, and it scrolls away. Everyone else gets her site alone. */
  if (new URLSearchParams(location.search).get('from') === 'browse') {
    $('kt-ribbon').hidden = false;
  }
  const t = await fetchProfile();
  if (!t) { showMissing(); return; }
  render(t);
})();
