/* ===================== Kindred — Feel Better / Kindred Moments library ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ===================== DATA ===================== */

const CATS = {
  calm:   { label: 'Calm your mind', tint: '#E6E4EC',
    icon: '<path d="M8 24c5-6 11-6 16 0s11 6 16 0" opacity=".9"/><path d="M8 33c5-6 11-6 16 0s11 6 16 0" opacity=".6"/><path d="M8 15c5-6 11-6 16 0s11 6 16 0" opacity=".6"/>' },
  spiral: { label: 'Slow the spiral', tint: '#ECE5F1',
    icon: '<path d="M12 28c3-9 8-14 14-13s9 6 7 11-8 7-12 4 0-10 6-10 10 4 9 9"/>' },
  sleep:  { label: 'Sleep better', tint: '#E3E8EF',
    icon: '<path d="M32 28a12 12 0 0 1-15.3-15.3A12 12 0 1 0 32 28z"/>' },
  reset:  { label: 'Reset & recharge', tint: '#F3E4C9',
    icon: '<circle cx="24" cy="26" r="7"/><path d="M24 12v4M35 15.7l-2.8 2.8M38 26h-4M13 15.7l2.8 2.8M10 26h4M10 36h28"/>' },
  talk:   { label: 'Before hard conversations', tint: '#F4E3DB',
    icon: '<path d="M12 12h20a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H21l-7 6v-6h-2a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z"/><path d="M15 19h14M15 24h9"/>' },
  steady: { label: 'Build steadiness', tint: '#E6EAE2',
    icon: '<path d="M24 40V22"/><path d="M24 26c0-8-6-12-14-12 0 8 6 12 14 12zM24 20c0-7 5-10 12-10 0 7-5 10-12 10z"/>' }
};

const TOOLS = [
  { cat: 'calm', time: '1 min', title: 'Stop a Spiral', desc: 'Ground yourself fast when your mind races.', play: 'spiral' },
  { cat: 'calm', time: '2 min', title: 'Box Breathing', desc: 'In, hold, out, hold — four even sides to steady yourself.', play: 'box' },
  { cat: 'calm', time: '2 min', title: '4-7-8 Breathing', desc: 'A slower exhale tells your body the emergency is over.', play: '478' },
  { cat: 'calm', time: '3 min', title: '5-4-3-2-1 Grounding', desc: 'Come back to the room through your senses.', play: 'senses' },
  { cat: 'calm', time: '4 min', title: 'Unclench', desc: "Find the tension you didn't know you were holding, and let it go." },
  { cat: 'spiral', time: '1 min', title: 'Interrupt the Loop', desc: 'A quick grounding reset when your thoughts keep circling.' },
  { cat: 'spiral', time: '5 min', title: 'Worry Time', desc: 'Give repetitive thoughts a container instead of your whole evening.' },
  { cat: 'spiral', time: '3 min', title: "Name What You're Solving", desc: 'Separate a real problem from a hypothetical one.' },
  { cat: 'spiral', time: '5 min', title: 'Brain Dump, Then Sort', desc: 'Move the mental pile somewhere visible.', play: 'dump' },
  { cat: 'spiral', time: '3 min', title: 'Before You Ask for Reassurance', desc: "Pause and notice what you're hoping certainty will give you." },
  { cat: 'sleep', time: '3 min', title: 'Fall Asleep Easier', desc: 'Quiet your thoughts and rest deeper.' },
  { cat: 'sleep', time: '4 min', title: 'Evening Wind-Down for an Overactive Mind', desc: "Close the day's tabs, one at a time." },
  { cat: 'sleep', time: '3 min', title: 'Racing Mind at 2 A.M.', desc: "For when you're awake and the worry has the mic." },
  { cat: 'sleep', time: '5 min', title: 'Put the Day Down', desc: 'A short ritual for ending the day on purpose.' },
  { cat: 'reset', time: '5 min', title: 'Reset After a Hard Day', desc: 'Release the heaviness and reset your mind.' },
  { cat: 'reset', time: '3 min', title: '3-Minute Nervous System Reset', desc: 'For when your brain still feels "on" after work.' },
  { cat: 'reset', time: '1 min', title: 'The Doorway Reset', desc: 'A tiny ritual for the space between work and home.' },
  { cat: 'reset', time: '2 min', title: 'Shake It Off', desc: 'Let your body finish the stress cycle your mind started.' },
  { cat: 'talk', time: '3 min', title: 'Before You Send That Text', desc: 'Pause. Breathe. Choose what aligns with you.' },
  { cat: 'talk', time: '4 min', title: 'Before a Hard Conversation', desc: 'Get clear on what you need before you walk in.' },
  { cat: 'talk', time: '5 min', title: 'After the Argument', desc: 'Settle your body, then decide what happens next.' },
  { cat: 'steady', time: '2 min', title: "You're Not Alone", desc: 'A reminder for when it all feels too much.' },
  { cat: 'steady', time: '3 min', title: 'Self-Compassion Break', desc: 'Talk to yourself like someone you love.' },
  { cat: 'steady', time: '2 min', title: 'Name It to Tame It', desc: 'Putting a feeling into words loosens its grip.' },
  { cat: 'steady', time: '4 min', title: 'Meet Your Inner Critic', desc: 'Notice the voice, question its job, soften its script.' }
];

