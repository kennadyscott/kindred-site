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

/* The same server-controlled flag the app reads. clientDataPersistence is off
   until the BAA is countersigned, and while it is off this page must not offer
   a form that would store a client's email -- so the contact section falls
   back to the button it has always had. Flipping the flag in config.json turns
   the form on everywhere with no redeploy, which is the whole point of it. */
let KINDRED_FLAGS = { clientDataPersistence: false };
const FLAGS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? '/app/config.json'
  : 'https://kindredtherapymatch.com/app/config.json';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- templates: tokens + hero + layout ----------------
   Kept in step with SITE_TEMPLATES and SITE_PALETTES in app/app.js — the
   pickers' ids must resolve here. An unknown id falls back rather than to a
   blank page, so a stale row can never 404 someone's website. */
/* ---------------------------------------------------------------------------
   FORMAT AND COLOUR ARE SEPARATE THINGS.
   They used to be one object per template, which meant liking Sunrise's shape
   but not its coral left you nowhere to go. A layout now owns structure and
   type; a palette owns the seven colours; a therapist picks one of each.

   Every palette is contrast-checked once, here, rather than trusting a
   therapist to know that pale grey on cream is unreadable. That is the whole
   reason this is a fixed set and not a colour picker.

   Back-compatible: site.template still names the layout, and a row with no
   site.palette resolves to that layout's native palette -- which is exactly
   what it rendered before.
   --------------------------------------------------------------------------- */
const PALETTES = {
  warm:      { name:'Warm',      ground:'#FAF4EC', panel:'#FFFFFF', ink:'#3A2C40', soft:'#77687D', accent:'#A85B44', line:'#ECDFD2', btnInk:'#FFF8F2' },
  quiet:     { name:'Sage',      ground:'#FBFAF6', panel:'#F3F1E8', ink:'#2E2B26', soft:'#6E675C', accent:'#5F7355', line:'#E5E0D4', btnInk:'#FBFAF6' },
  practice:  { name:'Clinic',    ground:'#FFFFFF', panel:'#F7F9FA', ink:'#1E2A32', soft:'#5C6B75', accent:'#2E5E6B', line:'#DCE4E8', btnInk:'#F4FAFC' },
  editorial: { name:'Paper',     ground:'#FFFFFF', panel:'#F6F4F1', ink:'#141414', soft:'#5F5F5F', accent:'#8A4B2D', line:'#E6E2DD', btnInk:'#FFF9F4' },
  evening:   { name:'Evening',   ground:'#1A1622', panel:'#241E2F', ink:'#ECE7F0', soft:'#A99FB6', accent:'#C9A46A', line:'#373044', btnInk:'#1A1622',
               /* Dark ground: full-strength photos glare against it. */
               extra:'img{filter:saturate(.85) brightness(.94)}' },
  sunrise:   { name:'Sunrise',   ground:'#FBECDC', panel:'#F6E0CB', ink:'#3B2620', soft:'#6B4F46', accent:'#C63A22', line:'#EBD5BE', btnInk:'#FFF6EE' }
  /* Sunrise's accent was #D8412A, which put its button label at 4.18 against
     the coral and the accent itself at 3.85 on the ground -- both under AA.
     #C63A22 is the smallest darkening that clears 4.5 on each and keeps the
     coral. Pre-existing; found when these palettes were first contrast-checked. */
};

const LAYOUTS = {
  warm: { hero:'aside', layout:'sidebar', palette:'warm',
    r:'18px', navCase:'uppercase',
    display:"'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif",
    extra: '.aside-card,.w-prompt,.contact-in{box-shadow:0 6px 22px rgba(58,44,64,.06)}' },
  quiet: { hero:'statement', layout:'column', palette:'quiet',
    r:'3px', navCase:'none',
    display:"Georgia, 'Iowan Old Style', serif", body:"Georgia, 'Iowan Old Style', serif",
    extra: '.hero-statement .big{font-style:italic}.section-title{font-style:italic;letter-spacing:0;text-transform:none;font-size:1.3rem;font-weight:600;color:var(--accent);margin-bottom:1.4rem}.navlink{text-transform:none;letter-spacing:0;font-size:.9rem}' },
  practice: { hero:'compact', layout:'rail', palette:'practice',
    r:'8px', navCase:'uppercase',
    display:"'Inter', -apple-system, sans-serif", body:"'Inter', -apple-system, sans-serif",
    extra: 'h1,h2{letter-spacing:-.02em;font-weight:700}.section-title{color:var(--accent)}' },
  editorial: { hero:'cover', layout:'splits', palette:'editorial',
    r:'0px', navCase:'uppercase',
    display:"'Iowan Old Style', 'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif",
    extra: 'h2{letter-spacing:-.02em}.section-title{letter-spacing:.16em}' },
  evening: { hero:'dusk', layout:'panels', palette:'evening',
    r:'12px', navCase:'uppercase',
    display:"'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif",
    /* Was rgba(201,164,106,...) -- the accent written out longhand, which stayed
       gold when the palette changed. color-mix keeps it tied to the token. */
    extra: '.section-title{color:var(--accent);letter-spacing:.2em}.badge{background:color-mix(in srgb, var(--accent) 12%, transparent);color:var(--accent);border-color:color-mix(in srgb, var(--accent) 30%, transparent)}' },
  sunrise: { hero:'arch', layout:'banded', palette:'sunrise',
    r:'24px', navCase:'uppercase',
    display:"'Didot', 'Literata', Georgia, serif", body:"'Inter', -apple-system, sans-serif",
    /* Same story: #FFF6EC / #EFD9C2 / #8a3a20 were Sunrise's own colours baked
       into the layout, so any other palette rendered mismatched chips. */
    extra: '.btn,.navcta{border-radius:999px}.chip{background:var(--panel);border:1px solid var(--line)}h1,h2{letter-spacing:.005em}.section-title{color:var(--accent);letter-spacing:.22em}.topnav{border-bottom:none}.badge{background:var(--panel);color:var(--accent);border-color:var(--line)}' }
};

