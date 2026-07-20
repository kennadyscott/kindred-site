/* ===================== Kindred — global UX safety ===================== */
/* Horizontal scroll strips (card rows, tab bars) can trap vertical page
   scrolling on trackpads: a mostly-vertical gesture gets axis-locked to the
   strip's horizontal axis and the page stops moving — a visitor mid-page can
   think the page has ended. This arms every such strip (present, dynamically
   rendered, or revealed on resize) so genuine horizontal intent stays in the
   strip but vertical intent scrolls the page. Fixes it site-wide, once. */
(() => {
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

  function arm() {
    document.querySelectorAll('[class]').forEach(el => {
      if (el.dataset.hwheel || !isHorizontalScroller(el)) return;
      el.dataset.hwheel = '1';
      el.addEventListener('wheel', onWheel, { passive: false });
    });
  }

  arm();
  window.addEventListener('load', arm);          /* catch late-rendered strips */
  setTimeout(arm, 800);                           /* catch JS-populated rows (e.g. card grids) */
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(arm, 200); });
})();