/* Moment picker — lived-experience doors into the library */
const PICKS = [
  { label: "My mind won't stop racing", cat: 'spiral', tint: '#ECE5F1',
    context: 'For a racing mind — start small:', bridge: true },
  { label: "I'm about to snap", cat: 'calm', tint: '#F0DBD9',
    context: "For the moment before the boil-over — breathe first, decide second:" },
  { label: "I can't sleep", cat: 'sleep', tint: '#E3E8EF',
    context: "For the hours the rest of the world is asleep:" },
  { label: "I'm dreading a conversation", cat: 'talk', tint: '#F4E3DB',
    context: 'For saying the hard thing without abandoning yourself:' },
  { label: "I'm running on empty", cat: 'reset', tint: '#F3E4C9',
    context: 'For refilling, even a little:' },
  { label: "I'm being hard on myself", cat: 'steady', tint: '#E6EAE2',
    context: 'For meeting yourself with something gentler:' },
  { label: 'I feel panicky', cat: 'calm', tint: '#E6E4EC',
    context: 'For settling your body first — the thoughts can wait:' },
  { label: "I'm okay — I want to build steadiness", cat: 'steady', tint: '#E9E1EE',
    context: 'For building the muscle before you need it:' }
];

/* ===================== RENDER ===================== */

document.getElementById('fb-picker-row').innerHTML = PICKS.map((p, i) => `
  <button class="fb-pick" data-pick="${i}" style="--chip:${p.tint}">${p.label}</button>`).join('');

const catBar = document.getElementById('fb-cats');
catBar.innerHTML = `<button class="fb-cat active" data-cat="all">All</button>` +
  Object.entries(CATS).map(([k, c]) => `<button class="fb-cat" data-cat="${k}">${c.label}</button>`).join('');

const grid = document.getElementById('fb-toolgrid');
grid.innerHTML = TOOLS.map((t, i) => {
  const c = CATS[t.cat];
  const start = t.play
    ? `<button class="pillar-link fb-start" data-play="${t.play}">Start <span aria-hidden="true">→</span></button>`
    : `<a class="pillar-link fb-soon" href="#" title="Coming soon">Start <span aria-hidden="true">→</span></a>`;
  return `
  <article class="fb-tool ${t.play ? 'fb-tool-playable' : ''}" data-cat="${t.cat}">
    <span class="moment-time">${t.time}</span>
    ${t.play ? '<span class="fb-playtag">Try it now</span>' : ''}
    <span class="fb-toolicon" style="--chip:${c.tint}">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.icon}</svg>
    </span>
    <h3>${t.title}</h3>
    <p>${t.desc}</p>
    <div class="mws-momentctas">
      ${start}
      <button class="mws-savemoment" data-tool="${i}" aria-label="Save ${t.title} to My Kindred">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z"/></svg>
      </button>
    </div>
  </article>`;
}).join('');

