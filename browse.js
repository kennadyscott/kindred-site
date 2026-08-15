/* ===========================================================================
   Kindred — the public browse page
   ---------------------------------------------------------------------------
   Reads therapists_public with the anon key, the same view the individual
   therapist pages and the prerenderer use. One source, so a therapist who is
   visible on their own page is visible here, and someone hidden — unverified,
   reported, removed, website switched off — is missing from both. This file
   makes no visibility decision of its own; there is nowhere for the two to
   disagree.

   Filtering happens in the browser on purpose. The roster is small enough to
   fetch once, and every filter then costs nothing — no spinner between
   changing a dropdown and seeing the answer. When the roster is big enough for
   that to hurt, search_therapists() already exists to do it server-side.
   =========================================================================== */

const SUPABASE_URL = 'https://izukppxgoerqtustfbnk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ALL = [];

async function load() {
  const cols = 'slug,name,credentials,pronouns,show_pronouns,photo,location,best_for,' +
               'specialties,formats,rate_min,languages,accepting,license_verified';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/therapists_public?select=${cols}&order=name`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    ALL = await res.json();
  } catch (e) {
    $('count').textContent = '';
    $('grid').innerHTML = '';
    $('empty').hidden = false;
    $('empty').innerHTML = `<h2>We couldn't load the list.</h2>
      <p>Something went wrong at our end, not yours. Refreshing usually fixes it.</p>
      <a class="btn btn-dark" href="/browse">Try again</a>`;
    return;
  }
  fillFilters();
  apply();
}

/* Options come from the roster itself, so a state or specialty nobody has is
   never offered — a filter that can only ever return nothing is a dead end
   dressed as a choice. */
function fillFilters() {
  const states = new Set();
  const specs = new Set();
  ALL.forEach((t) => {
    const st = (t.location || {}).state;
    if (st) states.add(st);
    (t.specialties || []).forEach((s) => specs.add(s));
  });
  const fill = (el, values) => {
    [...values].sort().forEach((v) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  };
  fill($('f-state'), states);
  fill($('f-spec'), specs);
}

function matches(t, f) {
  const loc = t.location || {};
  if (f.state && loc.state !== f.state) return false;
  if (f.spec && !(t.specialties || []).includes(f.spec)) return false;
  if (f.format && !(t.formats || []).includes(f.format)) return false;
  if (f.open && t.accepting !== true) return false;
  if (f.q) {
    const hay = [t.name, (t.credentials || []).join(' '), t.best_for,
                 (t.specialties || []).join(' '), loc.city, loc.state,
                 (t.languages || []).join(' ')].join(' ').toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  return true;
}

function cardHtml(t) {
  const loc = t.location || {};
  const city = [loc.city, loc.state].filter(Boolean).join(', ');
  const creds = (t.credentials || []).filter(Boolean).join(' • ');
  const formats = t.formats || [];
  const fmt = formats.length >= 2 ? 'Online & in person'
    : formats.includes('video') ? 'Online'
    : formats.includes('in-person') ? 'In person' : '';
  const initials = String(t.name || '?').replace(/^Dr\.?\s*/i, '').split(' ')
    .filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  /* Their own page, at their own URL -- browsing hands people off to the
     therapist rather than keeping them in a Kindred-shaped preview. */
  const href = t.slug ? `/${encodeURIComponent(t.slug)}?from=browse` : '#';
  return `<a class="tcard" href="${href}">
    ${t.photo
      ? `<img class="tcard-img" src="${esc(t.photo)}" alt="" loading="lazy">`
      : `<div class="tcard-fallback" aria-hidden="true">${esc(initials)}</div>`}
    <div class="tcard-body">
      <p class="tcard-name">${esc(t.name || 'Kindred therapist')}</p>
      ${creds ? `<span class="tcard-cred">${esc(creds)}</span>` : ''}
      ${t.best_for ? `<span class="tcard-line">${esc(String(t.best_for).slice(0, 110))}</span>` : ''}
      <span class="tcard-line">${[city, fmt, t.rate_min ? '$' + t.rate_min + '/session' : '']
        .filter(Boolean).join(' &middot; ')}</span>
      <div class="tcard-tags">
        ${(t.specialties || []).slice(0, 3).map((s) => `<span class="tcard-tag">${esc(s)}</span>`).join('')}
        ${t.accepting === false ? `<span class="tcard-paused">Not taking new clients</span>` : ''}
      </div>
    </div>
  </a>`;
}

function apply() {
  const f = {
    q: ($('f-q').value || '').trim().toLowerCase(),
    state: $('f-state').value,
    spec: $('f-spec').value,
    format: $('f-format').value,
    open: $('f-open').value,
  };
  const found = ALL.filter((t) => matches(t, f));
  const anyFilter = !!(f.q || f.state || f.spec || f.format || f.open);

  $('grid').innerHTML = found.map(cardHtml).join('');
  $('empty').hidden = found.length > 0;

  if (found.length) {
    $('count').textContent = found.length === ALL.length
      ? `${ALL.length} ${ALL.length === 1 ? 'therapist' : 'therapists'} on Kindred`
      : `${found.length} of ${ALL.length}`;
    return;
  }

  $('count').textContent = '';
  /* Two different nothings, and saying the wrong one is its own kind of lie.
     A filter that matched nobody is the visitor's to undo. An empty roster is
     ours to admit, and pretending it is a filter problem sends someone hunting
     through dropdowns for people who do not exist. */
  $('empty').innerHTML = anyFilter
    ? `<h2>Nobody matches that yet.</h2>
       <p>Kindred is small and still growing, so a narrow search can come back empty.
       Clearing a filter usually helps.</p>
       <button class="btn btn-dark" id="clear">Clear filters</button>`
    : `<h2>No therapists are listed yet.</h2>
       <p>Kindred is new. Therapists appear here once their license has been checked
       against their state board &mdash; nobody is listed before that.</p>
       <a class="btn btn-dark" href="/therapists.html">I'm a therapist</a>`;
  const clear = $('clear');
  if (clear) clear.addEventListener('click', () => {
    ['f-q', 'f-state', 'f-spec', 'f-format', 'f-open'].forEach((id) => { $(id).value = ''; });
    apply();
  });
}

['f-q', 'f-state', 'f-spec', 'f-format', 'f-open'].forEach((id) => {
  const el = $(id);
  el.addEventListener(id === 'f-q' ? 'input' : 'change', apply);
});

load();
