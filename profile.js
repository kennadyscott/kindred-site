/* ===========================================================================
   Kindred — the therapist's public WEBSITE (steps 2+3 of the website build)
   ---------------------------------------------------------------------------
   Renders the therapist's chosen template (t.site.template, picked on the
   Website tab; 'warm' when unset) around their published profile. Their nav
   is the only permanent chrome; Kindred appears exactly four ways — the
   ?from=browse return ribbon, the verified badge, the contact CTA into
   matching, and the footer mark.

   ONE renderer, six token sets — the same architecture as the concept, so a
   template can never lose content: her words were never inside the template.

   Data comes from `therapists_public` via the anon key. The view excludes
   ideal_client and license_number, and everyone unverified, reported, removed
   or with website_live off (0042/0043/0045) — this file never makes a safety
   decision.

   URL forms:
     profile.html?t=maya-chen          (slug)
     profile.html?id=<uuid>            (pre-slug fallback)
     ...&from=browse                   (arrived from Kindred: show the ribbon)
   =========================================================================== */

const SUPABASE_URL = 'https://izukppxgoerqtustfbnk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk';
const APP_URL = '/app/';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- templates: tokens + hero + layout ----------------
   Kept in step with SITE_TEMPLATES in app/app.js — the picker's ids must
   resolve here. An unknown id falls back to warm rather than to a blank
   page, so a stale row can never 404 someone's website. */
const TEMPLATES = {
  warm: { hero: 'aside', layout: 'sidebar',
    t: { ground:'#FAF4EC', panel:'#FFFFFF', ink:'#3A2C40', soft:'#77687D', accent:'#A85B44',
         line:'#ECDFD2', r:'18px', btnInk:'#FFF8F2', navCase:'uppercase',
         display:"'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif" },
    extra: '.aside-card,.w-prompt,.contact-in{box-shadow:0 6px 22px rgba(58,44,64,.06)}' },
  quiet: { hero: 'statement', layout: 'column',
    t: { ground:'#FBFAF6', panel:'#F3F1E8', ink:'#2E2B26', soft:'#6E675C', accent:'#5F7355',
         line:'#E5E0D4', r:'3px', btnInk:'#FBFAF6', navCase:'none',
         display:"Georgia, 'Iowan Old Style', serif", body:"Georgia, 'Iowan Old Style', serif" },
    extra: '.hero-statement .big{font-style:italic}.section-title{font-style:italic;letter-spacing:0;text-transform:none;font-size:1.02rem;color:var(--accent)}.navlink{text-transform:none;letter-spacing:0;font-size:.9rem}' },
  practice: { hero: 'compact', layout: 'column',
    t: { ground:'#FFFFFF', panel:'#F7F9FA', ink:'#1E2A32', soft:'#5C6B75', accent:'#2E5E6B',
         line:'#DCE4E8', r:'8px', btnInk:'#F4FAFC', navCase:'uppercase',
         display:"'Inter', -apple-system, sans-serif", body:"'Inter', -apple-system, sans-serif" },
    extra: 'h1,h2{letter-spacing:-.02em;font-weight:700}.section-title{color:var(--accent)}' },
  editorial: { hero: 'cover', layout: 'splits',
    t: { ground:'#FFFFFF', panel:'#F6F4F1', ink:'#141414', soft:'#5F5F5F', accent:'#8A4B2D',
         line:'#E6E2DD', r:'0px', btnInk:'#FFF9F4', navCase:'uppercase',
         display:"'Iowan Old Style', 'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif" },
    extra: 'h2{letter-spacing:-.02em}.section-title{letter-spacing:.16em}' },
  evening: { hero: 'dusk', layout: 'column',
    t: { ground:'#1A1622', panel:'#241E2F', ink:'#ECE7F0', soft:'#A99FB6', accent:'#C9A46A',
         line:'#373044', r:'12px', btnInk:'#1A1622', navCase:'uppercase',
         display:"'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif" },
    extra: '.section-title{color:var(--accent);letter-spacing:.2em}.badge{background:rgba(201,164,106,.12);color:var(--accent);border-color:rgba(201,164,106,.3)}img{filter:saturate(.85) brightness(.94)}' },
  sunrise: { hero: 'arch', layout: 'banded',
    t: { ground:'#FBECDC', panel:'#F6E0CB', ink:'#3B2620', soft:'#6B4F46', accent:'#D8412A',
         line:'#EBD5BE', r:'24px', btnInk:'#FFF6EE', navCase:'uppercase',
         display:"'Didot', 'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif" },
    extra: '.btn,.navcta{border-radius:999px}.chip{background:#FFF6EC;border:1px solid #EFD9C2}h1,h2{letter-spacing:.005em}.section-title{color:var(--accent);letter-spacing:.22em}.topnav{border-bottom:none}.badge{background:#FFF6EC;color:#8a3a20;border-color:#EFD9C2}' }
};

