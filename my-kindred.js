/* ===================== Kindred — My Kindred dashboard ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ---------- saved library tabs ---------- */
const savedTabs = document.querySelectorAll('.mk-tab');
const savedCards = document.querySelectorAll('#mk-saved-row [data-type]');
savedTabs.forEach(t => t.addEventListener('click', () => {
  savedTabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const f = t.dataset.filter;
  savedCards.forEach(c => c.hidden = f !== 'all' && c.dataset.type !== f);
}));

/* ---------- "What do you need right now?" ---------- */
const NEEDS = [
  { key: 'calm', label: 'I need to calm down',
    lead: "Let's slow things down together.",
    note: 'Short resets have helped you feel grounded before.',
    steps: [
      { title: 'Reset After a Hard Day', meta: '5 min · Kindred Moment', href: 'feel-better.html' },
      { title: '3-minute nervous system reset', meta: 'From your plan this week', href: 'feel-better.html' }
    ] },
  { key: 'spiral', label: 'I need to stop spiraling',
    lead: "Racing thoughts are loud, but they're not in charge.",
    note: "You've been exploring overthinking — these are built for exactly this.",
    steps: [
      { title: 'Stop a Spiral', meta: '1 min · Kindred Moment', href: 'feel-better.html' },
      { title: 'Worry Time (5-Minute Practice)', meta: 'Recommended for you', href: 'feel-better.html' }
    ] },
  { key: 'sleep', label: 'I need to sleep',
    lead: "Let's help your mind clock out.",
    note: 'Sleep felt harder on 4 days recently — this is a good place to start.',
    steps: [
      { title: 'Fall Asleep Easier', meta: '3 min · Kindred Moment', href: 'feel-better.html' },
      { title: 'Evening Wind-Down for an Overactive Mind', meta: '4 min', href: 'feel-better.html' }
    ] },
  { key: 'understand', label: "I need to understand what I'm feeling",
    lead: "You don't need a label to start.",
    note: 'Start with the feeling — Kindred will help you connect the dots.',
    steps: [
      { title: "Explore how you're feeling", meta: 'Understand Yourself', href: 'understand-yourself.html' },
      { title: 'Take a Kindred Check-In', meta: 'A few gentle minutes', href: 'start-here.html' }
    ] },
  { key: 'conversation', label: 'I need help with a conversation',
    lead: 'Hard conversations deserve a pause first.',
    note: 'You saved a tool for this — it might be the right moment for it.',
    steps: [
      { title: 'Before You Send That Text', meta: 'Saved · 3 min', href: 'feel-better.html' },
      { title: 'Why do I shut down during conflict?', meta: 'Continue reading · 8 min', href: 'understand-yourself.html' }
    ] },
  { key: 'talk', label: 'I want to talk to someone',
    lead: "That's a strong step, not a last resort.",
    note: 'You have 3 therapist profiles saved — Dr. Maya Chen is a 94% match.',
    steps: [
      { title: 'See your saved therapists', meta: 'Therapy fit', href: 'index.html#find-therapist' },
      { title: 'Need support right now? Call or text 988', meta: 'Free · confidential · 24/7', href: 'start-here.html' }
    ] }
];

const needOverlay = document.getElementById('mk-need-overlay');
const needScreen = document.getElementById('mk-need-screen');

function needMenu() {
  needScreen.innerHTML = `
    <p class="flow-kicker">Right now</p>
    <h2 class="flow-title">What do you need right now?</h2>
    <div class="flow-options">
      ${NEEDS.map(n => `<button class="flow-option" data-need="${n.key}">${n.label}</button>`).join('')}
    </div>`;
  needScreen.querySelectorAll('[data-need]').forEach(b =>
    b.addEventListener('click', () => needResult(NEEDS.find(n => n.key === b.dataset.need))));
}

function needResult(n) {
  needScreen.innerHTML = `
    <p class="flow-kicker">${n.label}</p>
    <h2 class="flow-title">${n.lead}</h2>
    <p class="flow-hint">${n.note}</p>
    <div class="flow-nextsteps">
      ${n.steps.map(s => `
        <a class="next-step" href="${s.href}">
          <h3>${s.title}</h3>
          <p>${s.meta}</p>
          <span class="path-cta">Go <span aria-hidden="true">→</span></span>
        </a>`).join('')}
    </div>
    <button class="flow-restart" id="mk-need-back">← Something else</button>`;
  needScreen.querySelector('#mk-need-back').addEventListener('click', needMenu);
}

document.getElementById('mk-need-btn').addEventListener('click', () => {
  needOverlay.hidden = false;
  needMenu();
});
document.getElementById('mk-need-close').addEventListener('click', () => needOverlay.hidden = true);
needOverlay.addEventListener('click', e => { if (e.target === needOverlay) needOverlay.hidden = true; });

/* ---------- first-visit onboarding ---------- */
const GOALS = ["Understand what I'm feeling", 'Feel less overwhelmed', 'Manage anxiety', 'Sleep better',
  'Build better relationships', 'Work through something difficult', 'Find a therapist', "I'm not sure yet"];
const SUPPORT = [
  ['Just let me browse', "Explore freely — we'll stay out of the way."],
  ['Recommend things occasionally', 'Gentle suggestions based on what you save.'],
  ['Help me build a small plan', 'A little structure, one week at a time.'],
  ["I'm looking for professional support", "We'll keep therapist matching front and center."]
];

const onboard = document.getElementById('mk-onboard');
const onboardScreen = document.getElementById('mk-onboard-screen');

function onboardStep(step) {
  if (step === 1) {
    onboardScreen.innerHTML = `
      <p class="flow-kicker">Welcome</p>
      <h2 class="flow-title">Let's make this yours.</h2>
      <p class="flow-hint">What would you like Kindred to help you with right now? Choose any.</p>
      <div class="flow-chips">
        ${GOALS.map((g, i) => `<label class="flow-chip"><input type="checkbox" data-goal="${i}"><span>${g}</span></label>`).join('')}
      </div>
      <button class="btn btn-dark flow-continue" id="ob-next">Continue <span aria-hidden="true">→</span></button>`;
    onboardScreen.querySelector('#ob-next').addEventListener('click', () => onboardStep(2));
  } else if (step === 2) {
    onboardScreen.innerHTML = `
      <p class="flow-kicker">One more thing</p>
      <h2 class="flow-title">How much support feels right?</h2>
      <div class="flow-impacts">
        ${SUPPORT.map(([l, d], i) => `<button class="flow-impact" data-support="${i}"><strong>${l}</strong><span>${d}</span></button>`).join('')}
      </div>`;
    onboardScreen.querySelectorAll('[data-support]').forEach(b =>
      b.addEventListener('click', () => onboardStep(3)));
  } else {
    onboardScreen.innerHTML = `
      <p class="flow-kicker">All set</p>
      <h2 class="flow-title">Your Kindred is ready.</h2>
      <p class="flow-hint">Start anywhere. Save what helps. Come back when you need it.</p>
      <button class="btn btn-dark flow-continue" id="ob-done">Enter My Kindred <span aria-hidden="true">→</span></button>
      <p class="flow-fine">Free. Private. No app required.</p>`;
    onboardScreen.querySelector('#ob-done').addEventListener('click', () => {
      localStorage.setItem('mk-account', '1');
      onboard.hidden = true;
    });
  }
}

if (!localStorage.getItem('mk-account')) {
  onboard.hidden = false;
  onboardStep(1);
}
