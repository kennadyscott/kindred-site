/* ===================== Kindred — Start Here guided flow ===================== */

/* ---------- mobile nav (shared behavior with index) ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ---------- flow data ---------- */

const FEELINGS = [
  {
    key: 'thoughts', label: 'My thoughts feel like too much',
    prompt: 'What does that look like for you?',
    chips: ['I replay conversations', 'I imagine worst-case scenarios', "I can't switch off at night",
      'I second-guess decisions', 'My brain jumps between everything I need to do',
      'I get stuck on one thought', 'Something else']
  },
  {
    key: 'emotions', label: 'My emotions feel like too much',
    prompt: 'What does that look like for you?',
    chips: ['Waves of sadness that arrive out of nowhere', "I'm quicker to anger or irritation than usual",
      'I cry unexpectedly', 'My feelings feel too big for the moment',
      'My mood swings through the day', 'I get pulled into shame spirals', 'Something else']
  },
  {
    key: 'numb', label: "I don't feel much of anything",
    prompt: 'What does that look like for you?',
    chips: ['Days blur together', 'Things I used to love feel flat', "I'm going through the motions",
      "It's hard to care how things turn out", 'I feel disconnected from people around me', 'Something else']
  },
  {
    key: 'relationships', label: 'My relationships feel hard',
    prompt: 'What does that look like for you?',
    chips: ["I'm walking on eggshells", 'The same arguments keep repeating', 'I feel unseen or unheard',
      "I'm giving more than I'm getting back", 'I avoid hard conversations',
      'I feel lonely even around people', 'Something else']
  },
  {
    key: 'exhausted', label: "I'm exhausted",
    prompt: 'What does that look like for you?',
    chips: ["I'm tired no matter how much I sleep", 'Everything takes extra effort',
      "I'm running on empty by the afternoon", "I can't remember the last time I felt rested",
      'Small tasks feel huge', 'Something else']
  },
  {
    key: 'barely', label: "I'm getting through life, but barely",
    prompt: 'What does that look like for you?',
    chips: ['I hold it together in public, then crash', 'My weekends disappear into recovery',
      "I'm on autopilot most days", 'It feels like one more thing might tip it',
      "I'm keeping people at arm's length", 'Something else']
  },
  { key: 'none', label: 'Honestly, none of these', prompt: null, chips: null }
];

const IMPACTS = [
  { key: 'little', label: 'A little', desc: "I notice it, but I'm mostly okay." },
  { key: 'some', label: "More than I'd like", desc: "It's getting in the way sometimes." },
  { key: 'lot', label: 'A lot', desc: 'It feels heavy most days.' }
];

/* ---------- flow state ---------- */

const state = { path: null, feeling: null, chips: [], impact: null, history: [], mood: null };

const flowSection = document.getElementById('sh-flow');
const flowScreen = document.getElementById('flow-screen');
const flowProgress = document.getElementById('flow-progress');
const pathsSection = document.getElementById('sh-paths');
const heroSection = document.getElementById('sh-hero');