function baseCSS(t) {
  return `
  #site{background:${t.ground};color:${t.ink};font-family:${t.body};font-size:16.5px;line-height:1.65}
  #site{--accent:${t.accent};--line:${t.line};--soft:${t.soft};--panel:${t.panel};--r:${t.r};
        --display:${t.display};--body:${t.body}}
  #site img{max-width:100%;display:block}
  #site a:not([class]){color:var(--accent)}
  #site h1,#site h2{font-family:var(--display);font-weight:500;line-height:1.15;margin:0;letter-spacing:-.01em}
  #site h2{font-size:clamp(1.4rem,2.5vw,1.8rem);margin-bottom:1rem}
  #site p{margin:0 0 1em}
  .soft{color:var(--soft)}
  .measure{max-width:640px;margin:0 auto;padding:0 22px}
  .wide{max-width:1040px;margin:0 auto;padding:0 22px}
  #site section{margin:0 0 3.4rem;scroll-margin-top:74px}
  .section-title{font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
                 color:var(--soft);margin:0 0 1.2rem}
  .topnav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:1.3rem;
          padding:.85rem 22px;background:${t.ground};border-bottom:1px solid var(--line)}
  .navbrand{font-family:var(--display);font-size:1.08rem;color:inherit;text-decoration:none;
            margin-right:auto;white-space:nowrap}
  .navlinks{display:flex;gap:1.15rem;align-items:center;overflow-x:auto;scrollbar-width:none;min-width:0}
  .navlinks::-webkit-scrollbar{display:none}
  .navlink{font-size:.76rem;font-weight:700;letter-spacing:.09em;text-transform:${t.navCase};
           color:var(--soft);text-decoration:none;white-space:nowrap}
  .navlink:hover{color:var(--accent)}
  .navcta{flex:none;font-size:.78rem;font-weight:700;text-decoration:none;color:${t.btnInk};
          background:var(--accent);padding:.55em 1.2em;border-radius:999px;white-space:nowrap}
  .btn{display:inline-block;background:var(--accent);color:${t.btnInk};text-decoration:none;
       font-weight:700;font-size:.95rem;padding:.85em 1.7em;border-radius:${t.r === '0px' ? '0' : '999px'}}
  .badge{display:inline-flex;align-items:center;gap:.4em;font-size:.78rem;font-weight:600;
         padding:.34em .85em;border-radius:999px;background:rgba(95,115,85,.12);color:#4d5f45;
         border:1px solid rgba(95,115,85,.25)}
  .chip{display:inline-block;font-size:.78rem;font-weight:600;padding:.32em .8em;
        border-radius:999px;background:var(--panel);border:1px solid var(--line);margin:0 5px 6px 0}
  .facts{display:flex;flex-wrap:wrap;gap:.4em 1.4em;font-size:.92rem;color:var(--soft)}
  .paused{background:var(--panel);border:1px solid var(--line);border-radius:12px;
          padding:.7rem .9rem;font-size:.85rem;color:var(--soft);margin:0 0 1rem}
  .statement{font-family:var(--display);font-style:italic;font-size:1.3rem;line-height:1.5}
  .w-prompt{background:var(--panel);border-radius:var(--r);padding:1.3rem 1.4rem;margin-bottom:1.5rem}
  .w-prompt .q{font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
               color:var(--soft);margin:0 0 .45rem}
  .w-prompt p:last-child{margin-bottom:0}
  [data-rhythm="flow"] .w-prompt{background:transparent;border-radius:0;padding:1.3rem 0 0;
                                 border-top:1px solid var(--line)}
  .w-photo{margin:1.8rem 0}
  .w-photo img,.w-video video{width:100%;height:auto;max-height:600px;object-fit:cover;border-radius:var(--r)}
  .kv{display:flex;flex-direction:column;gap:.55em;font-size:.95rem}
  .kv span{color:var(--soft)}
  .kv b{font-weight:600;color:${t.ink}}
  .contact-in{text-align:center;background:var(--panel);border-radius:var(--r);
              padding:clamp(2rem,5vw,3rem) 1.6rem}
  [data-rhythm="flow"] .contact-in{background:transparent;border-top:1px solid var(--line);border-radius:0}
  .band .contact-in{background:transparent;border:none;padding:0}
  .contact-in h2{margin-bottom:.5rem}
  .contact-in .soft{max-width:46ch;margin:0 auto 1.5rem}
  .fine{font-size:.8rem;color:var(--soft);margin-top:.9rem}
  #site footer{border-top:1px solid var(--line);margin-top:3.4rem;padding:1.6rem 0 2.2rem}
  .band-foot footer{border-top:none;margin-top:0}
  .foot{display:flex;align-items:center;gap:1.2em;flex-wrap:wrap;font-size:.8rem;color:var(--soft);
        max-width:1040px;margin:0 auto;padding:0 22px}
  .foot a{color:var(--soft);text-decoration:none;font-weight:600}
  .foot a:hover{color:var(--accent)}
  .made{margin-left:auto;display:inline-flex;align-items:center;gap:.45em}
  .made svg{width:13px;height:13px}

  /* heroes */
  .hero{padding:clamp(2.2rem,6vw,4rem) 0 clamp(1.6rem,4vw,2.6rem)}
  .hero-statement .avatar-s{width:112px;height:112px;border-radius:50%;object-fit:cover;margin-bottom:1.3rem}
  .hero-statement .name{font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;color:var(--soft);margin:0 0 1.4rem}
  .hero-statement .big{font-family:var(--display);font-size:clamp(1.8rem,4.4vw,2.8rem);line-height:1.22;margin:0 0 1.5rem;text-wrap:balance}
  .hero-compact{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:2.4rem;align-items:center}
  .hero-compact h1{font-size:clamp(1.8rem,4vw,2.4rem)}
  .hero-compact .pic{order:2}
  .hero-compact .pic img{width:100%;aspect-ratio:5/6;object-fit:cover;border-radius:12px}
  .hero-dusk{text-align:center}
  .hero-dusk .avatar{width:118px;height:118px;border-radius:50%;object-fit:cover;margin:0 auto 1.4rem;border:2px solid var(--accent)}
  .hero-dusk h1{font-size:clamp(1.9rem,4.2vw,2.6rem)}
  .hero-dusk .facts{justify-content:center}
  .hero-cover{position:relative}
  .hero-cover img.cover{width:100%;height:min(56vh,520px);object-fit:cover}
  .hero-cover .scrim{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,.62))}
  .hero-cover .on-img{position:absolute;left:0;right:0;bottom:0;padding:2rem;color:#fff}
  .hero-cover .on-img h1{font-size:clamp(2rem,5.5vw,3.6rem);color:#fff}
  .hero-cover .on-img .facts{color:rgba(255,255,255,.85)}
  .cover-avatar{width:86px;height:86px;border-radius:50%;object-fit:cover;
                border:3px solid rgba(255,255,255,.85);margin-bottom:.9rem}
  .pull{font-size:clamp(1.4rem,3vw,2rem);line-height:1.3;font-family:var(--display);
        font-style:italic;max-width:820px;margin:0 auto;text-align:center}
  .hero-arch{display:grid;grid-template-columns:minmax(0,.88fr) minmax(0,1.12fr);align-items:center;
             gap:clamp(2rem,5vw,5rem);max-width:1040px;margin:0 auto;padding:0 22px}
  .hero-arch .media{aspect-ratio:4/5;overflow:hidden;border-radius:0 260px 260px 0;background:var(--panel);
                    margin-left:calc(-1 * (22px + max(0px,(100vw - 1040px)/2)))}
  .hero-arch .media img{width:100%;height:100%;object-fit:cover;object-position:center 22%}
  .hero-arch .body{padding:clamp(2.2rem,6vw,4rem) 0}
  .hero-arch h1{font-size:clamp(2.1rem,5.2vw,3.4rem);margin-bottom:.3em}
  .hero-arch .tag{font-family:var(--display);font-style:italic;font-size:clamp(1.02rem,2vw,1.28rem);
                  color:var(--accent);margin:0 0 1.2rem;max-width:44ch}

  /* layouts */
  .layout-sidebar{display:grid;grid-template-columns:330px minmax(0,1fr);gap:3rem;align-items:start;
                  max-width:1040px;margin:2.4rem auto 0;padding:0 22px}
  .aside-card{position:sticky;top:74px;background:var(--panel);border-radius:var(--r);
              padding:1.5rem;text-align:center}
  .aside-card img{width:100%;aspect-ratio:6/7;object-fit:cover;border-radius:var(--r);margin-bottom:1.1rem}
  .aside-fallback{width:100%;aspect-ratio:6/7;border-radius:var(--r);margin-bottom:1.1rem;
                  display:flex;align-items:center;justify-content:center;background:var(--line);
                  font-family:var(--display);font-size:3rem;color:var(--soft)}
  .aside-card h1{font-size:1.6rem}
  .aside-card .facts{flex-direction:column;gap:.45em;align-items:center;margin:1rem 0}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,5vw,4rem);align-items:center;
         max-width:1040px;margin:0 auto 4.5rem;padding:0 22px}
  .split img{width:100%;height:100%;max-height:520px;object-fit:cover;border-radius:var(--r)}
  .split.rev .s-img{order:2}
  .split .q{font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);margin:0 0 .5rem}
  .split .a{font-family:var(--display);font-size:clamp(1.1rem,2vw,1.4rem);line-height:1.5}
  .band{padding:clamp(2.6rem,6vw,4.2rem) 0}
  .band section{margin:0}
  .band.alt{background:var(--panel)}
  .band.loud{background:var(--accent);color:${t.btnInk}}
  .band.loud .section-title,.band.loud h2,.band.loud .soft{color:${t.btnInk}}
  .band.loud .section-title{opacity:.8}
  .band.loud .btn{background:${t.ground};color:var(--accent)}
  .band.loud .fine{color:${t.btnInk};opacity:.8}

  @media (max-width:760px){
    .layout-sidebar{grid-template-columns:1fr;gap:1.6rem;margin-top:1.4rem}
    .aside-card{position:static}
    .aside-card img,.aside-fallback{max-width:280px;margin-left:auto;margin-right:auto}
    .hero-compact{grid-template-columns:1fr;gap:1.2rem}
    .hero-compact .pic{order:-1}
    .hero-compact .pic img{max-width:300px;aspect-ratio:1/1}
    .split{grid-template-columns:1fr;gap:1.4rem;margin-bottom:3rem}
    .split.rev .s-img{order:0}
    .hero-arch{grid-template-columns:1fr;gap:0;padding:0}
    .hero-arch .media{margin:0;border-radius:0;aspect-ratio:4/3.4;max-height:62vh;width:100%}
    .hero-arch .body{padding:2rem 22px}
    #site section{margin-bottom:2.6rem}
  }`;
}

