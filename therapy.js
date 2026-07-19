/* ===================== Kindred — Therapy page ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ---------- "Do I need therapy?" readiness check ---------- */
/* Signals informed by public guidance (persistence, distress, interference) —
   framed as reasons therapy is reasonable, never as a diagnosis or a gate. */

const SIGNALS = [
  { key: 'returns', label: 'It keeps coming back', heavy: true },
  { key: 'interferes', label: "It's affecting sleep, work, or relationships", heavy: true },
  { key: 'mostdays', label: 'It feels heavy most days', heavy: true },
  { key: 'alone', label: "I've been carrying it alone for a while", heavy: true },
  { key: 'unspoken', label: "Something happened that I haven't talked about", heavy: true },
  { key: 'curious', label: "I'm mostly okay — just curious", heavy: false }
];

const chipsWrap = document.getElementById('tp-ready-chips');
chipsWrap.innerHTML = SIGNALS.map((s, i) => `
  <label class="flow-chip"><input type="checkbox" data-signal="${i}"><span>${s.label}</span></label>`).join('');

const resultBox = document.getElementById('tp-ready-result');
const readyBtn = document.getElementById('tp-ready-btn');

readyBtn.addEventListener('click', () => {
  const picked = [...document.querySelectorAll('input[data-signal]:checked')]
    .map(i => SIGNALS[Number(i.dataset.signal)]);

  if (!picked.length) {
    chipsWrap.classList.add('uy-shake');
    setTimeout(() => chipsWrap.classList.remove('uy-shake'), 500);
    return;
  }

  const heavy = picked.filter(s => s.heavy);
  const onlyCurious = heavy.length === 0;

  let html;
  if (onlyCurious) {
    html = `
      <h3>Curiosity counts too.</h3>
      <p>Therapy isn't only for repair — plenty of people go to understand themselves better, handle a good-but-big life change, or build steadiness before they need it. You don't need things to be broken to want them to be better.</p>
      <div class="tp-ready-ctas">
        <a class="btn btn-dark btn-sm" href="#tp-match">See how matching works</a>
        <a class="btn btn-outline btn-sm" href="understand-yourself.html">Keep exploring first</a>
      </div>`;
  } else {
    html = `
      <h3>That's reason enough.</h3>
      <p>${heavy.length > 1 ? 'What you selected — persistence, weight, interference — is' : 'What you selected is'} exactly the kind of thing professionals mean when they say "it may be time to talk to someone." Not because something is wrong with you, but because you shouldn't have to keep managing it alone.</p>
      <ul class="therapy-truths">
        <li><strong>Milder, short-lived rough patches</strong> often respond to rest, connection, and small tools — and therapy can still speed that up.</li>
        <li><strong>When something is persistent, distressing, or in the way,</strong> talking to a professional is a wise next step — not an overreaction.</li>
        <li><strong>The relationship matters most.</strong> The fit between you and your therapist is one of the strongest predictors that therapy works.</li>
      </ul>
      <div class="tp-ready-ctas">
        <a class="btn btn-dark btn-sm" href="#tp-match">Find a therapist who fits</a>
        <a class="btn btn-outline btn-sm" href="start-here.html">Take the Check-In first</a>
      </div>
      ${picked.some(s => s.key === 'mostdays' || s.key === 'unspoken') ? `
      <p class="flow-safety-note">If it ever feels unbearable or unsafe, you don't have to wait for a first appointment — call or text <a href="tel:988"><strong>988</strong></a>, free and confidential, 24/7.</p>` : ''}`;
  }

  resultBox.innerHTML = html + `<p class="flow-fine">This is a reflection, not an assessment — there's no score, and no wrong answer.</p>`;
  resultBox.hidden = false;
  resultBox.classList.remove('flow-in');
  void resultBox.offsetWidth;
  resultBox.classList.add('flow-in');
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
