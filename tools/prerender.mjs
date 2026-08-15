/* ===========================================================================
   PRERENDER -- a real page per therapist, so the pretty URL is a real URL
   ---------------------------------------------------------------------------
   404.html already routes kindredtherapymatch.com/desirae-tarris to the
   profile page, and a human never sees the difference. A crawler does: GitHub
   Pages serves that route with HTTP 404, so iMessage, Slack, Facebook and
   LinkedIn treat the link as dead and Google will not index it. A therapist
   whose pitch is "you get a real website" cannot have a website that link
   previews call missing.

   This writes <slug>/index.html for every published therapist, which Pages
   serves as a directory: /desirae-tarris 301s to /desirae-tarris/ and returns
   200 with her name, description and photo already in the HTML.

   WHAT IS BAKED VS WHAT IS LIVE. Only the crawler-facing layer is baked --
   title, description, og/twitter tags, JSON-LD, and a noscript copy of the
   text. The visible page is still rendered by profile.js from live data on
   every visit, so a therapist who rewrites a prompt or switches template sees
   it immediately; only the preview card is as-of-last-build. That split is
   deliberate: baking the whole page would create a second copy of the six
   templates that could silently disagree with the real one.

   NO SECRETS. Reads therapists_public with the anon key that is already
   embedded in profile.js. It cannot see anything a visitor cannot, which is
   the point -- the generator physically cannot leak ideal_client or a license
   number, because the view does not return them.

   Run:  node tools/prerender.mjs          (writes)
         node tools/prerender.mjs --check  (exit 1 if output would change)
   =========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kindredtherapymatch.com';
const MANIFEST = join(ROOT, '.prerender-manifest.json');
const CHECK = process.argv.includes('--check');

/* The anon key and URL are read out of profile.js rather than duplicated here.
   Two copies of a connection string is the same bug shape as everything else
   this codebase has had to unpick -- and the rotation that changes one would
   silently not change the other. */
const profileJs = readFileSync(join(ROOT, 'profile.js'), 'utf8');
const grab = (name) => {
  const m = profileJs.match(new RegExp(`const ${name} = '([^']+)'`));
  if (!m) throw new Error(`could not read ${name} out of profile.js`);
  return m[1];
};
const SUPABASE_URL = grab('SUPABASE_URL');
const SUPABASE_ANON = grab('SUPABASE_ANON');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Anything already at the repo root wins over a slug on Pages, so a therapist
   who managed to claim "about" must never get a directory that shadows it.
   Read from disk rather than hardcoded: a new top-level page added next month
   protects itself without anyone remembering this file. */
function reservedNames(ours) {
  const names = new Set(['index.html', 'CNAME', '404.html']);
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    /* NOT our own output. Without this the script eats itself on the second
       run: the directory it wrote last time reads as a real path, the
       therapist is skipped as a collision, and the cleanup pass then deletes
       the page for being unwritten. Found by running it twice, which is the
       only way to find it -- the first run is always clean. */
    if (ours.has(e.name)) continue;
    names.add(e.name);
    if (e.name.endsWith('.html')) names.add(e.name.replace(/\.html$/, ''));
  }
  return names;
}