function showMissing() {
  $('kp-loading').hidden = true;
  $('kp-missing').hidden = false;
}

/* Which therapist this page is for. Three doors, and the PATH is now the
   main one: a prerendered page lives at /<slug>/ with no query string at all,
   so reading only ?t= made every generated page render blank. The router and
   the app still arrive with ?t= or ?id=, so both keep working. */
function profileRef() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('t');
  const id = params.get('id');
  if (slug || id) return { slug, id };
  const seg = location.pathname.replace(/^\/+|\/+$/g, '');
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(seg) ? { slug: seg, id: null } : { slug: null, id: null };
}

async function fetchProfile() {
  const { slug, id } = profileRef();
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

/* Per-therapist metadata. Social crawlers do not run JS — the static tags in
   profile.html are what link previews see until prerendering (step 5). Google
   renders JS, so search results use these. */
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
  const photo = t.photo || '';
  if (/^https?:\/\//i.test(photo)) {
    set('meta[property="og:image"]', 'content', photo);
    set('meta[name="twitter:image"]', 'content', photo);
  }
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  /* The pretty path is the address (404.html routes it back here on entry),
     so it is also the canonical -- one URL per therapist everywhere. */
  link.href = t.slug ? location.origin + '/' + t.slug
                     : location.origin + location.pathname + location.search;
  const og = document.head.querySelector('meta[property="og:url"]');
  if (og) og.setAttribute('content', link.href);
}

