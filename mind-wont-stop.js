/* ===================== Kindred — "When your mind won't stop" exploration result ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ===================== DATA ===================== */

/* Familiar-experience cards — weights refine the lens order, never diagnose */
const FAMILIAR = [
  { key: 'replaying', label: 'Replaying conversations', tint: '#E9E1EE',
    desc: 'Going back over what you said, what they said, and what you wish you had said.',
    icon: '<path d="M8 20a13 13 0 0 1 25-5M33 34a13 13 0 0 1-25 5"/><path d="M29 12h5v-5M12 42v-5h5" transform="translate(-1 -6)"/>',
    weights: { anxiety: 1, perfectionism: 1, ocd: 1 } },
  { key: 'worstcase', label: 'Imagining what could go wrong', tint: '#F4E3DB',
    desc: 'Your mind keeps jumping ahead to possible problems.',
    icon: '<path d="M10 28c3-9 8-14 14-13s9 6 7 11-8 7-12 4 0-10 6-10 10 4 9 9"/>',
    weights: { anxiety: 2, trauma: 1 } },
  { key: 'decisions', label: 'Struggling to make decisions', tint: '#E3E8E1',
    desc: 'Every option seems to create another question.',
    icon: '<path d="M21 36V20"/><path d="M21 20 12 10M21 20l9-10M21 20l-13 4M21 20l13 4" opacity=".8"/>',
    weights: { anxiety: 1, perfectionism: 1, adhd: 1 } },
  { key: 'night', label: 'Trouble switching off at night', tint: '#E3E8EF',
    desc: 'Your body is tired. Your thoughts did not get the memo.',
    icon: '<path d="M30 26a12 12 0 0 1-15.3-15.3A12 12 0 1 0 30 26z"/>',
    weights: { anxiety: 1, stress: 1, trauma: 1 } },
  { key: 'whatif', label: 'Constant "what if?" thoughts', tint: '#F3E4C9',
    desc: 'One possibility quickly turns into ten.',
    icon: '<circle cx="21" cy="21" r="15"/><path d="M16.5 16.5a4.5 4.5 0 0 1 8.6 1.8c0 2.8-4.1 3-4.1 5.8"/><circle cx="21" cy="29" r=".6" fill="currentColor"/>',
    weights: { anxiety: 2, ocd: 1 } },
  { key: 'reassurance', label: 'Needing reassurance', tint: '#E6EAE2',
    desc: 'You feel better for a moment after checking — but the uncertainty returns.',
    icon: '<circle cx="15" cy="15" r="5"/><circle cx="28" cy="17" r="4"/><path d="M7 34c1-6 4-9 8-9M22 34c1-5 3-8 6-8"/>',
    weights: { ocd: 2, anxiety: 1 } },
  { key: 'exhausted', label: 'Feeling mentally exhausted', tint: '#F0DBD9',
    desc: 'You have been thinking all day and somehow still do not feel finished.',
    icon: '<rect x="8" y="15" width="24" height="13" rx="4"/><path d="M32 19h4v5h-4"/><rect x="12" y="19" width="6" height="5" rx="1.5" fill="currentColor" stroke="none" opacity=".8"/>',
    weights: { stress: 2, adhd: 1 } }
];

