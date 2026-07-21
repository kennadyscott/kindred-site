/* ===================== Kindred — global site infrastructure ===================== */

/* ---- Single source of truth for the matching app's URL ----
   At launch, change THIS ONE LINE to the production app URL. Every "Match with
   a therapist" / store-badge / search link (marked data-app-link) and the
   dynamic check-in handoff read from it — no site-wide find-replace needed. */
window.KINDRED_APP_URL = 'https://raw.githack.com/kennadyscott/kindred/main/index.html';

(() => {
  /* point every static app link at the current KINDRED_APP_URL (their hardcoded
     href stays as a no-JS fallback; this makes the constant authoritative) */
  function wireAppLinks() {
    document.querySelectorAll('a[data-app-link]').forEach(a => { a.href = window.KINDRED_APP_URL; });
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
