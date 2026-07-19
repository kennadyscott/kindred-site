/* ===================== Kindred — Therapist Portal (simulated) ===================== */
/* Flat membership model: monthly or annual. Membership buys ACCESS to matching.
   It never affects ranking — there is no ranking to affect. */

/* Founding pricing: first 200 therapists get 3 months free, then the founding
   rate for their first 12 months, then the standard rate. Annual is the push. */
const TRIAL_DAYS = 90;
const PLANS = {
  annual: {
    label: 'Annual', price: '$99', per: '/year', standard: '$199/year',
    blurb: 'Founding rate for your first year — under $8.50/month. Then $199/year.',
    save: 'Best value — save $129 vs monthly'
  },
  monthly: {
    label: 'Monthly', price: '$19', per: '/month', standard: '$29/month',
    blurb: 'Founding rate for 12 months, then $29/month. Cancel anytime.',
    save: null
  }
};

const PILL_OPTIONS = ['Warm', 'Direct', 'Collaborative', 'Gentle', 'Curious', 'Affirming', 'Grounded', 'Encouraging', 'Practical'];
const SPECIALTY_OPTIONS = ['Anxiety', 'Depression', 'Trauma', 'Burnout', 'Life Transitions', 'Relationship issues',
  'Self-Esteem', 'Grief', 'Family Dynamics', 'Identity', 'Stress', 'Career'];
const INSURANCE_OPTIONS = ['Aetna', 'Blue Cross Blue Shield', 'Cigna', 'UnitedHealthcare', 'Kaiser', 'Self-pay / sliding scale'];

const DEFAULT = {
  profile: {
    name: '', creds: '', license: '', pronouns: '',
    pills: [], specialties: [], formats: [],
    insurances: [], accepting: true,
    promptStyle: '', promptFit: '', promptFirst: ''
  },
  plan: null, renews: null, canceled: false
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem('kt-account');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return JSON.parse(JSON.stringify(DEFAULT));
}
function save() { localStorage.setItem('kt-account', JSON.stringify(state)); }

const screen = document.getElementById('kt-screen');
const progressWrap = document.getElementById('kt-progress');
const progressLabel = document.getElementById('kt-progress-label');
const progressFill = document.getElementById('kt-progress-fill');
const signoutBtn = document.getElementById('kt-signout');

const STEPS = ['welcome', 'about', 'voice', 'logistics', 'preview', 'plan'];
const STEP_LABELS = { about: 'About you', voice: 'Your voice', logistics: 'Logistics', preview: 'Preview', plan: 'Membership' };

function setProgress(step) {
  const idx = STEPS.indexOf(step);
  if (idx <= 0) { progressWrap.hidden = true; return; }
  progressWrap.hidden = false;
  progressLabel.textContent = `Step ${idx} of ${STEPS.length - 1} — ${STEP_LABELS[step]}`;
  progressFill.style.width = `${(idx / (STEPS.length - 1)) * 100}%`;
}