function enterFlow(path) {
  state.path = path;
  state.feeling = null; state.chips = []; state.impact = null; state.history = [];
  pathsSection.classList.add('is-hidden');
  heroSection.classList.add('is-hidden');
  flowSection.hidden = false;
  const first = {
    unsure: 'feelings', off: 'feelings', checkin: 'checkinIntro',
    now: 'safety', therapy: 'therapy', loved: 'loved'
  }[path];
  show(first);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitFlow() {
  flowSection.hidden = true;
  pathsSection.classList.remove('is-hidden');
  heroSection.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function show(screen, pushHistory = true) {
  if (pushHistory && flowScreen.dataset.current) state.history.push(flowScreen.dataset.current);
  flowScreen.dataset.current = screen;
  flowScreen.classList.remove('flow-in');
  void flowScreen.offsetWidth; /* restart the entry animation */
  flowScreen.innerHTML = SCREENS[screen]();
  flowScreen.classList.add('flow-in');
  flowProgress.textContent = PROGRESS[screen] || '';
  bindScreen();
  flowSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goBack() {
  const prev = state.history.pop();
  if (prev) show(prev, false);
  else exitFlow();
}

const PROGRESS = { feelings: 'Step 1 of 3', chips: 'Step 2 of 3', impact: 'Step 3 of 3' };

/* ---------- screens ---------- */

const guidedIntro = {
  unsure: "That's okay. Let's make this smaller.",
  off: "Let's look closer — gently.",
  checkin: 'Your Kindred Check-In'
};

const SCREENS = {

  feelings() {
    return `
      <p class="flow-kicker">${guidedIntro[state.path] || "Let's start here."}</p>
      <h2 class="flow-title">Which feels closest to how you've been lately?</h2>
      <div class="flow-options">
        ${FEELINGS.map(f => `<button class="flow-option" data-feeling="${f.key}">${f.label}</button>`).join('')}
      </div>`;
  },

  chips() {
    const f = FEELINGS.find(x => x.key === state.feeling);
    return `
      <p class="flow-kicker">${f.label}</p>
      <h2 class="flow-title">${f.prompt}</h2>
      <p class="flow-hint">Choose any that fit — there's no wrong answer.</p>
      <div class="flow-chips">
        ${f.chips.map((c, i) => `
          <label class="flow-chip">
            <input type="checkbox" data-chip="${i}" ${state.chips.includes(c) ? 'checked' : ''}>
            <span>${c}</span>
          </label>`).join('')}
      </div>
      <button class="btn btn-dark flow-continue" id="chips-continue">Continue <span aria-hidden="true">→</span></button>`;
  },

  none() {
    return `
      <p class="flow-kicker">That's useful to know, too.</p>
      <h2 class="flow-title">Sometimes it's hard to name — and that's a starting point in itself.</h2>
      <p class="flow-hint">The Kindred Check-In casts a wider net. It's a few gentle minutes of noticing, not a test.</p>
      <div class="flow-nextsteps">
        <button class="next-step" id="none-checkin">
          <h3>Take the Kindred Check-In</h3>
          <p>Explore how you've been feeling, more broadly.</p>
          <span class="path-cta">Check in with myself <span aria-hidden="true">→</span></span>
        </button>
        <button class="next-step" id="none-continue">
          <h3>Keep going anyway</h3>
          <p>Skip ahead and tell us how much life has felt affected lately.</p>
          <span class="path-cta">Continue <span aria-hidden="true">→</span></span>
        </button>
      </div>`;
  },

  impact() {
    return `
      <h2 class="flow-title">How much is this affecting your day-to-day life?</h2>
      <div class="flow-impacts">
        ${IMPACTS.map(im => `
          <button class="flow-impact" data-impact="${im.key}">
            <strong>${im.label}</strong>
            <span>${im.desc}</span>
          </button>`).join('')}
      </div>`;
  },

  result() {
    const f = FEELINGS.find(x => x.key === state.feeling);
    const recap = [
      f && f.key !== 'none' ? f.label : null,
      ...state.chips.slice(0, 3)
    ].filter(Boolean);
    const im = state.impact;

    const steps = {
      little: [
        step('feel-better.html', 'Try a Kindred Moment', 'Quick, evidence-informed tools — most take under five minutes.'),
        step('understand-yourself.html', 'Understand the pattern', "Short reads on what you're noticing and why it happens.")
      ],
      some: [
        step('feel-better.html', 'Build a small toolkit', 'Tools for the moments it gets in the way — and for steadying the baseline.'),
        step('therapy.html', 'Learn how support works', "No pressure — just a clear picture of what talking to someone is actually like."),
        step('understand-yourself.html', 'Understand the pattern', "Short reads on what you're noticing and why it happens.")
      ],
      lot: [
        step('therapy.html', 'What therapy is really like', 'How it works, what it costs, and how to know if someone is a fit.'),
        step('feel-better.html', 'Tools for right now', 'Small ways to steady yourself while you line up support.')
      ]
    }[im];

    /* every check-in ends at the same door — matching — with the warmth tuned to how heavy things are */
    const matchLead = {
      little: "And whenever you want a person in your corner — not just tools — we'll introduce you to therapists who fit how you communicate.",
      some: "If you'd like real support with this, meeting the right therapist is easier than you might think. We match on fit, not just credentials.",
      lot: "When it's heavy most days, you deserve more than self-help. We'll match you with therapists suited to you — how you communicate, what you need, what helps you feel understood."
    }[im];

    const lead = {
      little: "You're noticing early — that's a real strength.",
      some: "It makes sense that you'd want this to take up less room.",
      lot: "Carrying this every day is a lot. You don't have to keep doing it alone."
    }[im];

    return `
      <p class="flow-kicker">Thanks for sharing that.</p>
      <h2 class="flow-title">${lead}</h2>
      ${recap.length ? `<div class="flow-recap">${recap.map(r => `<span>${r}</span>`).join('')}</div>` : ''}
      <p class="flow-hint">Based on what you shared, here's a gentle place to start.</p>
      ${im === 'lot' ? matchBlock(matchLead) : ''}
      <div class="flow-nextsteps">${steps.join('')}</div>
      ${im !== 'lot' ? matchBlock(matchLead) : ''}
      ${im === 'lot' ? `<p class="flow-safety-note">If it ever feels unbearable or unsafe, free confidential support is available 24/7 — call or text <a href="tel:988"><strong>988</strong></a>. You don't have to be in crisis to reach out.</p>` : ''}
      <p class="flow-fine">Kindred check-ins help you notice patterns. They're not a diagnosis — and you don't need one to deserve support.</p>
      <button class="flow-restart" id="flow-restart">Start over</button>`;
  },

  checkinIntro() {
    const moodLine = state.mood
      ? (state.mood === 'Not sure'
        ? "Not sure how you're feeling? That's a completely fine place to start."
        : `You said you're feeling ${state.mood.toLowerCase()}. Let's take a gentle, closer look.`)
      : 'A few minutes of honest noticing.';
    return `
      <p class="flow-kicker">The Kindred Check-In</p>
      <h2 class="flow-title">${moodLine}</h2>
      <p class="flow-hint">We'll ask how you've been feeling, what's been weighing on you, and how much it's affecting your days. Private. Thoughtful. No judgment.</p>
      <button class="btn btn-dark flow-continue" id="checkin-begin">Begin <span aria-hidden="true">→</span></button>
      <p class="flow-fine">This check-in helps you notice patterns and find next steps. It isn't a diagnostic tool.</p>`;
  },

  safety() {
    return `
      <div class="safety-panel">
        <p class="flow-kicker">You did the right thing by tapping that.</p>
        <h2 class="flow-title">Let's get you support for this moment.</h2>
        <p class="safety-lead">If things feel unbearable, unsafe, or too heavy to manage alone, free and confidential help is available right now, 24/7. <strong>You don't have to be suicidal to reach out</strong> — 988 is there for any kind of emotional distress.</p>
        <div class="safety-actions">
          <a class="safety-action" href="tel:988">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
            <span><strong>Call 988</strong><small>Suicide &amp; Crisis Lifeline — free, confidential</small></span>
          </a>
          <a class="safety-action" href="sms:988">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/></svg>
            <span><strong>Text 988</strong><small>Reach a trained counselor by text</small></span>
          </a>
          <a class="safety-action" href="https://988lifeline.org/chat" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
            <span><strong>Chat online</strong><small>988lifeline.org/chat</small></span>
          </a>
        </div>
        <p class="safety-danger">If you're in immediate danger, call <a href="tel:911"><strong>911</strong></a>.</p>
        <div class="safety-soft">
          <p>Not in crisis, but struggling? That counts too.</p>
          <button class="flow-restart" id="safety-explore">See gentler starting points</button>
        </div>
      </div>`;
  },

  therapy() {
    return `
      <p class="flow-kicker">Wondering if therapy could help</p>
      <h2 class="flow-title">You don't have to be in crisis to consider therapy.</h2>
      <p class="flow-hint">A few honest truths as you think about it:</p>
      <ul class="therapy-truths">
        <li><strong>Milder, short-lived rough patches</strong> often respond to rest, connection, and small tools — and therapy can still help you get there faster.</li>
        <li><strong>When something is persistent, distressing, or getting in the way</strong> of work, sleep, or relationships, talking to a professional is a wise next step — not an overreaction.</li>
        <li><strong>The relationship matters most.</strong> Research consistently finds the fit between you and your therapist is one of the strongest predictors that therapy works.</li>
      </ul>
      <div class="flow-nextsteps">
        ${step('therapy.html', 'How therapy works', 'Types of therapy, what sessions are like, what it costs, and FAQs.')}
        ${step('index.html#find-therapist', 'See who you might click with', 'Kindred matches on style, communication, and what helps you feel understood — not just credentials.')}
      </div>
      <p class="flow-fine">Still unsure? The <button class="linklike" id="therapy-checkin">Kindred Check-In</button> can help you see whether now is the right time.</p>`;
  },

  loved() {
    return `
      <p class="flow-kicker">Worried about someone you love</p>
      <h2 class="flow-title">Noticing is already an act of care.</h2>
      <p class="flow-hint">You don't need the perfect words. A few things that genuinely help:</p>
      <ul class="therapy-truths">
        <li><strong>Listen without judgment.</strong> Let them talk. You don't have to fix it — being heard is the help.</li>
        <li><strong>Speak with kindness, not alarm.</strong> "I've noticed you seem tired lately, and I care about you" opens more doors than "What's wrong with you?"</li>
        <li><strong>Offer a next step, not an ultimatum.</strong> "Want me to sit with you while you look into it?" makes support feel shared.</li>
        <li><strong>Take care of yourself too.</strong> Supporting someone is heavy. Your feelings count here as well.</li>
      </ul>
      <div class="flow-nextsteps">
        ${step('index.html#life-relationships', 'Guides for supporters', 'How to start the conversation, what to say, and what to avoid.')}
        ${step('therapy.html', 'Help them explore therapy', 'Share what therapy is actually like — it lowers the barrier.')}
      </div>
      <p class="flow-safety-note">If you're worried they might be in crisis, you can call or text <a href="tel:988"><strong>988</strong></a> yourself — counselors also guide people who are supporting someone else.</p>`;
  }
};

function matchBlock(lead) {
  return `
    <div class="flow-match-cta">
      <p>${lead}</p>
      <a class="btn" href="https://raw.githack.com/kennadyscott/kindred/main/index.html" target="_blank" rel="noopener">Match with a Therapist</a>
      <p class="flow-match-fine">Matched by fit — never by fee. Free for you, always.</p>
    </div>`;
}

function step(href, title, desc) {
  return `
    <a class="next-step" href="${href}">
      <h3>${title}</h3>
      <p>${desc}</p>
      <span class="path-cta">Go <span aria-hidden="true">→</span></span>
    </a>`;
}

/* ---------- event binding ---------- */

function bindScreen() {
  flowScreen.querySelectorAll('[data-feeling]').forEach(b => b.addEventListener('click', () => {
    state.feeling = b.dataset.feeling;
    state.chips = [];
    show(state.feeling === 'none' ? 'none' : 'chips');
  }));

  const cont = flowScreen.querySelector('#chips-continue');
  if (cont) cont.addEventListener('click', () => {
    const f = FEELINGS.find(x => x.key === state.feeling);
    state.chips = [...flowScreen.querySelectorAll('input[data-chip]:checked')]
      .map(i => f.chips[Number(i.dataset.chip)]);
    show('impact');
  });

  flowScreen.querySelectorAll('[data-impact]').forEach(b => b.addEventListener('click', () => {
    state.impact = b.dataset.impact;
    show('result');
  }));

  const on = (id, fn) => { const el = flowScreen.querySelector(id); if (el) el.addEventListener('click', fn); };
  on('#none-checkin', () => { state.path = 'checkin'; show('checkinIntro'); });
  on('#none-continue', () => show('impact'));
  on('#checkin-begin', () => show('feelings'));
  on('#flow-restart', () => { state.history = []; exitFlow(); });
  on('#safety-explore', () => { state.history = []; exitFlow(); });
  on('#therapy-checkin', () => { state.path = 'checkin'; show('checkinIntro'); });
}

document.getElementById('flow-back').addEventListener('click', goBack);
document.getElementById('flow-exit').addEventListener('click', exitFlow);

document.querySelectorAll('[data-path]').forEach(card =>
  card.addEventListener('click', () => enterFlow(card.dataset.path)));

/* deep link: start-here.html#path=unsure|off|now|therapy|loved|checkin[&mood=…]
   the mood rides in the hash — it never reaches a server */
(() => {
  const m = location.hash.match(/path=(unsure|off|now|therapy|loved|checkin)/);
  const mm = location.hash.match(/mood=([^&]+)/);
  if (mm) state.mood = decodeURIComponent(mm[1]);
  if (m) enterFlow(m[1]);
})();
