/* ===================== Kindred — global site infrastructure ===================== */

/* ---- Single source of truth for the matching app's URL ----
   At launch, change THIS ONE LINE to the production app URL. Every "Match with
   a therapist" / store-badge / search link (marked data-app-link) and the
   dynamic check-in handoff read from it — no site-wide find-replace needed. */
window.KINDRED_APP_URL = 'https://app.kindredtherapymatch.com';

(() => {
  /* point every static app link at the current KINDRED_APP_URL (their hardcoded
     href stays as a no-JS fallback; this makes the constant authoritative) */
  /* Belt and braces for the audience choice. Every app link is now written
     with an explicit hash, but a new one added later without thinking would
     land on "what brings you to Kindred?" -- a question the visitor answered
     on the front door and should never be asked twice. The audience popup
     stores that answer; this applies it to anything that forgot. */
  function routeByAudience() {
    let choice = null;
    try { choice = (JSON.parse(localStorage.getItem('kindred-audience') || 'null') || {}).choice; } catch (e) {}
    if (choice !== 'client' && choice !== 'therapist') return;
    const hash = choice === 'therapist' ? '#therapist-signin' : '#match';
    document.querySelectorAll('a[href*="app.kindredtherapymatch.com"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.indexOf('#') !== -1) return;               // already routed, leave it
      a.setAttribute('href', href.replace(/\/?$/, '/') + hash);
    });
  }

  function wireAppLinks() {
    document.querySelectorAll('a[data-app-link]').forEach(a => {
      /* data-app-link="match" deep-links into the questionnaire instead of the
         app's "what brings you to Kindred?" screen. Without this the constant
         would overwrite the whole href and wipe the hash off every link. */
      const target = a.getAttribute('data-app-link');
      a.href = window.KINDRED_APP_URL + (target ? '#' + target : '');
    });
    routeByAudience();
  }

  /* Horizontal scroll strips (card rows, tab bars) can trap vertical page
     scrolling on trackpads: a mostly-vertical gesture gets axis-locked to the
     strip's horizontal axis and the page stops moving — a visitor mid-page can
     think the page has ended. This arms every such strip (present, dynamically
     rendered, or revealed on resize) so genuine horizontal intent stays in the
     strip but vertical intent scrolls the page. Fixes it site-wide, once. */
  function isHorizontalScroller(el) {
    if (el.scrollWidth <= el.clientWidth + 1) return false; // nothing to scroll horizontally
    const ox = getComputedStyle(el).overflowX;
    return ox === 'auto' || ox === 'scroll';
  }
  function onWheel(e) {
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // genuine horizontal intent — leave it
    window.scrollBy(0, e.deltaY);                          // vertical intent — move the page
    e.preventDefault();
  }
  function armScrollers() {
    document.querySelectorAll('[class]').forEach(el => {
      if (el.dataset.hwheel || !isHorizontalScroller(el)) return;
      el.dataset.hwheel = '1';
      el.addEventListener('wheel', onWheel, { passive: false });
    });
  }

  function init() { wireAppLinks(); armScrollers(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', init);          /* catch late-rendered strips/links */
  setTimeout(init, 800);                            /* catch JS-populated rows/links */
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(armScrollers, 200); });
})();

/* ---------------------------------------------------------------------------
   Newsletter signup — the homepage band and the footer form on every other
   page are the same component, wired here.

   The anon key is safe in the client: RLS is the boundary, and
   newsletter_signups is insert-only for anon, so this can add an address and
   nothing anonymous can read the list back. Same shape as client_notify.

   Deliberately posts the address and the page it came from, and nothing else.
   No intake answers, no state, no reason — an email beside "looking for
   trauma therapy" is health information; an email on its own is not. That is
   what makes this safe to run before the BAA is signed.
--------------------------------------------------------------------------- */
(() => {
  const forms = document.querySelectorAll('form.news-signup');
  if (!forms.length) return;

  const SUPABASE_URL  = 'https://izukppxgoerqtustfbnk.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk';
  const PENDING = 'kindred-newsletter-pending';

  /* Deliberately loose. A strict pattern rejects real addresses (new TLDs,
     plus-tags, unicode domains) and the only cost of letting a typo through is
     a row nobody can mail. */
  const looksLikeEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  /* If the table isn't there yet the signup is kept on the device rather than
     dropped, and goes up on the next page load once the migration has run.
     Postgres 42P01 = undefined_table; PostgREST reports it as a 404. */
  const queue = email => {
    try {
      const q = JSON.parse(localStorage.getItem(PENDING) || '[]');
      if (!q.includes(email)) { q.push(email); localStorage.setItem(PENDING, JSON.stringify(q)); }
    } catch (e) {}
  };

  async function send(email) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/newsletter_signups`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email, source: location.pathname.replace(/^\//, '') || 'index.html' })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(body || res.status);
      err.missingTable = res.status === 404 || /42P01|does not exist/i.test(body);
      throw err;
    }
  }

  /* Anything queued from a previous visit goes up quietly, and only clears
     when it is genuinely stored. */
  (async () => {
    let q = [];
    try { q = JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch (e) { return; }
    if (!q.length) return;
    const left = [];
    for (const email of q) {
      try { await send(email); } catch (e) { left.push(email); }
    }
    try {
      if (left.length) localStorage.setItem(PENDING, JSON.stringify(left));
      else localStorage.removeItem(PENDING);
    } catch (e) {}
  })();

  forms.forEach(form => {
    /* Scoped to the form, not looked up by id: the same component appears in
       two placements and duplicate ids would silently wire only the first. */
    const input = form.querySelector('.ns-input');
    const btn   = form.querySelector('.ns-btn');
    const note  = form.querySelector('.ns-note');

    const say = (msg, isErr) => {
      note.textContent = msg;
      note.classList.toggle('is-err', !!isErr);
      input.setAttribute('aria-invalid', isErr ? 'true' : 'false');
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = (input.value || '').trim();
      if (!looksLikeEmail(email)) { say('That address looks incomplete — mind checking it?', true); input.focus(); return; }

      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Signing up…';
      try {
        await send(email);
        form.reset();
        say("You're on the list. Thank you.");
      } catch (err) {
        /* Either way their address is kept -- never tell someone it failed and
           then also throw the address away. */
        queue(email);
        form.reset();
        /* No "check your inbox" here: nothing sends a confirmation yet, and a
           promise the system cannot keep is worse than a plain acknowledgement. */
        say("You're on the list. Thank you.");
      } finally {
        btn.disabled = false; btn.textContent = label;
      }
    });
  });
})();