/* The six lenses */
const LENSES = [
  { key: 'anxiety', title: 'Anxiety', tint: '#E6E4EC',
    sub: 'When worry keeps taking up space',
    body: 'You may feel pulled toward future possibilities, uncertainty, or things that could go wrong.',
    explore: ['Explore anxiety', 'understand-yourself.html#topic=anxiety'],
    compare: ['Anxiety or stress?', 'anxiety-stress'],
    icon: '<path d="M9 17a5.5 5.5 0 1 1 1.5-10.8A7 7 0 0 1 24 8.5 4.8 4.8 0 0 1 23 18z" transform="translate(5 6)"/><path d="M14 30v3M19 30v4M24 30v3" opacity=".7"/>' },
  { key: 'stress', title: 'Stress', tint: '#F3E4C9',
    sub: 'When your mind is responding to pressure',
    body: 'Work, relationships, responsibilities, uncertainty, or major demands may keep your brain in constant problem-solving mode.',
    explore: ['Understand stress', 'understand-yourself.html#topic=stress'],
    compare: ['Stress or anxiety?', 'anxiety-stress'],
    icon: '<circle cx="21" cy="21" r="8"/><path d="M21 7v4M21 31v4M35 21h-4M11 21H7M31 11l-3 3M14 28l-3 3M31 31l-3-3M14 14l-3-3"/>' },
  { key: 'perfectionism', title: 'Perfectionism', tint: '#F4E3DB',
    sub: 'When getting it wrong feels hard to tolerate',
    body: 'You may rehearse, check, prepare, or analyze because mistakes feel unusually costly.',
    explore: ['Explore perfectionism', 'understand-yourself.html#topic=perfectionism'],
    compare: ['Healthy standards or perfectionism?', 'standards-perfectionism'],
    icon: '<path d="M21 7l4 9 10 1-7.5 7 2.2 10L21 29l-8.7 5 2.2-10L7 17l10-1z"/>' },
  { key: 'ocd', title: 'OCD', tint: '#E3E8EF',
    sub: 'When unwanted thoughts and responses become difficult to interrupt',
    body: 'Intrusive thoughts may create distress, while repeated behaviors or mental rituals may offer temporary relief.',
    explore: ['Understand OCD', 'understand-yourself.html#topic=ocd'],
    compare: ['OCD or overthinking?', 'ocd-overthinking'],
    icon: '<path d="M9 18a12 12 0 0 1 23-4M33 24a12 12 0 0 1-23 4"/><path d="M32 9v6h-6M10 33v-6h6"/>' },
  { key: 'trauma', title: 'Trauma responses', tint: '#E6EAE2',
    sub: 'When part of you stays alert for danger',
    body: 'Some people notice persistent vigilance, difficulty relaxing, sleep disruption, or feeling constantly prepared for something to happen.',
    explore: ['Explore trauma responses', 'understand-yourself.html#topic=trauma'],
    compare: ['Trauma response or everyday stress?', 'trauma-everydaystress'],
    icon: '<path d="M21 6 9 11v7c0 8 5.5 14.5 12 16.5C27.5 32.5 33 26 33 18v-7z"/>' },
  { key: 'adhd', title: 'ADHD', tint: '#E9E1EE',
    sub: 'When attention is hard to direct, shift, or settle',
    body: 'Mental overload may sometimes connect with difficulties around attention, organization, impulsivity, or managing competing demands.',
    explore: ['Understand ADHD', 'understand-yourself.html#topic=adhd'],
    compare: ['ADHD or anxiety?', 'adhd-anxiety'],
    icon: '<path d="M15 8a7 7 0 0 0-7 7c0 3 1.5 4.5 1.5 4.5S8 21 8 24a7 7 0 0 0 7 7h1V8zM27 8a7 7 0 0 1 7 7c0 3-1.5 4.5-1.5 4.5S34 21 34 24a7 7 0 0 1-7 7h-1V8z"/><path d="M21 6v30" opacity=".6"/>' }
];

/* Comparison previews — restrained, educational, never diagnostic */
const COMPARES = {
  'anxiety-stress': { a: 'Stress', b: 'Anxiety',
    aPts: ['Usually tied to a real, current demand', 'Eases when the pressure passes', 'Can even be motivating in small doses'],
    bPts: ["Sticks around even when nothing's wrong", 'Future-focused what-ifs that multiply', 'Starts to shape what you avoid'] },
  'ocd-overthinking': { a: 'Overthinking', b: 'OCD',
    aPts: ['Repeatedly analyzing and replaying', 'Difficulty reaching a decision', 'Eases with distraction or resolution'],
    bPts: ['Intrusive, unwanted obsessions', 'Compulsions or repetitive mental or physical responses', 'Significant distress or interference'] },
  'adhd-anxiety': { a: 'ADHD', b: 'Anxiety',
    aPts: ["Distraction happens even when you're calm", 'A lifelong pattern, across many settings', 'Interest can drive hours of deep focus'],
    bPts: ['Worry is what steals the focus', 'Concentration returns when worry settles', 'The mind is busy with fears, not everything at once'] },
  'standards-perfectionism': { a: 'High standards', b: 'Perfectionism',
    aPts: ['Goals stretch you and feel satisfying to meet', 'Mistakes are information', 'You can call something finished'],
    bPts: ['Goals move the moment you reach them', 'Mistakes feel like verdicts on who you are', 'Nothing ever feels done enough to share'] },
  'perfectionism-ocd': { a: 'Perfectionism', b: 'OCD',
    aPts: ['High standards tied to self-worth and image', 'Checking and redoing to make the work better', 'Distress about falling short'],
    bPts: ['Intrusive thoughts that feel foreign and unwanted', 'Rituals to neutralize distress, not to improve quality', 'Relief is brief and the urge returns'] },
  'trauma-everydaystress': { a: 'Everyday stress', b: 'Trauma response',
    aPts: ['Tied to current demands and deadlines', 'Settles when the situation resolves', "Your body relaxes once you're somewhere safe"],
    bPts: ['Alertness persists even in safe moments', 'Set off by reminders, not just demands', 'Sleep, startle, and guardedness stay elevated'] }
};