/* ===================== FILTERING ===================== */

const contextLine = document.getElementById('fb-context');
const countLine = document.getElementById('fb-count');
const DEFAULT_CONTEXT = 'Every tool, in one quiet place. Filter by what you need.';

function setFilter(cat, context) {
  document.querySelectorAll('.fb-cat').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  let shown = 0;
  document.querySelectorAll('.fb-tool').forEach(t => {
    const show = cat === 'all' || t.dataset.cat === cat;
    t.hidden = !show;
    if (show) shown++;
  });
  contextLine.innerHTML = context || (cat === 'all' ? DEFAULT_CONTEXT : `${CATS[cat].label} — ${shown} Moments.`);
  countLine.textContent = cat === 'all' ? `${TOOLS.length} Moments and growing — reviewed for clinical accuracy.` : '';
}
setFilter('all');

catBar.addEventListener('click', e => {
  const b = e.target.closest('.fb-cat');
  if (b) setFilter(b.dataset.cat);
});

document.getElementById('fb-picker-row').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  document.querySelectorAll('.fb-pick').forEach(x => x.classList.toggle('selected', x === b));
  const p = PICKS[Number(b.dataset.pick)];
  const bridge = p.bridge
    ? ` <a class="fb-bridgelink" href="mind-wont-stop.html">Want to understand this pattern? <span aria-hidden="true">→</span></a>`
    : '';
  setFilter(p.cat, p.context + bridge);
  document.getElementById('fb-library').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelectorAll('[data-coll]').forEach(a => a.addEventListener('click', () => {
  setFilter(a.dataset.coll);
}));

/* ===================== HERO BREATHING MOMENT ===================== */

const PHASES = [
  { label: 'Breathe in…', secs: 4, scale: 1 },
  { label: 'Hold…', secs: 4, scale: 1 },
  { label: 'Let it go…', secs: 6, scale: 0.55 }
];
const CYCLES = 4;

const circle = document.getElementById('fb-circle');
const phaseEl = document.getElementById('fb-phase');
const breatheBtn = document.getElementById('fb-breathe-btn');
const dots = document.querySelectorAll('#fb-dots span');

let running = false;
let timer = null;

function setCircle(scale, secs) {
  circle.style.transition = `transform ${secs}s cubic-bezier(.4, 0, .3, 1)`;
  circle.style.transform = `scale(${scale})`;
}

function runPhase(cycle, phaseIdx) {
  if (!running) return;
  if (cycle >= CYCLES) {
    running = false;
    phaseEl.textContent = "That's a minute you gave yourself.";
    breatheBtn.textContent = 'Again';
    setCircle(0.7, 2);
    return;
  }
  dots.forEach((d, i) => d.classList.toggle('done', i < cycle));
  const p = PHASES[phaseIdx];
  phaseEl.textContent = p.label;
  if (phaseIdx === 0 || phaseIdx === 2) setCircle(p.scale, p.secs);
  timer = setTimeout(() => {
    const next = phaseIdx + 1;
    if (next >= PHASES.length) runPhase(cycle + 1, 0);
    else runPhase(cycle, next);
  }, p.secs * 1000);
}

breatheBtn.addEventListener('click', () => {
  if (running) {
    running = false;
    clearTimeout(timer);
    phaseEl.textContent = 'Paused — whenever you’re ready.';
    breatheBtn.textContent = 'Resume';
    return;
  }
  running = true;
  breatheBtn.textContent = 'Pause';
  dots.forEach(d => d.classList.remove('done'));
  setCircle(0.55, 0.6);
  setTimeout(() => runPhase(0, 0), 650);
});

/* ===================== TOOL PLAYERS ===================== */

