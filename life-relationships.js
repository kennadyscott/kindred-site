/* ===================== Kindred — Life & Relationships ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ===================== DATA ===================== */
/* Entry by life context — outward-facing counterpart to Understand Yourself.
   Each context mirrors the experience, then bridges to topics, tools, therapy. */

const CONTEXTS = [
  {
    key: 'partner', title: 'My partner & romantic life', bg: '#F4E3DB', vis: '#FBF2EC',
    blurb: "The person closest to you can be the person hardest to talk to.",
    icon: `<path d="M40 58c-10-7-16-12.5-16-19 0-5 4-8.5 8.5-8.5 3 0 5.6 1.5 7.5 4 1.9-2.5 4.5-4 7.5-4C52 30.5 56 34 56 39c0 6.5-6 12-16 19z" stroke="#BE765F" stroke-width="3" fill="none" stroke-linejoin="round"/><path d="M30 22q10-8 20 0" stroke="#B8A3C4" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    mirror: 'You can share a bed, a lease, a life — and still feel like you\'re speaking different languages about the things that matter.',
    notice: [
      'The same argument keeps coming back in different outfits',
      'You feel more like roommates than partners lately',
      "You're editing yourself to keep the peace",
      "You can't tell if this is a rough patch or a pattern"
    ],
    topics: [
      ['relationshipanxiety', 'Relationship anxiety', 'Doubt that shows up in love.'],
      ['attachment', 'Attachment', 'The patterns underneath your relationships.'],
      ['boundaries', 'Boundaries', 'Where you end and others begin.']
    ],
    tools: [
      ['Before You Send That Text', '3 min — pause before the reply you might regret'],
      ['After the Argument', '5 min — settle your body, then decide what happens next']
    ],
    therapyLine: "Couples therapy isn't a last resort — most couples wait years longer than they should. A third person in the room changes the conversation."
  },
  {
    key: 'family', title: 'My family', bg: '#F3E4C9', vis: '#FBF2DC',
    blurb: 'You can love people and still need to recover from them.',
    icon: `<circle cx="30" cy="26" r="7" stroke="#B98A3C" stroke-width="3" fill="none"/><circle cx="50" cy="28" r="5.5" stroke="#B98A3C" stroke-width="3" fill="none"/><circle cx="41" cy="44" r="5" stroke="#BE765F" stroke-width="3" fill="none"/><path d="M18 62c1.5-9 6-13 12-13M60 62c-1-8-5-12-10-12M33 62c1-6 4-9 8-9" stroke="#B98A3C" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    mirror: "Family is where our oldest scripts were written. It's also where they get re-read aloud, every visit.",
    notice: [
      'Visits home turn you back into a version of yourself you outgrew',
      'Guilt does a lot of the talking',
      'There are topics everyone knows not to touch',
      "You're the one holding it all together — again"
    ],
    topics: [
      ['attachment', 'Attachment', 'The patterns underneath your relationships.'],
      ['boundaries', 'Boundaries', 'Where you end and others begin.'],
      ['peoplepleasing', 'People pleasing', "Why it's so hard to say no — and how to start."]
    ],
    tools: [
      ['Before a Hard Conversation', '4 min — get clear on what you need before you walk in'],
      ['The Doorway Reset', '1 min — a ritual for the space between their world and yours']
    ],
    therapyLine: 'Family therapy exists — and so does individual therapy about family. You can work on a relationship without the other person in the room.'
  },
  {
    key: 'friends', title: 'Friendship & feeling alone', bg: '#E6EAE2', vis: '#F4F6F1',
    blurb: "Lonely isn't about how many people are around.",
    icon: `<circle cx="28" cy="30" r="8" stroke="#687A65" stroke-width="3" fill="none"/><path d="M14 58c2-11 7-16 14-16" stroke="#687A65" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="52" cy="32" r="6" stroke="#687A65" stroke-width="3" fill="none" stroke-dasharray="4 4"/><path d="M42 58c1.5-9 5.5-13 10-13" stroke="#687A65" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="4 4"/>`,
    mirror: 'Adult friendship is quietly hard — everyone is busy, nobody teaches you how to make new friends at thirty, and losing one has no ritual for the grief.',
    notice: [
      'Making friends as an adult feels weirdly hard',
      "You're the one who always reaches out first",
      'The group chat is active. You still feel unseen.',
      "A friendship ended, and nobody calls that grief — but it is"
    ],
    topics: [
      ['loneliness', 'Loneliness', 'Feeling alone, even around people.'],
      ['socialanxiety', 'Social anxiety', 'More than shyness.'],
      ['selfesteem', 'Self-esteem', 'The way you talk to yourself matters.']
    ],
    tools: [
      ["You're Not Alone", '2 min — a reminder for when it all feels too much'],
      ['Name It to Tame It', '2 min — putting a feeling into words loosens its grip']
    ],
    therapyLine: 'Therapy is also a place to practice being known — some people find the courage for friendship there first.'
  },
  {
    key: 'work', title: 'Work & school', bg: '#E3E8EF', vis: '#F3F6FA',
    blurb: 'Forty hours a week will shape how you feel. It\'s allowed to matter.',
    icon: `<rect x="18" y="26" width="44" height="28" rx="4" stroke="#7B8A9E" stroke-width="3" fill="none"/><path d="M32 26v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" stroke="#7B8A9E" stroke-width="3" fill="none"/><path d="M18 38h44" stroke="#7B8A9E" stroke-width="3"/>`,
    mirror: "Work stress gets dismissed as 'just work.' But a place that takes most of your waking hours gets a vote on your mental health — whether it deserves one or not.",
    notice: [
      'Sunday night comes with a specific dread',
      'Your worth and your output feel like the same number',
      'One difficult person takes up your whole commute',
      "You can't remember your last real day off"
    ],
    topics: [
      ['burnout', 'Burnout', "Running on empty isn't a character flaw."],
      ['stress', 'Chronic stress', 'When the pressure never quite lets up.'],
      ['perfectionism', 'Perfectionism', 'When "good enough" never feels good enough.']
    ],
    tools: [
      ['3-Minute Nervous System Reset', '3 min — for when your brain still feels "on" after work'],
      ['The Doorway Reset', '1 min — a tiny ritual between work and home']
    ],
    therapyLine: "Burnout or depression? It's one of the most useful questions a professional can help you untangle — the treatments differ."
  },
  {
    key: 'change', title: 'A big change', bg: '#ECE5F1', vis: '#F7F3FA',
    blurb: 'Even the change you chose can grieve the life it replaced.',
    icon: `<path d="M22 54V30a6 6 0 0 1 6-6h4" stroke="#8E77A0" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M40 18l10 6-10 6z" fill="#8E77A0"/><path d="M50 26h2a6 6 0 0 1 6 6v22" stroke="#8E77A0" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="4 5"/><circle cx="22" cy="58" r="3" fill="#BE765F"/><circle cx="58" cy="58" r="3" fill="#687A65"/>`,
    mirror: "New city, new job, new baby, new ending — transitions unsettle even when they're wanted, because every new life quietly costs an old one.",
    notice: [
      "You did the thing you wanted, and feel strangely lost anyway",
      "Everyone's congratulating you; you're quietly panicking",
      'The old version of your life keeps calling',
      "There's no manual, and everyone else seems to have read it"
    ],
    topics: [
      ['lifetransitions', 'Life transitions', 'Change is a lot — even the good kind.'],
      ['grief', 'Grief', 'Carrying a loss, at your own pace.'],
      ['anxiety', 'Anxiety', 'When worry starts taking up too much room.']
    ],
    tools: [
      ["Name What You're Solving", '3 min — separate a real problem from a hypothetical one'],
      ['Brain Dump, Then Sort', '5 min — move the mental pile somewhere visible']
    ],
    therapyLine: 'Transitions are one of the most common — and most productive — reasons people start therapy. You don\'t have to be in crisis; "everything is different now" is enough.'
  },
  {
    key: 'someone', title: "Someone I'm worried about", bg: '#F0DBD9', vis: '#F9EEEC',
    blurb: "You've noticed something. That noticing is already an act of care.",
    icon: `<circle cx="30" cy="28" r="8" stroke="#A05F4B" stroke-width="3" fill="none"/><path d="M16 58c2-11 7-16 14-16" stroke="#A05F4B" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M52 40c4-3 9-1 10 3s-2 7-10 11c-8-4-11-7-10-11s6-6 10-3z" fill="#BE765F"/>`,
    mirror: "Watching someone you love struggle is its own kind of weight — the rehearsed conversations, the fear of saying it wrong, the worry you carry into your own nights.",
    notice: [
      "They're not themselves lately, and you can't unsee it",
      'You rehearse how to bring it up, then don\'t',
      "You're afraid the wrong words will push them away",
      'Carrying worry for someone is starting to cost you, too'
    ],
    supporter: true,
    help: [
      ['Listen without judgment.', "Let them talk. You don't have to fix it — being heard is the help."],
      ['Speak with kindness, not alarm.', '"I\'ve noticed you seem tired lately, and I care about you" opens more doors than "what\'s wrong with you?"'],
      ['Offer a next step, not an ultimatum.', '"Want me to sit with you while you look into it?" makes support feel shared.'],
      ['Take care of yourself, too.', 'Supporting someone is heavy. Your feelings count here as well.']
    ],
    therapyLine: null
  }
];