async function fetchPublished() {
  const cols = 'user_id,slug,name,credentials,pronouns,show_pronouns,photo,location,' +
               'best_for,prompt_fit,specialties,formats,rate_min,languages,blocks,' +
               'optional_prompts,accepting,site,license_verified';
  const url = `${SUPABASE_URL}/rest/v1/therapists_public?select=${cols}&order=slug`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
  });
  if (!res.ok) throw new Error(`therapists_public ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* Same description the app derives, so the card and the page agree. */
function describe(t, name, city) {
  const first = (t.best_for || '').trim() || (t.prompt_fit || '').trim();
  if (first) return first.length > 300 ? first.slice(0, 297).trimEnd() + '…' : first;
  return `${name} is a therapist on Kindred${city ? ' in ' + city : ''}. See how they work and whether you two would be a fit.`;
}

/* The text a crawler that does not run JavaScript gets. Not a second rendering
   of the page -- deliberately plain, inside <noscript>, so it can never drift
   into looking like the templates or flash in front of a human. */
function noscriptBody(t, name, creds, city, desc) {
  const bits = [];
  bits.push(`<h1>${esc(name)}${creds ? ', ' + esc(creds) : ''}</h1>`);
  if (city) bits.push(`<p>${esc(city)}</p>`);
  bits.push(`<p>${esc(desc)}</p>`);
  const specialties = (t.specialties || []).slice(0, 12);
  if (specialties.length) bits.push(`<p>Specialties: ${esc(specialties.join(', '))}</p>`);
  const prompts = (Array.isArray(t.blocks) ? t.blocks : [])
    .filter(b => b && b.type === 'prompt' && b.answer)
    .slice(0, 6);
  for (const p of prompts) {
    bits.push(`<h2>${esc(p.question || '')}</h2><p>${esc(p.answer)}</p>`);
  }
  bits.push(`<p><a href="${SITE}/app/#match">Find a therapist on Kindred</a></p>`);
  return bits.join('\n    ');
}

function jsonLd(t, name, creds, city, desc, imageUrl) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name,
      description: desc,
      url: `${SITE}/${t.slug}`,
      ...(creds ? { hasCredential: creds.split(' • ') } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(city ? { workLocation: { '@type': 'Place', name: city } } : {}),
      jobTitle: 'Therapist'
    }
  };
  /* </script> inside JSON would close the tag early. */
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/* og:image must be a real fetchable URL -- a data: URL is not one, and Desirae's
   photo is still inline base64 (it migrates to Storage on her next save). Rather
   than ship a card with no image until then, decode it to a real file beside her
   page. Size-guarded, because this lands in git. */
function resolveImage(t, dir) {
  const photo = t.photo || '';
  if (/^https?:\/\//i.test(photo)) return { url: photo, file: null };
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (!m) return { url: null, file: null };
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 700 * 1024) {
    console.warn(`  ! ${t.slug}: inline photo is ${Math.round(buf.length / 1024)}KB, too big to commit -- card will have no image until it moves to Storage`);
    return { url: null, file: null };
  }
  return { url: `${SITE}/${t.slug}/photo.${ext}`, file: { name: `photo.${ext}`, buf } };
}

function pageHtml(t) {
  const name = t.name || 'Kindred Therapist';
  const creds = (t.credentials || []).filter(Boolean).join(' • ');
  const loc = t.location || {};
  const city = [loc.city, loc.state].filter(Boolean).join(', ');
  const desc = describe(t, name, city);
  const title = `${name}${creds ? ', ' + creds : ''}${city ? ' — ' + city : ''} | Kindred`;
  const canonical = `${SITE}/${t.slug}`;
  return { name, creds, city, desc, title, canonical };
}

function render(t, meta, imageUrl) {
  const { name, creds, city, desc, title, canonical } = meta;
  const shell = readFileSync(join(ROOT, 'profile.html'), 'utf8');

  /* Built FROM profile.html, not alongside it: the reset, the ribbon, the
     loading and missing states and the script tag all have to stay in step
     with the page profile.js expects, and a hand-maintained copy of that shell
     would be the drift bug again. Only the head metadata is swapped. */
  const head = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="Kindred">
${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:alt" content="${esc(name)}">
<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${jsonLd(t, name, creds, city, desc, imageUrl)}</script>`;

  let out = shell;
  // swap the generic title + the static fallback og block for the real ones
  out = out.replace(/<title>[\s\S]*?<\/title>/, '__KINDRED_HEAD__');
  out = out.replace(/<meta name="description"[^>]*>\n?/, '');
  out = out.replace(/<!-- STATIC FALLBACK[\s\S]*?-->\n?/, '');
  out = out.replace(/<meta property="og:[^>]*>\n?/g, '');
  out = out.replace('__KINDRED_HEAD__', head);
  // assets are one level up from /<slug>/
  out = out.replace('src="profile.js', 'src="../profile.js');
  // crawler-visible text, never shown to a human
  out = out.replace('<div id="site" hidden></div>',
    `<div id="site" hidden></div>\n\n<noscript>\n  <div class="state" style="text-align:left;max-width:680px">\n    ${noscriptBody(t, name, creds, city, desc)}\n  </div>\n</noscript>`);
  return out;
}

/* ------------------------------------------------------------------ main */
const previous = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8')).slugs || []
  : [];

const reserved = reservedNames(new Set(previous));
const rows = await fetchPublished();
console.log(`therapists_public: ${rows.length} published`);

const written = [];
const changes = [];

for (const t of rows) {
  const slug = t.slug || '';
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
    console.warn(`  ! skipped ${t.user_id}: slug ${JSON.stringify(slug)} is not URL-shaped`);
    continue;
  }
  if (reserved.has(slug)) {
    console.warn(`  ! skipped ${slug}: collides with a real path on the site`);
    continue;
  }
  const dir = join(ROOT, slug);
  const meta = pageHtml(t);
  const img = resolveImage(t, dir);
  const html = render(t, meta, img.url);

  const indexPath = join(dir, 'index.html');
  const before = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  if (before !== html) changes.push(slug);
  if (!CHECK) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(indexPath, html);
    if (img.file) writeFileSync(join(dir, img.file.name), img.file.buf);
  }
  written.push(slug);
  console.log(`  ✓ /${slug}/  ${img.url ? '(with card image)' : '(no card image yet)'}`);
}

/* A therapist who unpublishes, is reported, or deletes their account must stop
   having a page -- otherwise the one URL we promised is theirs outlives the
   decision to take it down. Only ever removes directories THIS script created,
   which is what the manifest is for. */
const stale = previous.filter(s => !written.includes(s));
for (const slug of stale) {
  changes.push(slug);
  console.log(`  ✗ removed /${slug}/ (no longer published)`);
  if (!CHECK) rmSync(join(ROOT, slug), { recursive: true, force: true });
}

if (!CHECK) {
  writeFileSync(MANIFEST, JSON.stringify({
    note: 'Directories written by tools/prerender.mjs. Edit nothing here by hand -- it is how the next run knows what to clean up.',
    slugs: written.sort()
  }, null, 2) + '\n');
}

console.log(`\n${written.length} page(s), ${stale.length} removed, ${changes.length} changed`);
if (CHECK && changes.length) {
  console.error('--check: output is out of date');
  process.exit(1);
}