const PLAYERS = {
  spiral: {
    type: 'steps', title: 'Stop a Spiral', time: '1 min',
    intro: "Six small steps. Let them carry you — or tap Next at your own pace.",
    steps: [
      { h: 'Stop.', p: "You noticed the spiral. That's the hardest part — noticing is already working.", secs: 8 },
      { h: 'Feet on the floor.', p: 'Press them down. Feel the ground push back against you.', secs: 10 },
      { h: 'One long exhale.', p: 'In through your nose… and out slow, like you\'re fogging a window.', secs: 12 },
      { h: 'Look around.', p: "Find one thing in the room that wasn't here a year ago.", secs: 12 },
      { h: 'Name what\'s real.', p: 'Say — out loud if you can — what is actually happening right now. Not what might happen.', secs: 12 },
      { h: 'Come back.', p: 'The thought may return. You can return here, too.', secs: 8 }
    ],
    done: { h: 'You interrupted the loop.', p: "That's not a small thing. If the thoughts keep circling tonight, Worry Time can give them a container." }
  },
  box: {
    type: 'breath', title: 'Box Breathing', time: '2 min',
    blurb: 'Four even sides: in, hold, out, hold. Used by people whose job is staying calm under pressure.',
    cycles: 4,
    phases: [
      { label: 'Breathe in…', secs: 4, scale: 1 },
      { label: 'Hold…', secs: 4, scale: 1 },
      { label: 'Breathe out…', secs: 4, scale: 0.55 },
      { label: 'Hold…', secs: 4, scale: 0.55 }
    ],
    done: 'Four steady squares. Well held.'
  },
  478: {
    type: 'breath', title: '4-7-8 Breathing', time: '2 min',
    blurb: 'In for four, hold for seven, out for eight. The long exhale is the message: the emergency is over.',
    cycles: 3,
    phases: [
      { label: 'Breathe in…', secs: 4, scale: 1 },
      { label: 'Hold…', secs: 7, scale: 1 },
      { label: 'Out, slowly…', secs: 8, scale: 0.55 }
    ],
    done: 'Three long exhales. Your body heard you.'
  },
  senses: {
    type: 'senses', title: '5-4-3-2-1 Grounding', time: '3 min',
    intro: 'Come back to the room through your senses. Tap each time you find one — small counts.',
    stages: [
      { sense: 'things you can see', n: 5, hint: 'A shadow. A corner. The way the light lands. Small counts.', tint: '#E6E4EC' },
      { sense: 'things you can feel', n: 4, hint: 'Your feet in your shoes. The chair. Air on your skin. Fabric.', tint: '#E6EAE2' },
      { sense: 'things you can hear', n: 3, hint: 'A hum. Traffic. Your own breath counts, too.', tint: '#E3E8EF' },
      { sense: 'things you can smell', n: 2, hint: 'Or two smells you like, if the room is quiet on scent.', tint: '#F3E4C9' },
      { sense: 'thing you can taste', n: 1, hint: "Or one thing you're grateful for. That works, too.", tint: '#F4E3DB' }
    ],
    done: { h: "You're here.", p: 'Wherever your mind was, your senses just walked you home.' }
  },
  dump: {
    type: 'dump', title: 'Brain Dump, Then Sort', time: '5 min',
    intro: 'Empty the mental pile — one thing per line. Spelling and order don\'t matter. No one sees this but you.',
    done: { h: 'The pile has a shape now.', p: 'Nothing got heavier by writing it down — most things get lighter.' }
  }
};

const playerOverlay = document.getElementById('fb-player');
const playerScreen = document.getElementById('fb-player-screen');
let playerTimers = [];

function pTimer(fn, ms) { const t = setTimeout(fn, ms); playerTimers.push(t); return t; }
function clearPlayerTimers() { playerTimers.forEach(clearTimeout); playerTimers = []; }

function openPlayer(key) {
  const cfg = PLAYERS[key];
  if (!cfg) return;
  playerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  if (cfg.type === 'steps') renderSteps(cfg);
  else if (cfg.type === 'breath') renderBreath(cfg);
  else if (cfg.type === 'senses') renderSenses(cfg);
  else if (cfg.type === 'dump') renderDump(cfg);
}

