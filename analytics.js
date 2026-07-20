/* ===================== Kindred — privacy-first analytics =====================
   PRINCIPLE: aggregate counts only. This tracker never collects names, emails,
   free text, check-in answers, or any identifier. There is no user ID, no
   session ID, and no IP handling. Admins see how often buttons are pressed —
   never who pressed them. Personal data stays on the visitor's device.
============================================================================= */
(() => {
  const STORE_KEY = 'kindred-metrics';
  const CONFIG_KEY = 'kindred-analytics-config'; /* optional {url, key} → Supabase live mode */
  const PROP_WHITELIST = ['plan', 'bill', 'tool', 'path']; /* the ONLY properties ever recorded */

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { counts: {}, plans: {}, since: null }; }
    catch (e) { return { counts: {}, plans: {}, since: null }; }
  }

  function track(event, props) {
    if (!event) return;
    /* sanitize: whitelist keys only, short string values only — PII cannot pass */
    const clean = {};
    if (props) PROP_WHITELIST.forEach(k => {
      if (props[k] != null) clean[k] = String(props[k]).slice(0, 40);
    });

    const m = load();
    if (!m.since) m.since = new Date().toISOString().slice(0, 10);
    m.counts[event] = (m.counts[event] || 0) + 1;
    if (event === 'portal_subscribed' && clean.plan) {
      m.plans[clean.plan] = (m.plans[clean.plan] || 0) + 1;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(m));

    /* optional live mode: fire-and-forget insert of {event, props} — nothing else */
    try {
      const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      if (cfg && cfg.url && cfg.key) {
        fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/events', {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.key,
            'Authorization': 'Bearer ' + cfg.key,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ event, props: clean })
        }).catch(() => {});
      }
    } catch (e) { /* analytics must never break the site */ }
  }

  window.kTrack = track;

  /* ---------- auto-instrumentation (centralized so page markup stays clean) ---------- */
  const AUTOTRACK = [
    /* front-door audience router */
    ['#kaud-client', 'frontdoor_looking_for_therapy'],
    ['#kaud-therapist', 'frontdoor_im_a_therapist'],
    ['#kaud-skip', 'frontdoor_dismissed'],
    ['#kaud-close', 'frontdoor_dismissed'],
    /* homepage */
    ['.hero-ctas a[href="#find-therapist"]', 'home_hero_find_therapist'],
    ['.hero-ctas a[href="start-here.html"]', 'home_start_where_you_are'],
    ['.mood', 'home_mood_tap'], /* counts the tap only — never which mood */
    ['#checkin-cta', 'home_checkin'],
    ['.flow-match-cta .btn', 'checkin_match_cta'],
    ['.match-copy .btn-dark', 'home_find_matches'],
    ['.match-side .pillar-link', 'home_view_profile'],
    ['.match-fav', 'home_save_therapist'],
    ['.mkt-inner .btn-dark', 'home_create_my_kindred'],
    /* therapists landing */
    ['#kt-price-cta', 'therapists_claim_spot'],
    ['.kt-bill', el => ({ event: 'therapists_toggle', props: { bill: el.dataset.bill } })],
    ['.kt-hero .btn-dark', 'therapists_create_profile'],
    /* therapist portal funnel */
    ['#kt-about-next', 'portal_profile_step'],
    ['#kt-to-checkout', 'portal_checkout'],
    ['#kt-subscribe', () => {
      let plan = 'annual';
      try { plan = (JSON.parse(localStorage.getItem('kt-account') || '{}').pendingPlan) || 'annual'; } catch (e) {}
      return { event: 'portal_subscribed', props: { plan } };
    }],
    ['#kt-cancel', 'portal_cancel'],
    ['#kt-resub', 'portal_reactivate'],
    /* start here */
    ['.path-card[data-path]', el => ({ event: 'starthere_path', props: { path: el.dataset.path } })],
    /* feel better */
    ['.fb-start', el => ({ event: 'tool_start', props: { tool: el.dataset.play } })],
    ['#fb-breathe-btn', 'tool_breathe_hero'],
    /* my kindred */
    ['#ob-done', 'myk_account_created'],
    ['#mk-need-btn', 'myk_need_right_now'],
    /* therapy page */
    ['.tp-match-ctas .btn-dark', 'therapy_find_matches'],
    ['#tp-ready-btn', 'therapy_readiness_check']
  ];

  document.addEventListener('click', e => {
    for (const [sel, spec] of AUTOTRACK) {
      const el = e.target.closest(sel);
      if (el) {
        const r = typeof spec === 'function' ? spec(el) : { event: spec };
        track(r.event, r.props);
        return; /* first match wins */
      }
    }
  }, true);

  /* one page-view count per load (path only — no referrer, no query, no identifiers) */
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  track('view_' + page);
})();