function render(step) {
  setProgress(step);
  signoutBtn.hidden = !(state.profile.name && step === 'dashboard');
  screen.classList.remove('flow-in');
  void screen.offsetWidth;
  screen.innerHTML = SCREENS[step]();
  screen.classList.add('flow-in');
  bind(step);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const chip = (group, value, selected) =>
  `<label class="flow-chip"><input type="checkbox" data-group="${group}" value="${value.replace(/"/g, '&quot;')}" ${selected ? 'checked' : ''}><span>${value}</span></label>`;

const avatarSvg = `
  <rect width="300" height="300" fill="#EFE2D3"/>
  <circle cx="150" cy="122" r="56" fill="#C68B62"/>
  <path d="M96 128 q-8 -70 54 -72 q62 -2 56 70 q-4 34 -20 44 q10 -44 -36 -46 q-46 -2 -36 44 q-14 -10 -18 -40z" fill="#3B2531"/>
  <path d="M70 268 q14 -74 80 -76 q66 2 80 76z" fill="#8E77A0"/>
  <path d="M118 208 q32 -20 64 0 l-6 30 h-52z" fill="#FFF8EF"/>
  <path d="M128 168 q22 18 44 0 q-4 26 -22 26 q-18 0 -22 -26z" fill="#B87A54"/>`;

/* ===================== SCREENS ===================== */

const SCREENS = {

  welcome() {
    const p = state.profile;
    return `
      <p class="flow-kicker">Welcome${p.name ? ' back' : ''}</p>
      <h1 class="kt-title">${p.name ? `Good to see you, ${p.name.split(' ')[0]}.` : "Let's get you matchable."}</h1>
      <p class="flow-hint">${p.name
        ? 'Pick up where you left off.'
        : "A profile takes about ten minutes, and founding members start with 3 months free. One flat membership — monthly or annual — turns matching on. No per-client fees, and nothing here ever buys placement."}</p>
      <div class="kt-welcome-ctas">
        ${p.name
          ? `<button class="btn btn-dark" data-go="${state.plan && !state.canceled ? 'dashboard' : 'about'}">${state.plan && !state.canceled ? 'Open my dashboard' : 'Continue setup'}</button>
             <button class="flow-restart" id="kt-reset">Start over with a fresh account</button>`
          : `<button class="btn btn-dark" data-go="about">Create my profile</button>
             <a class="btn btn-outline" href="therapists.html">How Kindred works</a>`}
      </div>`;
  },

  about() {
    const p = state.profile;
    return `
      <p class="flow-kicker">About you</p>
      <h2 class="flow-title">The basics, first.</h2>
      <div class="kt-form">
        <label class="kt-field">Full name
          <input type="text" id="f-name" value="${p.name}" placeholder="Maya Chen" autocomplete="off">
        </label>
        <div class="kt-field-row">
          <label class="kt-field">Credentials
            <input type="text" id="f-creds" value="${p.creds}" placeholder="LMFT" autocomplete="off">
          </label>
          <label class="kt-field">Licensed in
            <input type="text" id="f-license" value="${p.license}" placeholder="CA" autocomplete="off">
          </label>
          <label class="kt-field">Pronouns <span class="kt-optional">optional</span>
            <input type="text" id="f-pronouns" value="${p.pronouns}" placeholder="She/Her" autocomplete="off">
          </label>
        </div>
        <div class="kt-field">
          <span class="kt-fieldlabel">Three words clients would use for you <span class="kt-optional">pick up to 3</span></span>
          <div class="flow-chips">${PILL_OPTIONS.map(o => chip('pills', o, p.pills.includes(o))).join('')}</div>
        </div>
      </div>
      <div class="kt-nav">
        <button class="flow-back" data-go="welcome"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
        <button class="btn btn-dark" id="kt-about-next">Continue <span aria-hidden="true">→</span></button>
      </div>`;
  },

  voice() {
    const p = state.profile;
    return `
      <p class="flow-kicker">Your voice</p>
      <h2 class="flow-title">Say it the way you'd say it to a client.</h2>
      <p class="flow-hint">These prompts are what clients read first — they're how someone recognizes you as their person.</p>
      <div class="kt-form">
        <label class="kt-field">My therapy style is…
          <textarea id="f-style" rows="2" placeholder="Warm, collaborative, and clear. I ask questions that help you hear yourself differently.">${p.promptStyle}</textarea>
        </label>
        <label class="kt-field">You may be a fit if…
          <textarea id="f-fit" rows="2" placeholder="You look fine on paper but feel exhausted from holding everything together.">${p.promptFit}</textarea>
        </label>
        <label class="kt-field">First sessions feel like…
          <textarea id="f-first" rows="2" placeholder="A gentle map-making process. We move at your pace, but we do move.">${p.promptFirst}</textarea>
        </label>
        <div class="kt-field">
          <span class="kt-fieldlabel">Specialties <span class="kt-optional">choose what you actually love working with</span></span>
          <div class="flow-chips">${SPECIALTY_OPTIONS.map(o => chip('specialties', o, p.specialties.includes(o))).join('')}</div>
        </div>
      </div>
      <div class="kt-nav">
        <button class="flow-back" data-go="about"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
        <button class="btn btn-dark" id="kt-voice-next">Continue <span aria-hidden="true">→</span></button>
      </div>`;
  },

  logistics() {
    const p = state.profile;
    return `
      <p class="flow-kicker">Logistics</p>
      <h2 class="flow-title">The practical filters.</h2>
      <p class="flow-hint">Kindred only matches you with clients these already work for — no wasted intro calls.</p>
      <div class="kt-form">
        <div class="kt-field">
          <span class="kt-fieldlabel">Session formats</span>
          <div class="flow-chips">${['Online', 'In person'].map(o => chip('formats', o, p.formats.includes(o))).join('')}</div>
        </div>
        <div class="kt-field">
          <span class="kt-fieldlabel">Insurance you accept</span>
          <div class="flow-chips">${INSURANCE_OPTIONS.map(o => chip('insurances', o, p.insurances.includes(o))).join('')}</div>
        </div>
        <label class="kt-toggle">
          <input type="checkbox" id="f-accepting" ${p.accepting ? 'checked' : ''}>
          <span class="kt-togglepill" aria-hidden="true"></span>
          Currently accepting new clients
        </label>
      </div>
      <div class="kt-nav">
        <button class="flow-back" data-go="voice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
        <button class="btn btn-dark" data-go="preview">See my profile <span aria-hidden="true">→</span></button>
      </div>`;
  },

  preview() {
    return `
      <p class="flow-kicker">Preview</p>
      <h2 class="flow-title">This is how clients will meet you.</h2>
      ${profileCard(true)}
      <div class="kt-nav">
        <button class="flow-back" data-go="logistics"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
        <button class="btn btn-dark" data-go="plan">Looks like me — continue <span aria-hidden="true">→</span></button>
      </div>`;
  },

  plan() {
    const pre = state.pendingPlan || 'annual';
    return `
      <p class="flow-kicker">Founding membership — first 200 therapists</p>
      <h2 class="flow-title">3 months free. Then the founding rate for a year.</h2>
      <p class="flow-hint">Everything included, either way. Membership makes you matchable — it never changes how you're matched.</p>
      <div class="kt-plangrid">
        ${Object.entries(PLANS).map(([key, pl]) => `
          <button class="kt-planopt ${pre === key ? 'selected' : ''}" data-plan="${key}">
            <span class="kt-planopt-name">${pl.label}${pl.save ? ` <em class="kt-savetag">${pl.save}</em>` : ''}</span>
            <span class="kt-planopt-price">${pl.price}<small>${pl.per}</small></span>
            <span class="kt-planopt-blurb">${pl.blurb}</span>
          </button>`).join('')}
      </div>
      <p class="kt-plan-after">After your founding year, the standard rate applies: $199/year or $29/month.</p>
      <div class="kt-nav">
        <button class="flow-back" data-go="preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
        <button class="btn btn-dark" id="kt-to-checkout">Continue — 3 months free <span aria-hidden="true">→</span></button>
      </div>`;
  },

  checkout() {
    const key = state.pendingPlan || 'annual';
    const pl = PLANS[key];
    return `
      <p class="flow-kicker">Checkout</p>
      <h2 class="flow-title">Founding Membership — ${pl.label}</h2>
      <div class="kt-checkout">
        <div class="kt-summary">
          <p><span>Due today</span><strong>$0</strong></p>
          <p><span>After 3 free months</span><strong>${pl.price}${pl.per} <small>founding rate</small></strong></p>
          <p><span>After your founding year</span><strong>${pl.standard}</strong></p>
          <p class="kt-summary-fine">Cancel anytime — including during the free months, at no cost. Billed by Kindred on the web — never through an app store.</p>
        </div>
        <div class="kt-stripe">
          <p class="kt-stripe-head">Card details <span class="kt-simtag">Simulated</span></p>
          <div class="kt-stripe-field">4242 4242 4242 4242</div>
          <div class="kt-stripe-row">
            <div class="kt-stripe-field">12 / 29</div>
            <div class="kt-stripe-field">424</div>
            <div class="kt-stripe-field">94110</div>
          </div>
          <p class="kt-stripe-fine">This is a prototype. The card is a Stripe test number, the fields aren't editable, and no payment is processed.</p>
        </div>
        <button class="btn btn-dark kt-wide" id="kt-subscribe">Start free — 3 months on us</button>
      </div>
      <div class="kt-nav kt-nav-center">
        <button class="flow-back" data-go="plan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>Back</button>
      </div>`;
  },

  dashboard() {
    const p = state.profile;
    const pl = PLANS[state.plan];
    const active = state.plan && !state.canceled;
    return `
      <div class="kt-dash">
        <div class="kt-dash-head">
          <div>
            <h1 class="kt-title">Welcome, ${p.name.split(' ')[0]}.</h1>
            <p class="flow-hint">${active
              ? (p.accepting ? "You're matchable. Clients who fit you can find you right now." : "Membership active — but you're paused for new clients.")
              : 'Your profile is saved. Reactivate your membership to become matchable again.'}</p>
          </div>
          <span class="kt-status ${active ? (p.accepting ? 'on' : 'paused') : 'off'}">
            ${active ? (p.accepting ? '● Matchable' : '● Paused') : '○ Not matchable'}
          </span>
        </div>

        <div class="kt-dashgrid">
          <div class="kt-dashcard">
            <h3>Membership</h3>
            ${active ? `
              <p class="kt-dash-big">Founding · ${pl.label} — ${pl.price}${pl.per}</p>
              <p class="kt-dash-meta">Free until ${state.renews} — then the founding rate for your first year, then ${pl.standard}.</p>
              <div class="kt-dash-ctas">
                <button class="btn btn-outline btn-sm" id="kt-switch">Switch to ${state.plan === 'monthly' ? 'annual ($99 — save $129)' : 'monthly'}</button>
                <button class="kt-linkbtn" id="kt-cancel">Cancel membership</button>
              </div>` : `
              <p class="kt-dash-big">Inactive</p>
              <p class="kt-dash-meta">Your profile, matches, and history are safe.</p>
              <div class="kt-dash-ctas">
                <button class="btn btn-dark btn-sm" data-go="plan" id="kt-resub">Reactivate membership</button>
              </div>`}
          </div>

          <div class="kt-dashcard">
            <h3>This week</h3>
            <div class="kt-stats">
              <div><strong>${active ? '12' : '—'}</strong><span>profile views</span></div>
              <div><strong>${active ? '3' : '—'}</strong><span>new matches</span></div>
              <div><strong>${active ? '2' : '—'}</strong><span>conversations</span></div>
            </div>
            <label class="kt-toggle kt-toggle-sm">
              <input type="checkbox" id="kt-dash-accepting" ${p.accepting ? 'checked' : ''} ${active ? '' : 'disabled'}>
              <span class="kt-togglepill" aria-hidden="true"></span>
              Accepting new clients
            </label>
          </div>
        </div>

        <div class="kt-dashcard kt-dash-profile">
          <div class="kt-sechead-row">
            <h3>Your profile</h3>
            <button class="kt-linkbtn" data-go="about">Edit profile</button>
          </div>
          ${profileCard(false)}
        </div>

        <p class="kt-integrity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.4 3 8.4 7 9.5 4-1.1 7-5.1 7-9.5V6z"/><path d="m9.5 12 2 2 3.5-3.8"/></svg>
          Matches on Kindred are made by fit alone. Nothing on this dashboard — or anyone else's — can buy placement.
        </p>
      </div>`;
  }
};

function profileCard(isPreview) {
  const p = state.profile;
  const quote = p.promptFit || p.promptStyle || p.promptFirst || 'Your prompts will appear here, in your own words.';
  const promptLabel = p.promptFit ? 'You may be a fit if…' : (p.promptStyle ? 'My therapy style is…' : 'First sessions feel like…');
  return `
    <div class="match-card kt-previewcard">
      <div class="match-photo">
        <span class="match-badge">${isPreview ? 'Preview' : 'Live'} · Kindred Match</span>
        <svg viewBox="0 0 300 300" aria-hidden="true">${avatarSvg}</svg>
      </div>
      <div class="match-info">
        <h3 class="match-name">${p.name || 'Your Name'}${p.creds ? ', ' + p.creds : ''}</h3>
        <p class="match-meta">${[p.pronouns, p.license ? 'Licensed in ' + p.license : ''].filter(Boolean).join(' • ') || 'Pronouns • License'}</p>
        <div class="match-pills">${(p.pills.length ? p.pills : ['Your', 'Three', 'Words']).map(x => `<span>${x}</span>`).join('')}</div>
        <p class="match-prompt-label">${promptLabel}</p>
        <blockquote class="match-quote">“${quote}”</blockquote>
      </div>
      <div class="match-side">
        <p class="match-spec-label">Specialties</p>
        <ul>${(p.specialties.length ? p.specialties : ['Add your specialties']).slice(0, 5).map(s => `<li>${s}</li>`).join('')}</ul>
        <p class="match-spec-label kt-side-gap">Logistics</p>
        <ul>
          <li>${p.formats.length ? p.formats.join(' & ') : 'Formats'}</li>
          <li>${p.insurances.length ? p.insurances.slice(0, 2).join(', ') + (p.insurances.length > 2 ? ' +' + (p.insurances.length - 2) : '') : 'Insurance'}</li>
          <li>${p.accepting ? 'Accepting new clients' : 'Not accepting right now'}</li>
        </ul>
      </div>
    </div>`;
}

/* ===================== BINDING ===================== */

function readChips(group) {
  return [...screen.querySelectorAll(`input[data-group="${group}"]:checked`)].map(i => i.value);
}

function bind(step) {
  screen.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => render(b.dataset.go)));

  if (step === 'welcome') {
    const reset = screen.querySelector('#kt-reset');
    if (reset) reset.addEventListener('click', () => {
      localStorage.removeItem('kt-account');
      state = JSON.parse(JSON.stringify(DEFAULT));
      render('welcome');
    });
  }

  if (step === 'about') {
    screen.querySelector('#kt-about-next').addEventListener('click', () => {
      const name = screen.querySelector('#f-name').value.trim();
      if (!name) { screen.querySelector('#f-name').focus(); return; }
      Object.assign(state.profile, {
        name,
        creds: screen.querySelector('#f-creds').value.trim(),
        license: screen.querySelector('#f-license').value.trim().toUpperCase(),
        pronouns: screen.querySelector('#f-pronouns').value.trim(),
        pills: readChips('pills').slice(0, 3)
      });
      save();
      render('voice');
    });
  }

  if (step === 'voice') {
    screen.querySelector('#kt-voice-next').addEventListener('click', () => {
      Object.assign(state.profile, {
        promptStyle: screen.querySelector('#f-style').value.trim(),
        promptFit: screen.querySelector('#f-fit').value.trim(),
        promptFirst: screen.querySelector('#f-first').value.trim(),
        specialties: readChips('specialties')
      });
      save();
      render('logistics');
    });
  }

  if (step === 'logistics') {
    screen.querySelectorAll('input[data-group]').forEach(i => i.addEventListener('change', () => {
      state.profile.formats = readChips('formats');
      state.profile.insurances = readChips('insurances');
      save();
    }));
    screen.querySelector('#f-accepting').addEventListener('change', e => {
      state.profile.accepting = e.target.checked;
      save();
    });
  }

  if (step === 'plan') {
    screen.querySelectorAll('.kt-planopt').forEach(b => b.addEventListener('click', () => {
      screen.querySelectorAll('.kt-planopt').forEach(x => x.classList.toggle('selected', x === b));
      state.pendingPlan = b.dataset.plan;
      save();
    }));
    screen.querySelector('#kt-to-checkout').addEventListener('click', () => {
      if (!state.pendingPlan) state.pendingPlan = 'annual';
      save();
      render('checkout');
    });
  }

  if (step === 'checkout') {
    screen.querySelector('#kt-subscribe').addEventListener('click', () => {
      state.plan = state.pendingPlan || 'annual';
      state.canceled = false;
      state.founding = true;
      const d = new Date();
      d.setDate(d.getDate() + TRIAL_DAYS); /* first charge lands when the free months end */
      state.renews = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      save();
      render('dashboard');
    });
  }

  if (step === 'dashboard') {
    const sw = screen.querySelector('#kt-switch');
    if (sw) sw.addEventListener('click', () => {
      state.pendingPlan = state.plan === 'monthly' ? 'annual' : 'monthly';
      save();
      render('checkout');
    });
    const cancel = screen.querySelector('#kt-cancel');
    if (cancel) cancel.addEventListener('click', () => {
      if (!confirm('Cancel your membership? Your profile and history stay saved — you just stop appearing in new matches.')) return;
      state.canceled = true;
      state.plan = null;
      save();
      render('dashboard');
    });
    const acc = screen.querySelector('#kt-dash-accepting');
    if (acc) acc.addEventListener('change', e => {
      state.profile.accepting = e.target.checked;
      save();
      render('dashboard');
    });
  }
}

signoutBtn.addEventListener('click', () => render('welcome'));

/* ===================== BOOT ===================== */

(() => {
  const m = location.hash.match(/plan=(monthly|annual)/);
  if (m) { state.pendingPlan = m[1]; save(); }
  if (state.plan && !state.canceled && state.profile.name) render('dashboard');
  else render('welcome');
})();