const filled = v => !!(v && String(v).trim());

/* The feed, exactly as arranged, no cap. Legacy fallback for pre-0024 rows. */
function feedBlocks(t) {
  const blocks = Array.isArray(t.blocks) ? t.blocks : [];
  const out = [];
  blocks.forEach(b => {
    if (!b) return;
    if (b.type === 'prompt' && filled(b.answer)) out.push({ kind: 'prompt', q: b.question || '', a: b.answer });
    else if (b.type === 'photo' && filled(b.src)) out.push({ kind: 'photo', src: b.src });
    else if (b.type === 'video' && /^https?:\/\//i.test(b.src || '')) out.push({ kind: 'video', src: b.src });
  });
  if (out.length) return out;
  const legacy = [];
  if (filled(t.prompt_style)) legacy.push({ kind: 'prompt', q: 'My therapy style is…', a: t.prompt_style });
  if (filled(t.prompt_fit)) legacy.push({ kind: 'prompt', q: 'You may be right for each other if…', a: t.prompt_fit });
  if (filled(t.prompt_first_session)) legacy.push({ kind: 'prompt', q: 'First sessions feel like…', a: t.prompt_first_session });
  (Array.isArray(t.optional_prompts) ? t.optional_prompts : []).forEach(p => {
    if (p && p.question && filled(p.answer)) legacy.push({ kind: 'prompt', q: p.question, a: p.answer });
  });
  const persona = t.persona || {};
  if (filled(persona.inOffice)) legacy.push({ kind: 'prompt', q: 'Who I am in the office…', a: persona.inOffice });
  if (filled(persona.outOfOffice)) legacy.push({ kind: 'prompt', q: 'Who I am out of the office…', a: persona.outOfOffice });
  return legacy;
}

function feedItemHtml(b, name) {
  if (b.kind === 'prompt') return `<div class="w-prompt"><p class="q">${esc(b.q)}</p><p>${esc(b.a)}</p></div>`;
  if (b.kind === 'photo') return `<figure class="w-photo" style="margin-left:0;margin-right:0"><img src="${esc(b.src)}" alt="A photo shared by ${esc(name)}" loading="lazy"></figure>`;
  return `<figure class="w-video" style="margin-left:0;margin-right:0"><video src="${esc(b.src)}" controls preload="metadata" playsinline></video></figure>`;
}

const PAYMENT_LABELS = {
  superbills: 'Superbills for out-of-network', cash_only: 'Cash pay',
  hsa_fsa: 'HSA / FSA accepted', sliding_scale: 'Sliding scale available'
};

const leafSvg = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 8 C44 8 46 20 46 34 L46 66 C46 82 42 92 30 92 C24 92 22 84 22 66 L22 34 C22 16 24 8 30 8 Z" fill="#8a6f96"/><path d="M52 34 C52 20 62 10 78 8 C80 22 72 36 56 38 C53.5 38.3 52 37 52 34 Z" fill="#B8A3C4"/><path d="M52 46 C68 46 78 56 80 72 C66 74 52 66 52 50 Z" fill="#BE765F"/></svg>`;

function render(t) {
  const name = t.name || 'Kindred Therapist';
  const first = name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || name;
  const creds = (t.credentials && t.credentials.length) ? t.credentials.join(' • ') : 'Licensed Therapist';
  setSocialMeta(t, name, creds);

  const tplId = (t.site && TEMPLATES[t.site.template]) ? t.site.template : 'warm';
  const tpl = TEMPLATES[tplId];

  /* the template's whole look, injected once per render */
  let styleEl = document.getElementById('site-css');
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'site-css'; document.head.appendChild(styleEl); }
  styleEl.textContent = baseCSS(tpl.t) + (tpl.extra || '');
  document.body.style.background = tpl.t.ground;

  const initials = name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean)
    .map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'K';
  const loc = t.location || {};
  const formats = t.formats || [];
  const formatLabel = formats.length >= 2 ? 'Online & In-person'
    : formats.includes('video') ? 'Online only'
    : formats.includes('in-person') ? 'In-person only' : null;

  const factBits = [];
  if (loc.city || loc.state) factBits.push(`\u{1F4CD} ${esc([loc.city, loc.state].filter(Boolean).join(', '))}`);
  if (formatLabel) factBits.push(`\u{1F3A5} ${formatLabel}`);
  if (t.rate_min) factBits.push(`\u{1F4B5} $${esc(t.rate_min)}/session`);
  const factsRow = `<div class="facts">${factBits.map(f => `<span>${f}</span>`).join('')}</div>`;
  const badge = t.license_verified ? `<span class="badge">✓ License verified with the state board</span>` : '';
  const chips = (t.specialties || []).slice(0, 6).map(x => `<span class="chip">${esc(x)}</span>`).join('');
  const paused = t.accepting === false
    ? `<p class="paused">Not taking new clients right now — you can still say hello and ask about the waitlist.</p>` : '';

  const blocks = feedBlocks(t);
  const feed = blocks.map(b => feedItemHtml(b, name)).join('');
  const coverSrc = (blocks.find(b => b.kind === 'photo' && /^https?:/i.test(b.src)) || blocks.find(b => b.kind === 'photo') || {}).src || t.photo || '';

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
  const nav = `
  <nav class="topnav">
    <a class="navbrand" href="#top">${esc(name)}</a>
    <div class="navlinks">
      ${feed ? `<a class="navlink" href="#story">My story</a>` : ''}
      ${kv.length ? `<a class="navlink" href="#practical">Good to know</a>` : ''}
    </div>
    <a class="navcta" href="#contact">Contact</a>
  </nav>`;

  const storySec = feed ? `<section id="story"><p class="section-title">Get to know ${esc(first)}</p>${feed}</section>` : '';
  const kvSec = kv.length ? `<section id="practical"><p class="section-title">Good to know</p><div class="kv">${kv.join('')}</div></section>` : '';
  const contactSec = `
    <section id="contact"><div class="contact-in">
      <h2>Ready when you are.</h2>
      <p class="soft">A few questions first, so ${esc(first)} knows you two are likely to fit — then the conversation is yours.</p>
      <a class="btn" href="${esc(cta)}">See if we’re a fit</a>
      <p class="fine">Free for clients, always. Takes about three minutes.</p>
    </div></section>`;
  const footer = `
  <footer><div class="foot">
    <span>&copy; ${new Date().getFullYear()} ${esc(name)}, ${esc(creds)}</span>
    <a href="mailto:info@kindredtherapymatch.com?subject=${encodeURIComponent('Report profile: ' + (t.slug || t.user_id))}">Report this profile</a>
    <a class="made" href="/" title="Kindred">${leafSvg} Made with Kindred</a>
  </div></footer>`;

  const heroPortrait = t.photo
    ? `<img src="${esc(t.photo)}" alt="${esc(name)}">`
    : `<div class="aside-fallback">${esc(initials)}</div>`;

  let body;
  if (tpl.layout === 'sidebar') {
    body = `${nav}
    <div class="layout-sidebar" id="top">
      <aside class="aside-card">
        ${heroPortrait}
        <h1>${esc(name)}</h1>
        <p class="soft" style="margin:.2rem 0 0">${esc(creds)}${(t.pronouns && t.show_pronouns !== false) ? ' · ' + esc(t.pronouns) : ''}</p>
        <div class="facts">${factBits.map(f => `<span>${f}</span>`).join('')}</div>
        ${badge}
        ${chips ? `<div style="margin:1rem 0 .4rem">${chips}</div>` : ''}
        ${paused}
        <a class="btn" href="${esc(cta)}" style="margin-top:.6rem">Say hello</a>
      </aside>
      <main>
        ${t.best_for ? `<section><p class="statement">${esc(t.best_for)}</p></section>` : ''}
        ${storySec}${kvSec}${contactSec}
      </main>
    </div>
    ${footer}`;
  } else if (tpl.layout === 'splits') {
    const photos = blocks.filter(b => b.kind === 'photo');
    const prompts = blocks.filter(b => b.kind === 'prompt');
    const rows = photos.map((ph, i) => `
      <div class="split${i % 2 ? ' rev' : ''}">
        <div class="s-img"><img src="${esc(ph.src)}" alt="" loading="lazy"></div>
        <div><p class="q">${esc(prompts[i] ? prompts[i].q : '')}</p>
             <p class="a">${esc(prompts[i] ? prompts[i].a : '')}</p></div>
      </div>`).join('');
    const rest = prompts.slice(photos.length).map(pr => feedItemHtml(pr, name)).join('');
    const others = blocks.filter(b => b.kind === 'video').map(b => feedItemHtml(b, name)).join('');
    body = `${nav}
    <div class="hero-cover" id="top">
      ${coverSrc ? `<img class="cover" src="${esc(coverSrc)}" alt="">` : ''}
      <div class="scrim"></div>
      <div class="on-img wide">
        ${t.photo ? `<img class="cover-avatar" src="${esc(t.photo)}" alt="${esc(name)}">` : ''}
        <h1>${esc(name)}</h1>
        <div class="facts">${esc(creds)}${(loc.city || loc.state) ? ' · ' + esc([loc.city, loc.state].filter(Boolean).join(', ')) : ''}${formatLabel ? ' · ' + formatLabel : ''}</div>
      </div>
    </div>
    ${t.best_for ? `<section class="measure" style="padding-top:2.6rem"><p class="pull">“${esc(String(t.best_for).replace(/\.$/, ''))}.”</p>
      <div style="text-align:center;margin-top:1.3rem">${badge}${paused ? `<div class="measure" style="margin-top:.8rem">${paused}</div>` : ''}</div></section>` : ''}
    ${rows ? `<section id="story"><p class="section-title wide" style="padding:0 22px">Get to know ${esc(first)}</p>${rows}
      <div class="measure" data-rhythm="flow">${rest}${others}</div></section>`
      : storySec ? `<div class="measure">${storySec}</div>` : ''}
    ${kvSec ? `<div class="measure">${kvSec}</div>` : ''}
    <div class="measure">${contactSec}</div>
    ${footer}`;
  } else if (tpl.layout === 'banded') {
    body = `${nav}
    <div class="hero-arch" id="top">
      <div class="media">${t.photo ? `<img src="${esc(t.photo)}" alt="${esc(name)}">` : `<div class="aside-fallback" style="height:100%;border-radius:0">${esc(initials)}</div>`}</div>
      <div class="body">
        <p class="section-title">${esc(creds)}${(loc.city || loc.state) ? ' · ' + esc([loc.city, loc.state].filter(Boolean).join(', ')) : ''}</p>
        <h1>Hi, I’m ${esc(first)}</h1>
        ${t.best_for ? `<p class="tag">${esc(t.best_for)}</p>` : ''}
        ${factsRow}
        <div style="margin:1.1rem 0 1.4rem">${badge}</div>
        ${paused}
        <a class="btn" href="${esc(cta)}">Let’s do this</a>
      </div>
    </div>
    ${storySec ? `<div class="band alt"><div class="measure">${storySec}</div></div>` : ''}
    ${kvSec ? `<div class="band"><div class="measure">${kvSec}</div></div>` : ''}
    <div class="band loud"><div class="measure">${contactSec}</div></div>
    <div class="band-foot">${footer}</div>`;
  } else {
    /* column: quiet (statement) / practice (compact) / evening (dusk) */
    let hero;
    if (tpl.hero === 'compact') {
      hero = `<div class="hero measure hero-compact" id="top">
        <div class="pic">${heroPortrait.replace('aside-fallback', 'aside-fallback')}</div>
        <div>
          <h1>${esc(name)}</h1>
          <p class="soft" style="margin:.4rem 0 .9rem">${esc(creds)}${(t.pronouns && t.show_pronouns !== false) ? ' · ' + esc(t.pronouns) : ''}</p>
          ${factsRow}
          <div style="margin:1.1rem 0 1.3rem">${badge}</div>
          ${paused}
          <a class="btn" href="${esc(cta)}">Say hello</a>
        </div>
      </div>`;
    } else if (tpl.hero === 'dusk') {
      hero = `<div class="hero measure hero-dusk" id="top">
        ${t.photo ? `<img class="avatar" src="${esc(t.photo)}" alt="${esc(name)}">` : ''}
        <p class="section-title" style="margin-bottom:.6rem">${esc(creds)}</p>
        <h1>${esc(name)}</h1>
        ${t.best_for ? `<p style="font-style:italic;color:var(--soft);margin:.9rem auto 1.2rem;max-width:40ch">${esc(t.best_for)}</p>` : ''}
        ${factsRow}
        <div style="margin-top:1.3rem">${badge}</div>
        ${paused ? `<div style="margin-top:1rem">${paused}</div>` : ''}
      </div>`;
    } else {
      hero = `<div class="hero measure hero-statement" id="top">
        ${t.photo ? `<img class="avatar-s" src="${esc(t.photo)}" alt="${esc(name)}">` : ''}
        <p class="name">${esc(name)} · ${esc(creds)}</p>
        ${t.best_for ? `<p class="big">${esc(t.best_for)}</p>` : `<p class="big">${esc(name)}</p>`}
        ${factsRow}
        <div style="margin-top:1.4rem">${badge}</div>
        ${paused ? `<div style="margin-top:1rem">${paused}</div>` : ''}
      </div>`;
    }
    const rhythm = tplId === 'quiet' ? ' data-rhythm="flow"' : '';
    body = `${nav}${hero}
    <div class="measure"${rhythm}>
      ${storySec}${kvSec}${contactSec}
    </div>
    ${footer}`;
  }

  $('site').innerHTML = body;
  $('kp-loading').hidden = true;
  $('kp-missing').hidden = true;
  $('site').hidden = false;
}