function closePlayer() {
  clearPlayerTimers();
  playerOverlay.hidden = true;
  playerScreen.innerHTML = '';
  document.body.style.overflow = '';
}
document.getElementById('fb-player-close').addEventListener('click', closePlayer);
playerOverlay.addEventListener('click', e => { if (e.target === playerOverlay) closePlayer(); });

function playerHead(cfg) {
  return `<p class="fb-player-kicker">Kindred Moment · ${cfg.time}</p><h2 class="fb-player-title">${cfg.title}</h2>`;
}

function playerDone(cfg) {
  clearPlayerTimers();
  const d = cfg.done && cfg.done.h ? cfg.done : { h: 'Done.', p: cfg.done || '' };
  playerScreen.innerHTML = `
    ${playerHead(cfg)}
    <div class="fb-player-donebox">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>
      <h3>${d.h}</h3>
      <p>${d.p}</p>
    </div>
    <div class="fb-player-ctas">
      <button class="btn btn-dark" id="fb-player-finish">Done</button>
      <button class="btn btn-outline" id="fb-player-again">Once more</button>
    </div>`;
  playerScreen.querySelector('#fb-player-finish').addEventListener('click', closePlayer);
  playerScreen.querySelector('#fb-player-again').addEventListener('click', () => {
    const key = Object.keys(PLAYERS).find(k => PLAYERS[k] === cfg);
    openPlayer(key);
  });
}

/* --- guided steps (Stop a Spiral) --- */
function renderSteps(cfg) {
  let idx = -1;
  function showStep(i) {
    clearPlayerTimers();
    if (i >= cfg.steps.length) return playerDone(cfg);
    idx = i;
    const s = cfg.steps[i];
    playerScreen.innerHTML = `
      ${playerHead(cfg)}
      <p class="fb-player-progresslabel">${i + 1} of ${cfg.steps.length}</p>
      <div class="fb-step">
        <h3>${s.h}</h3>
        <p>${s.p}</p>
      </div>
      <div class="fb-stepbar"><span id="fb-stepbar-fill"></span></div>
      <div class="fb-player-ctas">
        <button class="btn btn-dark" id="fb-step-next">Next <span aria-hidden="true">→</span></button>
      </div>`;
    const fill = playerScreen.querySelector('#fb-stepbar-fill');
    requestAnimationFrame(() => {
      fill.style.transition = `width ${s.secs}s linear`;
      fill.style.width = '100%';
    });
    pTimer(() => showStep(i + 1), s.secs * 1000);
    playerScreen.querySelector('#fb-step-next').addEventListener('click', () => showStep(i + 1));
  }
  playerScreen.innerHTML = `
    ${playerHead(cfg)}
    <p class="fb-player-intro">${cfg.intro}</p>
    <div class="fb-player-ctas"><button class="btn btn-dark" id="fb-step-begin">Begin</button></div>`;
  playerScreen.querySelector('#fb-step-begin').addEventListener('click', () => showStep(0));
}