/* "What sounds closest" options → which comparisons to surface */
const CLOSEST = [
  { key: 'future', label: 'I worry mostly about the future', compares: ['anxiety-stress'],
    intro: "Worry that lives in the future is anxiety's signature move — but pressure in the present can feel similar." },
  { key: 'past', label: 'I replay things that already happened', compares: ['ocd-overthinking'],
    intro: 'Replaying is common — the useful question is what the replaying is doing for you.' },
  { key: 'pressure', label: 'I feel pressure to get everything right', compares: ['standards-perfectionism', 'perfectionism-ocd'],
    intro: 'Caring about quality is a strength. It helps to notice when the caring stops feeling like a choice.' },
  { key: 'intrusive', label: "I get intrusive thoughts I don't want", compares: ['ocd-overthinking'],
    intro: 'Unwanted thoughts are more common than most people realize — what matters is how they land and what they demand.' },
  { key: 'braced', label: 'I feel constantly alert or braced', compares: ['trauma-everydaystress'],
    intro: 'A body that stays on guard is telling a story. It helps to ask whether the alarm matches the moment.' },
  { key: 'scattered', label: 'My thoughts feel scattered and hard to organize', compares: ['adhd-anxiety'],
    intro: 'Mental noise can come from attention differences, worry, or both — the pattern over time is the clue.' },
  { key: 'several', label: 'Honestly, several of these', compares: ['anxiety-stress', 'ocd-overthinking', 'adhd-anxiety', 'perfectionism-ocd', 'trauma-everydaystress'],
    intro: "Some experiences overlap. Let's look at a few differences that may help you ask better questions." },
  { key: 'unsure', label: "I still don't know", compares: ['anxiety-stress', 'ocd-overthinking', 'adhd-anxiety', 'perfectionism-ocd', 'trauma-everydaystress'],
    intro: "That's okay — you don't need to sort it alone. Browse the differences below, or let a Kindred Check-In do the noticing with you." }
];

/* Kindred Moments for this experience */
const MOMENTS = [
  { time: '1 min', title: 'Interrupt the Loop', desc: 'A quick grounding reset when your thoughts keep circling.', tint: '#E9E1EE' },
  { time: '3 min', title: "Name What You're Solving", desc: 'Separate a real problem from a hypothetical one.', tint: '#E6EAE2' },
  { time: '5 min', title: 'Worry Time', desc: 'Give repetitive thoughts a container instead of your whole evening.', tint: '#F3E4C9' },
  { time: '3 min', title: 'Before You Ask for Reassurance', desc: 'Pause and notice what you are hoping certainty will give you.', tint: '#F4E3DB' },
  { time: '5 min', title: 'Brain Dump, Then Sort', desc: 'Move the mental pile somewhere visible.', tint: '#E3E8EF' }
];

/* ===================== RENDER ===================== */

document.getElementById('mws-famgrid').innerHTML = FAMILIAR.map(f => `
  <label class="mws-famcard" style="--chip:${f.tint}">
    <input type="checkbox" data-fam="${f.key}">
    <span class="mws-famicon"><svg viewBox="0 0 42 42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${f.icon}</svg></span>
    <strong>${f.label}</strong>
    <span class="mws-famdesc">${f.desc}</span>
    <span class="mws-famcheck" aria-hidden="true"></span>
  </label>`).join('');

function renderLenses(order) {
  const list = order || LENSES;
  document.getElementById('mws-lensgrid').innerHTML = list.map(l => `
    <article class="mws-lens" style="--chip:${l.tint}">
      <span class="mws-lensicon"><svg viewBox="0 0 42 42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${l.icon}</svg></span>
      <h3>${l.title}</h3>
      <p class="mws-lenssub">${l.sub}</p>
      <p class="mws-lensbody">${l.body}</p>
      <a class="pillar-link" href="${l.explore[1]}">${l.explore[0]} <span aria-hidden="true">→</span></a>
      <button class="mws-lenscompare" data-compare="${l.compare[1]}">${l.compare[0]}</button>
    </article>`).join('');
  document.querySelectorAll('.mws-lenscompare').forEach(b =>
    b.addEventListener('click', () => showComparisons(null, [b.dataset.compare], 'It can be hard to tell the difference.')));
}
renderLenses();