/* One resolved object with the shape render() already expects, so nothing
   downstream of here had to change. */
function resolveTheme(site) {
  const s   = (site && typeof site === 'object') ? site : {};
  const lay = LAYOUTS[s.template] || LAYOUTS.warm;
  const pal = PALETTES[s.palette] || PALETTES[lay.palette];
  return {
    hero: lay.hero, layout: lay.layout,
    t: { ground:pal.ground, panel:pal.panel, ink:pal.ink, soft:pal.soft,
         accent:pal.accent, line:pal.line, btnInk:pal.btnInk,
         r:lay.r, navCase:lay.navCase, display:lay.display, body:lay.body },
    extra: (lay.extra || '') + (pal.extra || '')
  };
}

function baseCSS(t) {
  return `
  #site{background:${t.ground};color:${t.ink};font-family:${t.body};font-size:16.5px;line-height:1.65}
  #site{--accent:${t.accent};--line:${t.line};--soft:${t.soft};--panel:${t.panel};--r:${t.r};
        --display:${t.display};--body:${t.body}}
  #site img{max-width:100%;display:block}
  /* Embedded: the app supplies the chrome, so the page supplies none. */
  [data-embed="1"] .topnav{display:none}
  [data-embed="1"] #site footer{margin-top:2rem}
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
  .navlinks{display:flex;gap:1.15rem;align-items:center;min-width:0}
  .navburger{display:none;flex:none;background:none;border:0;cursor:pointer;
             padding:.5rem;width:38px;height:38px}
  .navburger span{display:block;height:2px;border-radius:2px;background:var(--soft);
                  margin:4px 0;transition:transform .18s ease,opacity .18s ease}
  .topnav.open .navburger span:nth-child(1){transform:translateY(6px) rotate(45deg)}
  .topnav.open .navburger span:nth-child(2){opacity:0}
  .topnav.open .navburger span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
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
  /* ---- drawers + two-column, added for the website redesign -------------
     Themed entirely through the template's own custom properties, so all six
     templates get them without a per-template rule. */
  .w-drawer{border-bottom:1px solid var(--line)}
  .w-drawer:first-of-type{border-top:1px solid var(--line)}
  .w-drawer>summary{list-style:none;cursor:pointer;display:flex;align-items:center;
    justify-content:space-between;gap:1rem;padding:1.05rem 0;font-family:var(--display);
    font-size:1.06rem;line-height:1.4;color:var(--ink)}
  .w-drawer>summary::-webkit-details-marker{display:none}
  .w-drawer>summary:hover{color:var(--accent)}
  .w-drawer>summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
  .w-caret{flex:0 0 auto;width:10px;height:10px;border-right:2px solid var(--soft);
    border-bottom:2px solid var(--soft);transform:rotate(45deg);transition:transform .18s ease;
    margin-bottom:4px}
  .w-drawer[open]>summary .w-caret{transform:rotate(-135deg);margin-bottom:0;margin-top:4px}
  .w-drawer-body{padding:0 0 1.25rem;color:var(--soft);line-height:1.75}
  .w-drawer-body p{margin:0 0 .9rem}
  .w-drawer-body p:last-child{margin-bottom:0}
  .w-drawer-body img,.w-drawer-body video{width:100%;height:auto;border-radius:var(--r);margin-top:.9rem;display:block}
  .w-stack{display:block !important}
  .w-stack .section-title{margin-bottom:1rem}
  /* Picker: list of questions beside the chosen answer. Every panel is shown
     by default and JS hides the inactive ones -- see feedPickerHtml(). */
  .w-pick{display:grid;grid-template-columns:minmax(150px,208px) 1fr;gap:1.15rem;align-items:start}
  .w-pick-list{display:flex;flex-direction:column;gap:.5rem}
  .w-pick-btn{display:flex;align-items:center;gap:.6rem;width:100%;min-height:58px;text-align:left;cursor:pointer;
    background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
    padding:.7rem .85rem;font-family:var(--body);color:var(--soft);transition:border-color .15s ease,color .15s ease}
  .w-pick-btn:hover{border-color:var(--accent);color:var(--ink)}
  .w-pick-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .w-pick-btn.is-on{border-color:var(--accent);background:var(--ground);color:var(--ink);
    box-shadow:inset 3px 0 0 var(--accent)}
  .w-pick-thumb{flex:0 0 auto;width:38px;height:38px;border-radius:calc(var(--r) - 6px);overflow:hidden;background:var(--ground)}
  .w-pick-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .w-pick-label strong{display:block;font-family:var(--display);font-size:.9rem;font-weight:600;line-height:1.3}
  .w-pick-panel{display:grid;grid-template-columns:minmax(0,36%) 1fr;gap:0;background:var(--panel);
    border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
  .w-pick-panel:not(:last-child){margin-bottom:1rem}          /* no-JS: they stack */
  .w-pick-media{background:var(--ground)}
  .w-pick-media img,.w-pick-media video{width:100%;height:100%;min-height:240px;object-fit:cover;display:block}
  .w-pick-body{padding:1.5rem 1.6rem;align-self:center;min-width:0}
  .w-pick-panel:not(:has(.w-pick-media)){grid-template-columns:1fr}
  .w-pick-body .q{font-family:var(--display);font-size:1.12rem;color:var(--ink);margin:0 0 .55rem;line-height:1.35}
  .w-pick-body p:last-child{margin:0;color:var(--soft);line-height:1.75}
  /* JS on: only the chosen panel shows, and stacking margin is irrelevant */
  .w-pick.is-live .w-pick-panel{display:none;margin-bottom:0}
  .w-pick.is-live .w-pick-panel.is-on{display:grid}
  @media (max-width:820px){
    .w-pick{grid-template-columns:1fr}
    .w-pick-list{flex-direction:row;overflow-x:auto;padding-bottom:.3rem;-webkit-overflow-scrolling:touch}
    .w-pick-btn{flex:0 0 auto;max-width:70vw}
    .w-pick-panel{grid-template-columns:1fr}
    .w-pick-media img,.w-pick-media video{min-height:0;max-height:320px}
  }
  @media (prefers-reduced-motion:reduce){ .w-pick-btn{transition:none} }
  .w-chiprow{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1.1rem}
  .w-cols{display:grid;grid-template-columns:1fr 1fr;gap:2.2rem}
  .w-cols.one{grid-template-columns:1fr}
  .w-col h3{font-family:var(--display);font-size:1.08rem;margin:0 0 .6rem;color:var(--ink)}
  .w-col p{margin:0;color:var(--soft);line-height:1.75;white-space:pre-line}
  @media (max-width:720px){ .w-cols{grid-template-columns:1fr;gap:1.6rem} }
  @media (prefers-reduced-motion:reduce){ .w-caret{transition:none} }
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
  .inq{max-width:460px;margin:0 auto;text-align:left}
  .inq-l{display:block;font-size:.78rem;font-weight:700;letter-spacing:.05em;
         text-transform:uppercase;color:var(--soft);margin:0 0 .35rem}
  .inq-opt{text-transform:none;letter-spacing:0;font-weight:500;opacity:.75}
  .inq-in{width:100%;font:inherit;font-size:.98rem;color:${t.ink};background:${t.ground};
          border:1px solid var(--line);border-radius:10px;padding:.7em .8em;margin:0 0 1rem}
  .inq-in:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  .inq textarea.inq-in{resize:vertical;min-height:76px}
  .inq .btn{width:100%;border:0;cursor:pointer;font-family:inherit}
  .inq .btn[disabled]{opacity:.6;cursor:default}
  .inq-status{font-size:.85rem;margin:.8rem 0 0;min-height:1.2em}
  .inq-status.bad{color:#a4402c}
  .inq-done{text-align:center;padding:.4rem 0}
  .inq-done .tick{font-size:1.6rem;color:var(--accent)}
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

  /* ----- rail (practice) ----- */
  .layout-rail{max-width:1180px;margin:0 auto;padding:0 22px}
  .rail ol{list-style:none;margin:0;padding:0}
  .rail-link{display:block;padding:.6rem 0 .6rem .9rem;border-left:2px solid var(--line);
             color:var(--soft);text-decoration:none;font-size:.88rem;line-height:1.4;
             transition:color .15s ease,border-color .15s ease}
  .rail-link:hover{color:var(--ink)}
  .rail-link.current{color:var(--accent);border-left-color:var(--accent);font-weight:600}
  .rail-item{scroll-margin-top:92px;margin-bottom:2.6rem}
  .rail-item .q{font-size:.82rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                color:var(--soft);margin:0 0 .5rem}
  .rail-item .a{font-size:1.06rem;line-height:1.6;margin:0}
  .rail-media{margin-top:1.1rem}
  .rail-media img,.rail-media video{width:100%;border-radius:var(--r);display:block}

  /* ----- panels (evening) ----- */
  .panel{display:grid;grid-template-columns:1fr;gap:0;margin:0 0 1px}
  .panel-media img,.panel-media video{width:100%;height:100%;object-fit:cover;display:block;
                                      aspect-ratio:4/3}
  .panel-text{display:flex;align-items:center;background:var(--panel);
              padding:clamp(1.6rem,4vw,3.4rem) clamp(1.2rem,4vw,3.4rem)}
  .panel-text .q{font-size:.75rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
                 color:var(--accent);margin:0 0 .7rem}
  .panel-text .a{font-family:var(--display);font-size:clamp(1.1rem,1.7vw,1.45rem);
                 line-height:1.55;margin:0}

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

  /* ==========================================================================
     DESKTOP. Everything above this point is a phone layout that simply stops
     growing: .measure caps at 640px, so on a 1600px screen the column
     templates render a thin ribbon of content in an empty page. A therapist
     showing this to a client on a laptop sees a broken-looking site.

     The fix is a composition, not a wider column. Prose stays at a readable
     760px -- widening text is worse, not better -- while the hero, the photos
     and the practical details use the room they have been given. Photos wider
     than the text they sit under is the oldest editorial trick there is, and
     it is what stops a single column reading as an accident.
     ========================================================================== */
  @media (min-width:1080px){
    /* ------------------------------------------------------------------
       THE FEED GOES TWO-DIMENSIONAL. A stack of cards down the middle of a
       1500px window is a phone layout that grew; it is the single thing
       that makes these read as an app screenshot rather than a website.

       Everything flows two across, and NOTHING spans. That is the whole
       trick: the builder encourages a photo after each answer ("something
       that shows what you just wrote"), so a feed is usually photo, prompt,
       photo, prompt -- and two-across turns that into split rows, each
       photo beside the words it belongs to, alternating down the page.

       Spanning the photos was the first attempt and it was worse: a
       full-width photo ends the row, so every prompt landed alone in the
       left column with dead space beside it. Half the page empty, in a
       change whose entire purpose was to stop that.

       Order-agnostic either way -- all prompts, all photos, or any mix the
       therapist drags into place still fills the rows.
       ------------------------------------------------------------------ */
    .colwrap{max-width:1080px}
    #story{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
           gap:1.5rem 1.6rem;align-items:stretch}
    #story:not(.layout-rail) > .section-title{grid-column:1 / -1}
    /* The PHOTO sets the row height, at a fixed 4:3, and the answer centres
       beside it. Stretching the card to match instead was measurably wrong:
       these answers run to about 50px of text, so a card stretched to a
       520px photo was 471px of empty panel -- four of them down the page.
       A short answer centred next to its photo is the split-row look; a
       short answer inflated to fill 520px is a bug. */
    #story{align-items:start}
    #story > .w-prompt{margin-bottom:0;align-self:center}
    #story > .w-photo,
    #story > .w-video{margin:0}
    #story > .w-photo img,
    #story > .w-video video{width:100%;aspect-ratio:4/3;object-fit:cover}
    /* Left edge shared with the heading above it. Centring a 760px block
       inside a 1036px wrapper put "Good to know" at one x and its own
       contents at another -- 138px apart, which reads as a broken column
       rather than an indent. The contact card stays centred: it is a card,
       and centring is the point of it. */
    .colwrap #practical .kv{max-width:820px;margin-left:0;margin-right:0}
    .colwrap #contact .contact-in{max-width:760px;margin-left:auto;margin-right:auto}
    /* aspect-ratio already governs the height; this only stops an unusually
       wide wrapper turning a 4:3 into a billboard. */
    .colwrap #story .w-photo img,
    .colwrap #story .w-video video{max-height:460px}

    /* Warm keeps its sticky card; the feed beside it pairs up too, and its
       photos span the main column rather than the whole page. */
    .layout-sidebar #story{gap:1.4rem 1.6rem}

    /* Quiet has no cards -- its prompts are bare text with a rule above, so
       two bare columns need a visible gutter to stay legible as two. */
    /* Quiet's section headings were a small italic line in the accent colour,
       which at this width read as a caption rather than a heading -- "Good to
       know" simply dissolved into the page. Bigger, with a rule over it, and
       air above: the two things that say "a new section starts here" without
       shouting, which would be the wrong register for this template. */
    [data-tpl="quiet"] #site section{padding-top:2.2rem;border-top:1px solid var(--line)}
    [data-tpl="quiet"] #site section:first-of-type{border-top:none;padding-top:0}
    [data-tpl="quiet"] #story{column-gap:3.2rem}
    [data-tpl="quiet"] [data-rhythm="flow"] .w-prompt,
    [data-tpl="quiet"] #story > .w-prompt{border-top:1px solid var(--line);padding-top:1.1rem}

    /* Practice is the credential-forward one: equal cards on a strict grid
       is the whole personality. */
    [data-tpl="practice"] #story > .w-prompt{background:var(--panel);border:1px solid var(--line)}
    /* Practical details are pairs, not prose: two up reads faster and stops
       the section being a lonely list down the middle of a wide page. */
    .kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7em 2.6rem}
    .kv > *{min-width:0}

    /* Heroes get the width -- this is the first thing anyone sees. */
    .hero-compact{max-width:1000px;grid-template-columns:minmax(0,1fr) 380px;gap:3.4rem}
    .hero-compact h1{font-size:clamp(2.2rem,3.4vw,3rem)}
    .hero-dusk{max-width:880px}

    /* QUIET, at width. A left-aligned column in a 940px block left a hard
       empty half to its right -- the words led, and nothing balanced them.
       The portrait moves out beside the text and grows into it: text left,
       face right, both centred against each other. Quiet is the template
       whose whole pitch is "your words lead", so the type keeps the wide
       column and the photo takes the narrower one. */
    .hero-statement{max-width:1040px;display:grid;
                    grid-template-columns:minmax(0,1fr) 300px;
                    column-gap:clamp(2.5rem,5vw,4.5rem);align-items:center}
    .hero-statement > *{grid-column:1}
    .hero-statement .avatar-s{grid-column:2;grid-row:1 / span 10;align-self:center;
                              width:100%;height:auto;aspect-ratio:4/5;border-radius:6px;
                              margin:0}
    .hero-dusk .avatar{width:140px;height:140px}

    /* Editorial pairs each photo with its prompt in alternating rows already
       (.split), so it opts out of the grid entirely -- two systems stacked
       would fight. */
    [data-tpl="editorial"] #story{display:block}
    /* Its TAIL was the weird part: leftover prompts, Good to know and the
       contact card each sat in a 640px column under 1180px alternating rows,
       so the page narrowed to a third of itself for the last screen and a
       half. They now carry the same width as the splits above them. */
    .edtail{max-width:1180px}
    .edtail-rest{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
                 gap:1.4rem 2.4rem;align-items:start}
    .edtail #contact .contact-in{max-width:720px;margin:0 auto}

    /* Practice: contents column beside the answers. Sticky, so it stays with
       you the whole way down -- a table of contents that scrolls off is just
       a list.

       #story, not .layout-rail: the generic two-column feed rule above is an
       ID selector and beats a class, so the rail came out as two equal 605px
       columns instead of 290 + the rest. Both new layouts have to out-specify
       it rather than sit beside it. */
    #story.layout-rail{display:grid;grid-template-columns:290px minmax(0,1fr);
                       gap:clamp(2.5rem,5vw,4.5rem);align-items:start}
    .rail{position:sticky;top:84px}
    .rail-item{margin-bottom:3.4rem}
    .rail-item .a{font-size:1.12rem;max-width:62ch}
    .rail-media img,.rail-media video{max-height:520px;object-fit:cover}

    /* Evening: full-bleed, image to the edge of the screen, text in the dark
       beside it, sides alternating. Its #story is a plain flow of panels --
       the feed grid would make each panel a cell in a two-up layout, which is
       the opposite of one thing at a time. */
    [data-tpl="evening"] #story{display:block}
    .panel{grid-template-columns:1fr 1fr;margin-bottom:0}
    .panel.rev .panel-media{order:2}
    .panel-media img,.panel-media video{aspect-ratio:auto;height:100%;min-height:420px}
    .panel-text{padding:clamp(2.5rem,5vw,5rem)}

    /* The wide layouts were built for a 1040px laptop and stop there. */
    .layout-sidebar{max-width:1180px;grid-template-columns:360px minmax(0,1fr)}
    .split{max-width:1180px}
    .foot{max-width:1180px}
  }

  /* Wider still. Only the layouts that are genuinely two-dimensional grow
     again; the reading column does not, at any size. */
  @media (min-width:1500px){
    .colwrap{max-width:1080px}
    /* The hero must share the wrapper's edges. Left at 1000 while the feed
       grew to 1080, the portrait sat 40px inside the photo below it -- close
       enough to read as a mistake rather than a margin. */
    .hero-compact{max-width:1080px}
    .hero-dusk{max-width:940px}
    .hero-statement{max-width:1140px;grid-template-columns:minmax(0,1fr) 340px}
    .layout-sidebar,.split,.hero-arch,.foot,.layout-rail,.edtail{max-width:1280px}
    .hero-arch .media{margin-left:calc(-1 * (22px + max(0px,(100vw - 1280px)/2)))}
    .hero-cover img.cover{height:min(62vh,620px)}
  }

  @media (max-width:760px){
    /* A sticky contents column is a desktop affordance. On a phone it would be
       a screenful of links before any content, so it goes away entirely and
       the answers stand on their own. */
    .rail{display:none}
    .panel-text{padding:1.5rem 22px 2rem}
    /* brand left, burger, Contact right -- links drop into a panel beneath */
    .navburger{display:block;margin-left:auto}
    .topnav{flex-wrap:wrap;gap:.55rem}
    .navbrand{margin-right:0}
    .navcta{order:3}
    .navlinks{order:4;display:none;width:100%;flex-direction:column;align-items:stretch;
              gap:0;border-top:1px solid var(--line);margin-top:.1rem}
    .topnav.open .navlinks{display:flex}
    .navlinks .navlink{display:block;width:100%;padding:.85rem 0;font-size:.9rem}
    .navlinks .navlink + .navlink{border-top:1px solid var(--line)}
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

/* Highlight the block the reader is level with. Observer, not a scroll
   handler: it fires only when something crosses the line, rather than on every
   pixel of every scroll. Silently absent on templates with no rail. */
/* Turns the stacked panels into a picker. Adds .is-live FIRST so that a page
   whose script fails part-way never ends up with everything hidden. */
function wirePicker() {
  document.querySelectorAll('[data-picker]').forEach(pick => {
    const btns   = [...pick.querySelectorAll('.w-pick-btn')];
    const panels = [...pick.querySelectorAll('.w-pick-panel')];
    if (btns.length < 2 || btns.length !== panels.length) return;
    pick.classList.add('is-live');
    const show = i => {
      btns.forEach((b, n) => b.classList.toggle('is-on', n === i));
      panels.forEach((p, n) => p.classList.toggle('is-on', n === i));
    };
    btns.forEach((b, i) => b.addEventListener('click', () => show(i)));
    show(0);
  });
}

function wireRail() {
  const links = [...document.querySelectorAll('.rail-link')];
  const items = [...document.querySelectorAll('.rail-item')];
  if (!links.length || !items.length || !('IntersectionObserver' in window)) return;
  const mark = (id) => links.forEach(a =>
    a.classList.toggle('current', a.getAttribute('href') === '#' + id));
  const seen = new Map();
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
    /* The topmost thing currently on screen, not the most visible one -- with
       tall photos the biggest block is often the one you have scrolled past. */
    const onScreen = items.filter(el => (seen.get(el.id) || 0) > 0);
    if (onScreen.length) mark(onScreen[0].id);
  }, { rootMargin: '-84px 0px -55% 0px', threshold: [0, 0.01, 0.5] });
  items.forEach(el => obs.observe(el));
  mark(items[0].id);
}

/* The inquiry form. Posts to submit_inquiry(), which is the ONLY way a row is
   created -- every rule (email shape, length, is-this-therapist-listed, the
   burst guard) lives in the function, so nothing here can be bypassed by
   someone editing this file's copy in their own browser. */
function wireInquiry(t) {
  const form = document.getElementById('inq-form');
  if (!form) return;
  const email = document.getElementById('inq-email');
  const msg = document.getElementById('inq-msg');
  const btn = document.getElementById('inq-send');
  const status = document.getElementById('inq-status');
  const say = (text, bad) => { status.textContent = text; status.classList.toggle('bad', !!bad); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    const value = (email.value || '').trim();
    /* Checked here only to save a round trip and give a faster answer; the
       function checks it again and is the one that counts. */
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      say('That email address doesn\u2019t look right.', true);
      email.focus();
      return;
    }
    btn.disabled = true;
    say('Sending\u2026');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_inquiry`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_therapist: t.user_id,
          p_email: value,
          p_message: (msg.value || '').trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        /* The function's own messages are written for a person to read, so
           they are shown as-is rather than replaced with something vaguer. */
        say(body.message || 'Something went wrong sending that. Try again in a moment.', true);
        btn.disabled = false;
        return;
      }
      const name = (t.name || '').replace(/^Dr\.?\s*/i, '').split(' ')[0] || 'They';
      form.outerHTML = `<div class="inq-done">
        <p class="tick" aria-hidden="true">\u2713</p>
        <p><strong>Sent.</strong> ${esc(name)} will see it and reply to ${esc(value)}.</p>
        <p class="soft" style="font-size:.9rem">Nothing else to do \u2014 there is no profile to
        finish unless you want one later.</p>
      </div>`;
    } catch (err) {
      say('No connection. Try again in a moment.', true);
      btn.disabled = false;
    }
  });
}

