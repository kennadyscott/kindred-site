/* ===================== Kindred marketing site ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.setAttribute('aria-controls', 'primary-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
  /* Move focus into the menu when it opens, and back to the button when it
     closes -- a keyboard user was otherwise left behind the drawer. */
  if (open) { const first = mainNav.querySelector('a'); if (first) first.focus(); }
});
/* Escape closes it, which is what every other disclosure on the web does. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !mainNav.classList.contains('open')) return;
  mainNav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.focus();
});
mainNav.addEventListener('click', e => {
  if (e.target.tagName === 'A') mainNav.classList.remove('open');
});

/* ---------- mood check-in ---------- */
const moods = document.querySelectorAll('.mood');
const checkinCta = document.getElementById('checkin-cta');
let selectedMood = null;

/* the CTA is a real door — it opens the Check-In flow on Start Here */
checkinCta.addEventListener('click', () => {
  window.location.href = 'start-here.html#path=checkin';
});

/* a mood tap is the moment of highest intent — it opens the Check-In directly,
   carrying the mood along (in the hash, so it never touches a server) */
moods.forEach(btn => {
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', () => {
    moods.forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
    selectedMood = btn.dataset.mood;
    checkinCta.textContent = selectedMood === 'Not sure'
      ? "That's okay — start the Check-In"
      : `Feeling ${selectedMood.toLowerCase()} — start the Check-In`;
    setTimeout(() => {
      window.location.href = 'start-here.html#path=checkin&mood=' + encodeURIComponent(selectedMood);
    }, 260);
  });
});

/* ---------- therapist carousel ---------- */
/* Prompt framing from the brand deck's therapist-profile prompts:
   "My therapy style is… / You may be a fit if… / First sessions feel like…" */
const THERAPISTS = [
  {
    name: 'Maya Chen, LMFT',
    meta: 'She/Her • Licensed in CA',
    match: 94,
    pills: ['Warm', 'Direct', 'Collaborative'],
    promptLabel: 'You may be a fit if…',
    quote: '“You look fine on paper but feel exhausted from being the strong one.”',
    specs: ['Anxiety', 'Life Transitions', 'Relationship issues', 'Burnout', 'Self-Esteem'],
    photo: 'assets/therapist-maya.jpg',
    skin: '#C68B62', hair: '#3B2531', top: '#B8A3C4', bg: '#EFE2D3'
  },
  {
    name: 'Devon Brooks, LPC',
    meta: 'He/Him • Licensed in TX',
    match: 92,
    pills: ['Grounded', 'Encouraging', 'Practical'],
    promptLabel: 'My therapy style is…',
    quote: '“A real conversation — warm, honest, and with somewhere to go.”',
    specs: ['Depression', 'Men’s Mental Health', 'Stress', 'Career', 'Grief'],
    photo: 'assets/therapist-devon.jpg',
    skin: '#8C5F41', hair: '#1E1712', top: '#687A65', bg: '#EDE4D6'
  },
  {
    name: 'Sofia Reyes, LCSW',
    meta: 'She/Her • Licensed in NY • Habla español',
    match: 88,
    pills: ['Gentle', 'Curious', 'Affirming'],
    promptLabel: 'First sessions feel like…',
    quote: '“A gentle map-making process. We move at your pace, but we do move.”',
    specs: ['Trauma', 'Family Dynamics', 'Identity', 'Anxiety', 'First-Gen Experiences'],
    photo: 'assets/therapist-sofia.jpg',
    skin: '#B87A54', hair: '#2A1B14', top: '#BE765F', bg: '#F1E4D8'
  }
];

const matchName = document.getElementById('match-name');
const matchMeta = document.getElementById('match-meta');
const matchBadge = document.getElementById('match-badge');
const matchPills = document.getElementById('match-pills');
const matchPromptLabel = document.getElementById('match-prompt-label');
const matchQuote = document.getElementById('match-quote');
const matchSpecs = document.getElementById('match-specs');
const matchPortrait = document.getElementById('match-portrait');
const dots = document.querySelectorAll('.dot');
const matchFav = document.querySelector('.match-fav');
let rotateIdx = 0;

function portraitSvg(t) {
  return `
    <rect width="300" height="300" fill="${t.bg}"/>
    <circle cx="150" cy="122" r="56" fill="${t.skin}"/>
    <path d="M96 128 q-8 -70 54 -72 q62 -2 56 70 q-4 34 -20 44 q10 -44 -36 -46 q-46 -2 -36 44 q-14 -10 -18 -40z" fill="${t.hair}"/>
    <path d="M70 268 q14 -74 80 -76 q66 2 80 76z" fill="${t.top}"/>
    <path d="M118 208 q32 -20 64 0 l-6 30 h-52z" fill="#FFF8EF"/>
    <path d="M128 168 q22 18 44 0 q-4 26 -22 26 q-18 0 -22 -26z" fill="${t.skin}"/>`;
}

