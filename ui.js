/* ---------------------------------------------------------------------------
   ui.js -- the orientation aids every page needs, and nothing else.
   Separate from app.js because app.js is homepage-specific (the carousel, the
   audience prompt) and these two belong on all of them.
--------------------------------------------------------------------------- */
/* ---------- back to top (long page, no way to get out of it) ---------- */
(() => {
  const btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<span aria-hidden="true">\u2191</span>';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => {
    /* honour reduced-motion: an unexpected smooth scroll is disorienting */
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const skip = document.querySelector('.brand');
    if (skip) skip.focus({ preventScroll: true });
  });
  const onScroll = () => btn.classList.toggle('is-on', window.scrollY > 900);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* A fragment link moves focus only in some browsers. Make the skip link
   actually deliver a keyboard user into the content, everywhere. */
(() => {
  const skip = document.querySelector('.skip-link');
  const main = document.getElementById('top');
  if (!skip || !main) return;
  skip.addEventListener('click', () => { main.focus({ preventScroll: true }); });
})();