/* --- breathing (Box / 4-7-8) --- */
function renderBreath(cfg) {
  playerScreen.innerHTML = `
    ${playerHead(cfg)}
    <p class="fb-player-intro">${cfg.blurb}</p>
    <div class="fb-player-breathe">
      <div class="fb-breathe-ring">
        <div class="fb-breathe-circle" id="fbp-circle"></div>
        <p class="fb-breathe-phase" id="fbp-phase">Ready?</p>
      </div>
    </div>
    <div class="fb-breathe-dots" id="fbp-dots">${'<span></span>'.repeat(cfg.cycles)}</div>
    <div class="fb-player-ctas"><button class="btn btn-dark" id="fbp-btn">Begin</button></div>`;

  const c = playerScreen.querySelector('#fbp-circle');
  const ph = playerScreen.querySelector('#fbp-phase');
  const btn = playerScreen.querySelector('#fbp-btn');
  const cdots = playerScreen.querySelectorAll('#fbp-dots span');
  let on = false;

  function scale(sc, secs) {
    c.style.transition = `transform ${secs}s cubic-bezier(.4, 0, .3, 1)`;
    c.style.transform = `scale(${sc})`;
  }
  function phase(cycle, i) {
    if (!on) return;
    if (cycle >= cfg.cycles) { on = false; return playerDone(cfg); }
    cdots.forEach((d, j) => d.classList.toggle('done', j < cycle));
    const p = cfg.phases[i];
    ph.textContent = p.label;
    scale(p.scale, p.secs);
    pTimer(() => {
      const n = i + 1;
      if (n >= cfg.phases.length) phase(cycle + 1, 0);
      else phase(cycle, n);
    }, p.secs * 1000);
  }
  btn.addEventListener('click', () => {
    if (on) {
      on = false; clearPlayerTimers();
      ph.textContent = 'Paused — whenever you’re ready.';
      btn.textContent = 'Resume';
      return;
    }
    on = true; btn.textContent = 'Pause';
    cdots.forEach(d => d.classList.remove('done'));
    scale(0.55, 0.6);
    pTimer(() => phase(0, 0), 650);
  });
}

/* --- 5-4-3-2-1 senses --- */
function renderSenses(cfg) {
  function stage(i) {
    if (i >= cfg.stages.length) return playerDone(cfg);
    const st = cfg.stages[i];
    let left = st.n;
    playerScreen.innerHTML = `
      ${playerHead(cfg)}
      <p class="fb-player-progresslabel">${i + 1} of ${cfg.stages.length}</p>
      <div class="fb-sense" style="--chip:${st.tint}">
        <p class="fb-sense-count" id="fb-sense-count">${left}</p>
        <h3>${st.n === 1 ? 'Find 1' : 'Find ' + st.n} ${st.sense}</h3>
        <p class="fb-sense-hint">${st.hint}</p>
      </div>
      <div class="fb-player-ctas">
        <button class="btn btn-dark" id="fb-sense-found">Found one</button>
        <button class="flow-restart" id="fb-sense-skip">Skip this sense</button>
      </div>`;
    const countEl = playerScreen.querySelector('#fb-sense-count');
    playerScreen.querySelector('#fb-sense-found').addEventListener('click', () => {
      left--;
      if (left <= 0) return stage(i + 1);
      countEl.textContent = left;
      countEl.classList.remove('fb-pop');
      void countEl.offsetWidth;
      countEl.classList.add('fb-pop');
    });
    playerScreen.querySelector('#fb-sense-skip').addEventListener('click', () => stage(i + 1));
  }
  playerScreen.innerHTML = `
    ${playerHead(cfg)}
    <p class="fb-player-intro">${cfg.intro}</p>
    <div class="fb-player-ctas"><button class="btn btn-dark" id="fb-sense-begin">Begin</button></div>`;
  playerScreen.querySelector('#fb-sense-begin').addEventListener('click', () => stage(0));
}