/* Bound after every render -- innerHTML replaces the nav each time. */
function wireNav() {
  const bar = document.querySelector('#site .topnav');
  const burger = bar && bar.querySelector('.navburger');
  if (!bar || !burger) return;
  const setOpen = (on) => {
    bar.classList.toggle('open', on);
    burger.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!bar.classList.contains('open'));
  });
  /* Tapping a link jumps down the page; leaving the panel open would cover
     the very section they just asked for. */
  bar.querySelectorAll('.navlink').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', (e) => { if (!bar.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
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

/* Prompt i with media i, the same zip editorial has always used. Position-
   based pairing (the photo AFTER each prompt) breaks the moment a therapist
   drags their feed into a different order, and they are told to drag it. */
function pairFeed(blocks) {
  const prompts = blocks.filter(b => b.kind === 'prompt');
  const media = blocks.filter(b => b.kind !== 'prompt');
  const n = Math.max(prompts.length, media.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ prompt: prompts[i] || null, media: media[i] || null });
  return out;
}

function mediaHtml(m, name) {
  if (!m) return '';
  if (m.kind === 'video') return `<video src="${esc(m.src)}" controls preload="metadata" playsinline></video>`;
  return `<img src="${esc(m.src)}" alt="A photo shared by ${esc(name)}" loading="lazy">`;
}