(async () => {
  if (new URLSearchParams(location.search).get('from') === 'browse') {
    $('kt-ribbon').hidden = false;
  }
  /* PREVIEW MODE. The therapist portal opens this page in an iframe and posts
     the row it would save, so a therapist can see their website before they
     are verified -- which is exactly when they are choosing a look, and when
     therapists_public deliberately does not have them. No fetch, no address-bar
     rewrite, and every later message re-renders, so switching template in the
     portal repaints instantly.

     Only same-origin messages are honoured. The portal is the only sender and
     it is on our origin; anything else is ignored outright. */
  if (new URLSearchParams(location.search).get('preview') === '1') {
    document.documentElement.setAttribute('data-preview', '1');
    window.addEventListener('message', ev => {
      if (ev.origin !== location.origin) return;
      const d = ev.data;
      if (!d || d.kind !== 'kindred-preview' || !d.row) return;
      $('kp-loading').hidden = true;
      $('kp-missing').hidden = true;
      render(d.row);
    });
    /* Say so if the portal never speaks, rather than spinning forever. */
    setTimeout(() => {
      if ($('site').hidden) { $('kp-loading').hidden = true; showMissing(); }
    }, 6000);
    return;
  }

  const t = await fetchProfile();
  if (!t) { showMissing(); return; }
  render(t);
  /* Show the pretty URL whichever door they came in through. replaceState
     only -- no reload, no history spam.

     Skipped when we are already there, which is now the common case: the
     prerendered page IS /<slug>/, and rewriting it to /<slug> would drop the
     trailing slash Pages actually serves, so a reload would take a needless
     301 and any relative asset would resolve one directory too high. */
  if (t.slug && /^[a-z0-9][a-z0-9-]{1,80}$/.test(t.slug) && !document.documentElement.hasAttribute('data-preview')) {
    const here = location.pathname.replace(/\/+$/, '');
    if (here !== '/' + t.slug) {
      const keep = new URLSearchParams(location.search).get('from') === 'browse' ? '?from=browse' : '';
      try { history.replaceState(null, '', '/' + t.slug + keep); } catch (e) { /* file:// etc. */ }
    }
  }
})();