/* ===================== RENDER ===================== */

document.getElementById('lr-grid').innerHTML = CONTEXTS.map(c => `
  <button class="path-card" data-context="${c.key}" style="--card-bg:${c.bg}; --card-vis:${c.vis}">
    <span class="path-visual" aria-hidden="true">
      <svg viewBox="0 0 80 80" fill="none">${c.icon}</svg>
    </span>
    <h3>${c.title}</h3>
    <p>${c.blurb}</p>
    <span class="path-cta">${c.supporter ? 'Help me support them' : "Let's look at it"} <span aria-hidden="true">→</span></span>
  </button>`).join('');

/* ===================== DETAIL PANEL ===================== */

const detailWrap = document.getElementById('lr-detailwrap');
const detailScreen = document.getElementById('lr-detail-screen');

function openContext(key) {
  const c = CONTEXTS.find(x => x.key === key);
  if (!c) return;

  let body;
  if (c.supporter) {
    body = `
      <p class="flow-hint">${c.mirror}</p>
      <p class="flow-hint"><strong>Does any of this sound familiar?</strong></p>
      <ul class="therapy-truths">${c.notice.map(n => `<li>${n}</li>`).join('')}</ul>
      <div class="uy-showsup">
        <h3>What genuinely helps</h3>
        <ul class="therapy-truths">${c.help.map(([h, p]) => `<li><strong>${h}</strong> ${p}</li>`).join('')}</ul>
      </div>
      <div class="flow-nextsteps">
        <a class="next-step" href="start-here.html">
          <h3>The full supporter path</h3>
          <p>How to start the conversation, what to say, and what to avoid — step by step.</p>
          <span class="path-cta">Open Start Here <span aria-hidden="true">→</span></span>
        </a>
        <a class="next-step" href="therapy.html">
          <h3>Help them explore therapy</h3>
          <p>Share what therapy is actually like — it lowers the barrier more than pushing does.</p>
          <span class="path-cta">The therapy page <span aria-hidden="true">→</span></span>
        </a>
      </div>
      <p class="flow-safety-note">Worried they might be in crisis? You can call or text <a href="tel:988"><strong>988</strong></a> yourself — counselors also guide people who are supporting someone else.</p>`;
  } else {
    body = `
      <p class="flow-hint">${c.mirror}</p>
      <p class="flow-hint"><strong>You might be noticing:</strong></p>
      <ul class="therapy-truths">${c.notice.map(n => `<li>${n}</li>`).join('')}</ul>
      <div class="uy-showsup">
        <h3>Patterns worth understanding</h3>
        <div class="flow-nextsteps">
          ${c.topics.map(([k, label, tag]) => `
            <a class="next-step" href="understand-yourself.html#topic=${k}">
              <h3>${label}</h3>
              <p>${tag}</p>
              <span class="path-cta">Explore <span aria-hidden="true">→</span></span>
            </a>`).join('')}
        </div>
      </div>
      <div class="uy-showsup">
        <h3>For the moment you're in</h3>
        <div class="flow-nextsteps">
          ${c.tools.map(([title, meta]) => `
            <a class="next-step" href="feel-better.html">
              <h3>${title}</h3>
              <p>${meta}</p>
              <span class="path-cta">Open the tool <span aria-hidden="true">→</span></span>
            </a>`).join('')}
        </div>
      </div>
      <p class="flow-safety-note">${c.therapyLine} <a href="therapy.html"><strong>Explore therapy →</strong></a></p>`;
  }

  detailScreen.innerHTML = `
    <p class="flow-kicker">Life &amp; relationships</p>
    <h2 class="flow-title">${c.title}</h2>
    ${body}`;
  detailWrap.hidden = false;
  detailScreen.classList.remove('flow-in');
  void detailScreen.offsetWidth;
  detailScreen.classList.add('flow-in');
  detailWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeContext() {
  detailWrap.hidden = true;
  detailScreen.innerHTML = '';
}
document.getElementById('lr-back').addEventListener('click', closeContext);
document.getElementById('lr-close').addEventListener('click', closeContext);

document.getElementById('lr-grid').addEventListener('click', e => {
  const card = e.target.closest('[data-context]');
  if (card) openContext(card.dataset.context);
});

/* deep link: #context=partner|family|friends|work|change|someone */
(() => {
  const m = location.hash.match(/context=([a-z]+)/);
  if (m) openContext(m[1]);
})();