/* ---------------------------------------------------------------------------
   Website-only sections. Everything here reads from t.site, the PUBLIC jsonb
   added in 0045/0046 -- never from ideal_client, which is private. A therapist
   who has filled none of this in gets no extra sections at all rather than
   empty headings, so the page never looks half-built.
   --------------------------------------------------------------------------- */
function siteObj(t) { return (t && t.site && typeof t.site === 'object') ? t.site : {}; }

/* SPECIALTIES -- chips are the summary a client scans; the note is the answer
   to "what does that actually mean when you treat it". Only specialties with a
   note become expandable, so the section degrades to plain chips. */
function specialtiesSec(t) {
  const list = (t.specialties || []).filter(Boolean);
  if (!list.length) return '';
  const notes = siteObj(t).specialtyNotes || {};
  const withNote = list.filter(x => filled(notes[x]));
  const plain = list.filter(x => !filled(notes[x]));
  if (!withNote.length) return '';   // no detail to add -- the hero chips already say this
  const rows = withNote.map((x, i) => `
    <details class="w-drawer"${i === 0 ? ' open' : ''}>
      <summary><span>${esc(x)}</span><span class="w-caret" aria-hidden="true"></span></summary>
      <div class="w-drawer-body"><p>${esc(notes[x])}</p></div>
    </details>`).join('');
  const others = plain.length
    ? `<div class="w-chiprow">${plain.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '';
  return `<section id="specialties" class="w-stack"><p class="section-title">What I work with</p>${rows}${others}</section>`;
}

/* WHAT THERAPY IS LIKE / MY OFFICE -- two columns on a wide screen, stacked on
   a phone. Deliberately not tabs: these pages are prerendered and also render
   inside the app's ?embed=1 iframe, and a tab strip hides half the answer
   behind a click in both. Columns show everything and cost no JavaScript. */
function approachSec(t) {
  const site = siteObj(t);
  const cols = [
    ['What therapy is like with me', site.therapyLike],
    ['My office', site.office],
  ].filter(([, v]) => filled(v));
  if (!cols.length) return '';
  const inner = cols.map(([h, v]) =>
    `<div class="w-col"><h3>${esc(h)}</h3><p>${esc(v)}</p></div>`).join('');
  return `<section id="approach"><p class="section-title">${cols.length > 1 ? 'What to expect' : esc(cols[0][0])}</p>
    <div class="w-cols${cols.length > 1 ? '' : ' one'}">${inner}</div></section>`;
}

/* GET TO KNOW -- a picker: the questions listed down one side, the chosen
   answer and its photo beside them. This is the rail layout's argument taken
   seriously rather than overruled -- the list is always visible, so nothing is
   hidden behind a click; you are navigating, not unlocking.

   PROGRESSIVE ENHANCEMENT MATTERS HERE. These pages are prerendered static
   HTML and also render inside the app's ?embed=1 iframe. Every panel is
   visible in the markup and wirePicker() hides the inactive ones, so if the
   script never runs the section is simply the stacked list it always was
   rather than one answer and a row of dead buttons. */
function feedPickerHtml(blocks, name) {
  const prompts = blocks.filter(b => b.kind === 'prompt');
  const media   = blocks.filter(b => b.kind !== 'prompt');
  if (prompts.length < 2) return blocks.map(b => feedItemHtml(b, name)).join('');

  const list = prompts.map((p, i) => {
    const m = media[i];
    const thumb = m && m.kind === 'photo'
      ? `<span class="w-pick-thumb"><img src="${esc(m.src)}" alt="" loading="lazy"></span>` : '';
    return `<button type="button" class="w-pick-btn${i === 0 ? ' is-on' : ''}" data-pick="${i}">
      ${thumb}<span class="w-pick-label"><strong>${esc(p.q)}</strong></span>
    </button>`;
  }).join('');

  const panels = prompts.map((p, i) => `
    <div class="w-pick-panel" data-panel="${i}">
      ${media[i] ? `<div class="w-pick-media">${mediaHtml(media[i], name)}</div>` : ''}
      <div class="w-pick-body"><p class="q">${esc(p.q)}</p><p>${esc(p.a)}</p></div>
    </div>`).join('');

  const spare = media.slice(prompts.length).map(m => feedItemHtml(m, name)).join('');
  return `<div class="w-pick" data-picker>
      <div class="w-pick-list">${list}</div>
      <div class="w-pick-panels">${panels}</div>
    </div>${spare}`;
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

/* ?embed=1 -- the page is inside the Kindred app's own modal.
   Two things must change or the embed misbehaves: its nav would be a second
   navigation inside an app that already has one, and any link that navigates
   the frame would nest the application inside itself. So the nav goes and
   every link opens in a new tab. Nothing about the CONTENT changes; this is
   the same page, in a smaller window. */
const EMBEDDED = new URLSearchParams(location.search).get('embed') === '1';

function render(t) {
  const name = t.name || 'Kindred Therapist';
  const first = name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || name;
  const creds = (t.credentials && t.credentials.length) ? t.credentials.join(' • ') : 'Licensed Therapist';
  setSocialMeta(t, name, creds);

  const tpl   = resolveTheme(t.site);
  /* Two places still key off the layout id itself rather than the resolved
     theme: Quiet's flow rhythm, and the data-tpl hook on #site. */
  const tplId = (t.site && LAYOUTS[t.site.template]) ? t.site.template : 'warm';

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
  /* The links row was overflow-x:auto, which on a phone rendered as a half-cut
     word ("Good to kno...") with nothing to say it scrolled -- it reads as a
     broken nav rather than a scrollable one. Below 760px the links collapse
     into a hamburger panel. The brand and Contact stay put: the one thing a
     visitor on a phone is most likely to want must never be behind a menu. */
  const navLinks = `${feed ? `<a class="navlink" href="#story">My story</a>` : ''}${kv.length ? `<a class="navlink" href="#practical">Good to know</a>` : ''}`;
  const nav = `
  <nav class="topnav">
    <a class="navbrand" href="#top">${esc(name)}</a>
    ${navLinks ? `<button class="navburger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="navlinks">
      <span></span><span></span><span></span>
    </button>` : ''}
    <div class="navlinks" id="navlinks">${navLinks}</div>
    <a class="navcta" href="#contact">Contact</a>
  </nav>`;

  /* Picker everywhere except rail: see feedPickerHtml() for why practice is
     left alone. `feed` (the flat stack) is still used by the split and panel
     layouts, which pair each prompt with its own image and would lose that
     pairing inside a drawer. */
  const storyInner = (tpl.layout === 'rail' || tpl.layout === 'panels' || tpl.layout === 'splits')
    ? feed : feedPickerHtml(blocks, name);
  /* w-stack forces one column. The layouts grid their sections two-up, which
     suits the flat prompt cards but not drawers: opening one would shove its
     neighbour down and leave a hole beside it. */
  const usesPicker = storyInner !== feed;
  const storySec = storyInner ? `<section id="story"${usesPicker ? ' class="w-stack"' : ''}><p class="section-title">Get to know ${esc(first)}</p>${storyInner}</section>` : '';
  const specSec  = specialtiesSec(t);
  const apprSec  = approachSec(t);
  const kvSec = kv.length ? `<section id="practical"><p class="section-title">Good to know</p><div class="kv">${kv.join('')}</div></section>` : '';
  /* Was "a few questions first... takes about three minutes", which described
     the eight-step intake. That is not what this button does any more: an
     email address is the whole ask, and the profile is optional and later.
     Copy that overstates the cost is the thing that loses the person. */
  const contactSec = `
    <section id="contact"><div class="contact-in">
      <h2>Ready when you are.</h2>
      <p class="soft">Send ${esc(first)} a message and it goes straight to them. All you need is an email address &mdash; you can fill in the rest later, or not at all.</p>
      ${KINDRED_FLAGS.clientDataPersistence ? `
      <form class="inq" id="inq-form" novalidate>
        <label class="inq-l" for="inq-email">Your email</label>
        <input class="inq-in" id="inq-email" type="email" required autocomplete="email"
               inputmode="email" placeholder="you@example.com">
        <label class="inq-l" for="inq-msg">Anything you'd like ${esc(first)} to know <span class="inq-opt">optional</span></label>
        <textarea class="inq-in" id="inq-msg" rows="3" maxlength="2000"
                  placeholder="A sentence or two is plenty."></textarea>
        <button class="btn" type="submit" id="inq-send">Send ${esc(first)} a message</button>
        <p class="inq-status" id="inq-status" role="status" aria-live="polite"></p>
      </form>
      <p class="fine">Only ${esc(first)} sees this. Free for clients, always.</p>`
      : `
      <a class="btn" href="${esc(cta)}">Send ${esc(first)} a message</a>
      <p class="fine">Free for clients, always.</p>`}
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
        <a class="btn" href="${esc(cta)}" style="margin-top:.6rem">Send me a message</a>
      </aside>
      <main>
        ${t.best_for ? `<section><p class="statement">${esc(t.best_for)}</p></section>` : ''}
        ${specSec}${storySec}${apprSec}${kvSec}${contactSec}
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
    ${specSec ? `<div class="measure edtail">${specSec}</div>` : ''}
    ${rows ? `<section id="story"><p class="section-title wide" style="padding:0 22px">Get to know ${esc(first)}</p>${rows}
      <div class="measure edtail edtail-rest" data-rhythm="flow">${rest}${others}</div></section>`
      : storySec ? `<div class="measure edtail">${storySec}</div>` : ''}
    ${apprSec ? `<div class="measure edtail">${apprSec}</div>` : ''}
    ${kvSec ? `<div class="measure edtail">${kvSec}</div>` : ''}
    <div class="measure edtail">${contactSec}</div>
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
        <a class="btn" href="${esc(cta)}">Send me a message</a>
      </div>
    </div>
    ${specSec ? `<div class="band"><div class="measure colwrap">${specSec}</div></div>` : ''}
    ${storySec ? `<div class="band alt"><div class="measure colwrap">${storySec}</div></div>` : ''}
    ${apprSec ? `<div class="band"><div class="measure colwrap">${apprSec}</div></div>` : ''}
    ${kvSec ? `<div class="band"><div class="measure colwrap">${kvSec}</div></div>` : ''}
    <div class="band loud"><div class="measure">${contactSec}</div></div>
    <div class="band-foot">${footer}</div>`;
  } else if (tpl.layout === 'rail' || tpl.layout === 'panels') {
    /* ------------------------------------------------------------------
       RAIL (practice) -- a contents column beside the answers, the drawer
       idea built as NAVIGATION rather than as a gate. It highlights the
       block you are level with and scrolls you to any other, but nothing is
       hidden behind a click: these answers are how a client decides whether
       they trust someone, and content behind a click mostly does not get
       read. Structured and scannable is exactly Practice's register.

       PANELS (evening) -- full-bleed alternating rows, image running to the
       edge of the screen, text in the dark beside it. Slow and cinematic,
       one thing at a time, which is the register trauma and somatic work
       tends to want. Deliberately not the contained grid the others use.
       ------------------------------------------------------------------ */
    const pairs = pairFeed(blocks);
    let hero;
    if (tpl.hero === 'compact') {
      hero = `<div class="hero measure hero-compact" id="top">
        <div class="pic">${heroPortrait}</div>
        <div>
          <h1>${esc(name)}</h1>
          <p class="soft" style="margin:.4rem 0 .9rem">${esc(creds)}${(t.pronouns && t.show_pronouns !== false) ? ' · ' + esc(t.pronouns) : ''}</p>
          ${factsRow}
          <div style="margin:1.1rem 0 1.3rem">${badge}</div>
          ${paused}
          <a class="btn" href="${esc(cta)}">Send me a message</a>
        </div>
      </div>`;
    } else {
      hero = `<div class="hero measure hero-dusk" id="top">
        ${t.photo ? `<img class="avatar" src="${esc(t.photo)}" alt="${esc(name)}">` : ''}
        <p class="section-title" style="margin-bottom:.6rem">${esc(creds)}</p>
        <h1>${esc(name)}</h1>
        ${t.best_for ? `<p style="font-style:italic;color:var(--soft);margin:.9rem auto 1.2rem;max-width:40ch">${esc(t.best_for)}</p>` : ''}
        ${factsRow}
        <div style="margin-top:1.3rem">${badge}</div>
        ${paused ? `<div style="margin-top:1rem">${paused}</div>` : ''}
      </div>`;
    }

    const items = pairs.map((pr, i) => {
      const q = pr.prompt ? pr.prompt.q : '';
      const a = pr.prompt ? pr.prompt.a : '';
      const media = mediaHtml(pr.media, name);
      if (tpl.layout === 'panels') {
        return `<div class="panel${i % 2 ? ' rev' : ''}" id="blk-${i}">
          ${media ? `<div class="panel-media">${media}</div>` : '<div></div>'}
          <div class="panel-text"><div>${q ? `<p class="q">${esc(q)}</p>` : ''}${a ? `<p class="a">${esc(a)}</p>` : ''}</div></div>
        </div>`;
      }
      return `<article class="rail-item" id="blk-${i}">
        ${q ? `<p class="q">${esc(q)}</p>` : ''}
        ${a ? `<p class="a">${esc(a)}</p>` : ''}
        ${media ? `<div class="rail-media">${media}</div>` : ''}
      </article>`;
    }).join('');

    const storyBlock = !items ? '' : (tpl.layout === 'panels'
      ? `<section id="story"><p class="section-title measure">Get to know ${esc(first)}</p>${items}</section>`
      : `<section id="story" class="layout-rail">
          <nav class="rail" aria-label="Sections of this page">
            <p class="section-title">Get to know ${esc(first)}</p>
            <ol>${pairs.map((pr, i) =>
              `<li><a class="rail-link" href="#blk-${i}" data-rail="${i}">${esc(pr.prompt ? pr.prompt.q : 'A photo')}</a></li>`).join('')}</ol>
          </nav>
          <div class="rail-body">${items}</div>
        </section>`);

    body = `${nav}${hero}
    ${storyBlock}
    <div class="measure colwrap">${specSec}${apprSec}${kvSec}${contactSec}</div>
    ${footer}`;
  } else {
    /* column: quiet (statement) */
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
          <a class="btn" href="${esc(cta)}">Send me a message</a>
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
    <div class="measure colwrap"${rhythm}>
      ${specSec}${storySec}${apprSec}${kvSec}${contactSec}
    </div>
    ${footer}`;
  }

  $('site').dataset.tpl = tplId;
  if (EMBEDDED) document.documentElement.setAttribute('data-embed', '1');
  $('site').innerHTML = body;
  if (EMBEDDED) {
    /* Every link, including the ones the templates generate. target alone is
       not enough for a same-origin href in an iframe on some browsers, so the
       rel goes on too. */
    $('site').querySelectorAll('a[href]').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }
  wireNav();
  wireRail();
  wirePicker();
  wireInquiry(t);
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

  /* Flags first, so the contact section renders the right thing on the first
     paint rather than swapping a button for a form under the reader. Failure
     is not fatal: the default is off, which is the old button. */
  try {
    const cfg = await fetch(FLAGS_URL + '?cb=' + Date.now(), { cache: 'no-store' });
    if (cfg.ok) KINDRED_FLAGS = Object.assign(KINDRED_FLAGS, await cfg.json());
  } catch (e) { /* defaults stand */ }

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