/* --- brain dump, then sort --- */
function renderDump(cfg) {
  playerScreen.innerHTML = `
    ${playerHead(cfg)}
    <p class="fb-player-intro">${cfg.intro}</p>
    <textarea class="fb-dump-area" id="fb-dump-area" rows="8" placeholder="the email I haven't answered&#10;mom's birthday&#10;that thing I said on Tuesday&#10;…"></textarea>
    <div class="fb-player-ctas">
      <button class="btn btn-dark" id="fb-dump-sort" disabled>Sort it out <span aria-hidden="true">→</span></button>
    </div>
    <p class="flow-fine">Nothing you write here is stored or sent anywhere. It lives on this page, then it's gone.</p>`;
  const area = playerScreen.querySelector('#fb-dump-area');
  const sortBtn = playerScreen.querySelector('#fb-dump-sort');
  area.addEventListener('input', () => sortBtn.disabled = !area.value.trim());
  sortBtn.addEventListener('click', () => {
    const items = area.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20)
      .map(text => ({ text, bin: null }));
    renderSort(items);
  });

  function renderSort(items) {
    playerScreen.innerHTML = `
      ${playerHead(cfg)}
      <p class="fb-player-intro">Now give each one a home. Be honest — most things are not "now."</p>
      <div class="fb-dump-list">
        ${items.map((it, i) => `
          <div class="fb-dump-item" data-i="${i}">
            <span class="fb-dump-text">${it.text.replace(/</g, '&lt;')}</span>
            <span class="fb-dump-bins">
              <button data-bin="now">Now</button>
              <button data-bin="later">Later</button>
              <button data-bin="letgo">Let go</button>
            </span>
          </div>`).join('')}
      </div>
      <div class="fb-player-ctas">
        <button class="btn btn-dark" id="fb-dump-done" disabled>See the sort <span aria-hidden="true">→</span></button>
      </div>`;
    const doneBtn = playerScreen.querySelector('#fb-dump-done');
    playerScreen.querySelector('.fb-dump-list').addEventListener('click', e => {
      const b = e.target.closest('[data-bin]');
      if (!b) return;
      const row = b.closest('.fb-dump-item');
      const it = items[Number(row.dataset.i)];
      it.bin = b.dataset.bin;
      row.querySelectorAll('[data-bin]').forEach(x => x.classList.toggle('picked', x === b));
      row.classList.add('binned');
      doneBtn.disabled = !items.every(x => x.bin);
    });
    doneBtn.addEventListener('click', () => {
      const now = items.filter(x => x.bin === 'now');
      const later = items.filter(x => x.bin === 'later');
      const letgo = items.filter(x => x.bin === 'letgo');
      playerScreen.innerHTML = `
        ${playerHead(cfg)}
        <div class="fb-dump-result">
          <div class="fb-dump-col">
            <h3>Now · ${now.length}</h3>
            ${now.length ? `<ul>${now.map(x => `<li>${x.text.replace(/</g, '&lt;')}</li>`).join('')}</ul>
              <p class="fb-dump-nudge">${now.length > 1 ? 'Pick just one to start. The rest will wait their turn.' : 'One thing. That\'s a plan, not a pile.'}</p>` : '<p class="fb-dump-nudge">Nothing needs you right now. Let that land.</p>'}
          </div>
          <div class="fb-dump-col fb-dump-col-muted">
            <h3>Later · ${later.length}</h3>
            <p>Parked, not forgotten. It'll be here tomorrow.</p>
          </div>
          <div class="fb-dump-col fb-dump-col-muted">
            <h3>Let go · ${letgo.length}</h3>
            <p>${letgo.length ? 'Released. Some things only had power while they were vague.' : 'Nothing to release this time.'}</p>
          </div>
        </div>
        <div class="fb-player-ctas">
          <button class="btn btn-dark" id="fb-dump-finish">Done</button>
        </div>
        <p class="flow-fine">${cfg.done.p}</p>`;
      playerScreen.querySelector('#fb-dump-finish').addEventListener('click', closePlayer);
    });
  }
}

/* Start buttons + deep links (#play=spiral|box|478|senses|dump) */
grid.addEventListener('click', e => {
  const b = e.target.closest('.fb-start');
  if (b) openPlayer(b.dataset.play);
});
function openFromHash() {
  const m = location.hash.match(/play=([a-z0-9]+)/);
  if (m && PLAYERS[m[1]]) openPlayer(m[1]);
}
window.addEventListener('hashchange', openFromHash);
openFromHash();

/* ===================== SAVE DRAWER ===================== */

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

document.querySelectorAll('.mws-savemoment').forEach(b => b.addEventListener('click', () => {
  if (localStorage.getItem('mk-account')) {
    b.classList.toggle('saved');
    return;
  }
  if (!sessionStorage.getItem('mk-drawer-shown')) {
    sessionStorage.setItem('mk-drawer-shown', '1');
    drawer.classList.add('open');
    setTimeout(() => drawer.classList.remove('open'), 12000);
  } else {
    drawer.classList.add('open');
  }
}));