function showTherapist(i) {
  const t = THERAPISTS[i];
  matchName.textContent = t.name;
  matchMeta.textContent = t.meta;
  /* No percentage: a score that could not fall below 62 was reassurance
     dressed as measurement, and it argued against the filter-not-score
     thesis. The fit tags carry it. */
  matchBadge.textContent = 'Kindred Match';
  matchPills.innerHTML = t.pills.map(p => `<span>${p}</span>`).join('');
  matchPromptLabel.textContent = t.promptLabel;
  matchQuote.textContent = t.quote;
  matchSpecs.innerHTML = t.specs.map(s => `<li>${s}</li>`).join('');
  if (t.photo) {
    matchPortrait.innerHTML = `<img src="${t.photo}" alt="${t.name}">`;
    /* if a photo ever fails to load, fall back to the illustrated portrait */
    matchPortrait.querySelector('img').addEventListener('error', () => {
      matchPortrait.innerHTML = `<svg viewBox="0 0 300 300" aria-hidden="true">${portraitSvg(t)}</svg>`;
    });
  } else {
    matchPortrait.innerHTML = `<svg viewBox="0 0 300 300" aria-hidden="true">${portraitSvg(t)}</svg>`;
  }
  dots.forEach((d, j) => {
    d.classList.toggle('active', i === j);
    d.setAttribute('aria-selected', i === j ? 'true' : 'false');
    d.setAttribute('role', 'tab');
    if (i === j) d.setAttribute('aria-current', 'true');
    else d.removeAttribute('aria-current');
  });
  /* Announce the change: without this a screen-reader user pressing the arrows
     hears nothing, because the card updates silently. */
  const live = document.getElementById('match-live');
  if (live) live.textContent = `Showing ${t.name}, therapist ${i + 1} of ${THERAPISTS.length}`;
  const countEl = document.getElementById('match-count');
  if (countEl) countEl.textContent = `${i + 1} of ${THERAPISTS.length}`;
  rotateIdx = i;                    // arrows and auto-rotate share one position
  matchFav.classList.remove('faved');
}

dots.forEach(d => d.addEventListener('click', () => {
  clearInterval(autoRotate);
  showTherapist(Number(d.dataset.idx));
}));

/* 8px dots were the only control -- no arrows, no sense of position, so the
   card was browsable by accident rather than by design. */
const step = (delta) => {
  clearInterval(autoRotate);
  showTherapist((rotateIdx + delta + THERAPISTS.length) % THERAPISTS.length);
};
const prevBtn = document.getElementById('match-prev');
const nextBtn = document.getElementById('match-next');
if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
if (nextBtn) nextBtn.addEventListener('click', () => step(1));

const autoRotate = setInterval(() => {
  rotateIdx = (rotateIdx + 1) % THERAPISTS.length;
  showTherapist(rotateIdx);
}, 7000);

/* ---------- save → My Kindred drawer (first-touch account moment) ---------- */
const drawer = document.createElement('div');
drawer.className = 'save-drawer';
drawer.innerHTML = `
  <button class="save-drawer-close" aria-label="Dismiss">✕</button>
  <h3>Keep this somewhere safe.</h3>
  <p>Save articles, tools, check-ins, and therapists to your own Kindred space.</p>
  <a class="btn btn-dark" href="my-kindred.html">Create My Kindred</a>
  <p class="mkt-fine">Free. Private. No app required.</p>`;
document.body.appendChild(drawer);
drawer.querySelector('.save-drawer-close').addEventListener('click', () => drawer.classList.remove('open'));

matchFav.addEventListener('click', () => {
  matchFav.classList.toggle('faved');
  if (matchFav.classList.contains('faved') && !localStorage.getItem('mk-account') && !sessionStorage.getItem('mk-drawer-shown')) {
    sessionStorage.setItem('mk-drawer-shown', '1');
    drawer.classList.add('open');
    setTimeout(() => drawer.classList.remove('open'), 12000);
  }
});

/* ---------- moments scroll ---------- */
const momentsRow = document.getElementById('moments-row');
document.getElementById('moments-arrow').addEventListener('click', () => {
  const nearEnd = momentsRow.scrollLeft + momentsRow.clientWidth >= momentsRow.scrollWidth - 20;
  momentsRow.scrollTo({ left: nearEnd ? 0 : momentsRow.scrollLeft + 360, behavior: 'smooth' });
});

/* ---------- smooth anchor scrolling ---------- */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