document.getElementById('mws-radio-row').innerHTML = CLOSEST.map(c => `
  <label class="mws-radio">
    <input type="radio" name="mws-closest" value="${c.key}">
    <span>${c.label}</span>
  </label>`).join('');

document.getElementById('mws-momentrow').innerHTML = MOMENTS.map((m, i) => `
  <article class="mws-momentcard">
    <span class="moment-time">${m.time}</span>
    <span class="mws-momenticon" style="--chip:${m.tint}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20c-4 0-7-2.4-7-6 1.8.2 3 .8 4 1.8C9 12 10 8 12 5c2 3 3 7 3 10.8 1-1 2.2-1.6 4-1.8 0 3.6-3 6-7 6z"/></svg>
    </span>
    <h3>${m.title}</h3>
    <p>${m.desc}</p>
    <div class="mws-momentctas">
      <a class="pillar-link" href="feel-better.html">Start <span aria-hidden="true">→</span></a>
      <button class="mws-savemoment" data-moment="${i}" aria-label="Save ${m.title} to My Kindred">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z"/></svg>
      </button>
    </div>
  </article>`).join('');

/* ===================== INTERACTIONS ===================== */

/* Familiar cards → reorder lenses */
document.getElementById('mws-explore-btn').addEventListener('click', () => {
  const picked = [...document.querySelectorAll('input[data-fam]:checked')]
    .map(i => FAMILIAR.find(f => f.key === i.dataset.fam));
  if (picked.length) {
    const scores = {};
    picked.forEach(f => Object.entries(f.weights).forEach(([k, w]) => scores[k] = (scores[k] || 0) + w));
    const ordered = [...LENSES].sort((a, b) => (scores[b.key] || 0) - (scores[a.key] || 0));
    renderLenses(ordered);
    document.getElementById('mws-personal-note').hidden = false;
  }
  document.getElementById('mws-lenses').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* Closest → dynamic comparisons */
const continueBtn = document.getElementById('mws-continue');
document.querySelectorAll('input[name="mws-closest"]').forEach(r =>
  r.addEventListener('change', () => continueBtn.disabled = false));

continueBtn.addEventListener('click', () => {
  const val = document.querySelector('input[name="mws-closest"]:checked');
  if (!val) return;
  const c = CLOSEST.find(x => x.key === val.value);
  showComparisons(c.intro, c.compares, c.key === 'several' || c.key === 'unsure'
    ? 'It makes sense that this feels hard to sort out.'
    : 'It can be hard to tell the difference.');
});

function showComparisons(intro, keys, title) {
  const section = document.getElementById('mws-diff');
  section.hidden = false;
  document.getElementById('mws-diff-title').textContent = title;
  document.getElementById('mws-diff-sub').textContent = intro || 'Some experiences overlap. Explore how they are different.';
  document.getElementById('mws-difflist').innerHTML = keys.map(k => {
    const c = COMPARES[k];
    return `
      <details class="mws-diffrow">
        <summary><strong>${c.a} vs. ${c.b}</strong>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>
        </summary>
        <div class="mws-diffbody">
          <div class="uy-comparecols">
            <div class="uy-comparecol"><h3>${c.a} may involve</h3><ul class="therapy-truths">${c.aPts.map(p => `<li>${p}</li>`).join('')}</ul></div>
            <div class="uy-comparecol"><h3>${c.b} may involve</h3><ul class="therapy-truths">${c.bPts.map(p => `<li>${p}</li>`).join('')}</ul></div>
          </div>
          <p class="flow-fine">Overlap is common — many people experience both. Only a qualified professional can diagnose.</p>
        </div>
      </details>`;
  }).join('');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- save drawer (shared pattern with homepage) ---------- */
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

function trySave(el) {
  if (localStorage.getItem('mk-account')) {
    el.classList.add('saved');
    return true;
  }
  if (!sessionStorage.getItem('mk-drawer-shown')) {
    sessionStorage.setItem('mk-drawer-shown', '1');
    drawer.classList.add('open');
    setTimeout(() => drawer.classList.remove('open'), 12000);
  } else {
    drawer.classList.add('open');
  }
  return false;
}

document.querySelectorAll('.mws-savemoment').forEach(b =>
  b.addEventListener('click', () => trySave(b)));

const saveBtn = document.getElementById('mws-save-btn');
saveBtn.addEventListener('click', () => {
  if (trySave(saveBtn)) saveBtn.textContent = '✓ Saved to My Kindred';
});
