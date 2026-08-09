// ===================================================================
// BUILD MODE — flip to true for the App Store / production build. It ONLY hides
// demo-only affordances (the "prototype" banner + the preview-client-demo
// shortcut). The full client AND therapist experiences stay 100% functional —
// nothing is gated or blocked. Leave false for web/PWA testing.
// ===================================================================
const PRODUCTION_BUILD = true;
if (document.body) document.body.classList.toggle('production', PRODUCTION_BUILD);

// ===================================================================
// SERVER-CONTROLLED FLAGS — fetched from config.json at launch. This is the
// switch that lets an already-shipped App Store build change behavior with NO
// new binary and NO re-review: edit config.json + redeploy the web layer and
// the native app picks it up next launch. Safe defaults (everything OFF) hold
// until the fetch resolves.
//
// clientDataPersistence gates whether a real client's data (intake, matches,
// messages) is saved SERVER-SIDE. It stays OFF — client data lives only in the
// browser, which is HIPAA-clean — and flips ON the moment the BAA is signed.
// Flipping it is a config change, not an app change.
// ===================================================================
let KINDRED_FLAGS = { clientDataPersistence: false, therapistBillingLive: false };
// Coming back from Stripe's hosted flow. Finishing the flow is NOT passing it:
// the result arrives by webhook, which can take a moment. Say exactly that
// rather than showing a success the DB hasn't confirmed.
/* Coming back from Stripe's hosted flow. This used to be defined and never
   called, so a therapist landed on "What brings you to Kindred?" -- the
   account-type screen -- with no idea whether their verification had worked.
   Finishing the flow is NOT passing it: the verdict arrives by webhook moments
   later, so this confirms we received it without claiming an outcome the
   database has not agreed to. */
function openIdentityReturn(signedIn) {
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <div class="id-return-check" aria-hidden="true">&#10003;</div>
    <h2>Thanks for verifying</h2>
    <div class="intake-sub">Stripe is confirming your ID now &mdash; it usually takes under a minute. Your dashboard updates on its own the moment it clears; you don't need to do it again.</div>
    <button class="primary-btn" id="id-return-btn">${signedIn ? 'Back to my dashboard' : 'Sign in to continue'}</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close');
  if (sc) sc.addEventListener('click', close);
  document.getElementById('id-return-btn').addEventListener('click', () => {
    close();
    if (signedIn) { showTScreen('t-home'); }
    else { accountType = 'therapist'; openLogin(); }
  });
}

function clientDataPersistenceEnabled() { return !!KINDRED_FLAGS.clientDataPersistence; }
// The flags MUST come from the web, not from the app bundle. Inside a native
// (Capacitor) build a relative fetch resolves to the packaged copy, which would
// freeze the flags at whatever shipped — defeating the whole point of being able
// to flip clientDataPersistence after the BAA without an App Store resubmission.
// So: absolute URL everywhere except local development.
const FLAGS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'config.json'
  : 'https://kindredtherapymatch.com/app/config.json';
(function loadRemoteFlags() {
  fetch(FLAGS_URL + '?cb=' + Date.now(), { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(cfg => { if (cfg && typeof cfg === 'object') KINDRED_FLAGS = Object.assign(KINDRED_FLAGS, cfg); })
    .catch(() => {});   // safe defaults (everything off) stand if it can't load
})();

// The client data layer, abstracted behind the flag. TODAY every method is a
// no-op beyond the in-browser state the app already keeps (HIPAA-clean). When
// clientDataPersistence flips ON (post-BAA), the SAME shipped binary starts
// persisting to Supabase through these hooks — no new App Store build. The
// server writes are best-effort and never block the UI.
const clientStore = {
  async persistIntake(intake) {
    if (!clientDataPersistenceEnabled() || !authReady() || !loadAuthSession()) return;
    try { await authRest('/client_intake', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: loadAuthSession().user.id, answers: intake }) }); }
    catch (e) { console.warn('client intake persist deferred:', e.message); }
  },
  async persistMatch(m) {
    if (!clientDataPersistenceEnabled() || !authReady() || !loadAuthSession()) return;
    try { await authRest('/client_matches', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ client_id: loadAuthSession().user.id, therapist_id: m.therapist.id, status: m.status }) }); }
    catch (e) { console.warn('client match persist deferred:', e.message); }
  },
  async persistMessage(therapistId, msg) {
    if (!clientDataPersistenceEnabled() || !authReady() || !loadAuthSession()) return;
    try { await authRest('/messages', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ client_id: loadAuthSession().user.id, therapist_id: therapistId, sender: msg.from, text: msg.text }) }); }
    catch (e) { console.warn('message persist deferred:', e.message); }
  }
};

const THERAPISTS = [
  {
    id: 't1', name: 'Dr. Maya Chen', credentials: ['PhD', 'Clinical Psychologist'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1573496799652-408c2ac9fe98?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'MC', gradient: 'linear-gradient(135deg,#8a63a8,#5c3766)',
    meta: ['Online & In-person', '$140–180/session'],
    bestFor: 'I work best with high-achievers who are quietly running on empty.',
    tags: ['Anxiety', 'Life Transitions', 'CBT', 'LGBTQ+ Affirming'],
    mandatoryPromptAnswers: [
      "turning the anxious noise in your head into an actual plan you can follow, even on the days you don't feel like it.",
      "We'll skip the small talk. I want to know what's actually been sitting heavy on you lately, and what you're hoping is different a few months from now."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you want homework between sessions and someone who'll actually follow up on it — I track progress, not just feelings.", photo: null },
      { question: 'I became a therapist because...', answer: "I used to be the person who had it all together on paper and was quietly falling apart. I wanted to be the therapist I needed back then.", photo: null },
      { question: 'My greatest strength is...', answer: "turning insight into an actual plan — understanding your anxiety perfectly doesn't help if we don't practice doing things differently.", photo: null },
      { question: 'How I can help...', answer: "give you a structured, judgment-free space to build habits that actually stick, not just talk about wanting to.", photo: null }
    ],
    modalities: ['CBT'], style: 'direct',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video', 'in-person'], rateMin: 140, insuranceList: ['Aetna', 'BCBS', 'EAP'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Austin', state: 'TX' },
    licenseVerified: true, licenseNumber: 'TX-38291',
    website: 'drmayachen.com',
    stats: { profileViews: 214, hearts: 58, top5: 12, conversationsStarted: 9, weekViews: 31, weekHearts: 8 },
    media: { video: 'https://www.w3schools.com/html/mov_bbb.mp4', office: 'https://picsum.photos/id/42/700/460', outOfOffice: 'https://picsum.photos/id/1043/700/460' },
    persona: {
      inOffice: "Structured but never stiff — we open with a two-minute check-in, then get to work. I keep a visible agenda and we end every session with one concrete thing to try.",
      outOfOffice: "On a trail before 7am most Saturdays. Hiking is where I practice what I preach about quieting an overachieving brain."
    }
  },
  {
    id: 't2', name: 'James Okafor', credentials: ['LMFT'],
    pronouns: 'he/him', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'JO', gradient: 'linear-gradient(135deg,#bf7350,#9c5535)',
    meta: ['Online only', '$110–130/session'],
    selfPayNote: 'Sliding scale available',
    bestFor: "I work best with couples who still want to fight for the relationship, not just survive it.",
    tags: ['Couples', 'Family Conflict', 'EFT'],
    mandatoryPromptAnswers: [
      "learning how to fight for each other again instead of just fighting.",
      "I want to hear both sides before either of you starts defending yours. First sessions are for understanding the pattern, not assigning blame."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you want a therapist who'll gently push back instead of just nodding along — I believe in doing the work between sessions, not just venting in them.", photo: null },
      { question: 'Together we could...', answer: "figure out what you're actually fighting about underneath the dishes and the schedules.", photo: null },
      { question: "I won't shut up about...", answer: "how fast things can shift once you both stop trying to win the argument and start trying to understand it.", photo: null },
      { question: 'How I can help...', answer: "translate what you're each trying to say so the other person can actually hear it.", photo: null }
    ],
    modalities: ['EFT'], style: 'direct',
    identity: { gender: 'male', lgbtqAffirming: false }, languages: ['English', 'Spanish'],
    formats: ['video'], rateMin: 110, insuranceList: [],
    acceptingOngoing: true, onDemand: true, onDemandSlots: [{ label: 'Thu 4:00pm', rank: 2 }],
    nextAvailableRank: 3, nextAvailableLabel: 'Next week',
    practiceType: 'generalist', externalAppointments: [], agreedToOnDemandPolicy: true,
    location: { city: 'Chicago', state: 'IL' },
    licenseVerified: true, licenseNumber: 'IL-77204',
    website: 'okaforcouples.com',
    stats: { profileViews: 162, hearts: 41, top5: 8, conversationsStarted: 7, weekViews: 22, weekHearts: 5 },
    media: { video: null, office: 'https://picsum.photos/id/48/700/460', outOfOffice: 'https://picsum.photos/id/553/700/460' },
    persona: {
      inOffice: "Two chairs angled toward each other, not toward me. I talk with my hands, I name the elephant in the room early, and nobody leaves mid-fight.",
      outOfOffice: "Long walks with terrible podcasts and great questions. My wife says I interview strangers at parties — she's right."
    }
  },
  {
    id: 't3', name: 'Priya Raman', credentials: ['LPC', 'Trauma Specialist'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1592621385612-4d7129426394?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'PR', gradient: 'linear-gradient(135deg,#a68fc9,#7a5fa8)',
    meta: ['In-person, Downtown', '$150/session'],
    selfPayNote: 'Out-of-network',
    bestFor: "I work best with people carrying trauma they've never had the space to fully unpack.",
    tags: ['Trauma', 'EMDR', 'PTSD', 'Grief'],
    mandatoryPromptAnswers: [
      "moving at a pace that actually feels safe, not the pace you think you're supposed to be at.",
      "There's no pressure to tell the whole story right away. We'll go at whatever pace actually feels safe for you."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you want someone patient, who won't rush you toward 'moving on' before you're ready.", photo: null },
      { question: 'My greatest strength is...', answer: "holding space without needing you to have your story fully sorted out before you walk in the door.", photo: null },
      { question: "I won't shut up about...", answer: "how physical trauma responses can be — a lot of our work is as much about your body settling down as it is about talking.", photo: null },
      { question: 'How I can help...', answer: "offer a quiet, steady space with no pressure to perform being okay.", photo: null }
    ],
    modalities: ['EMDR'], style: 'gentle',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English', 'Hindi'],
    formats: ['in-person'], rateMin: 150, insuranceList: [],
    acceptingOngoing: false, onDemand: true, onDemandSlots: [{ label: 'Wed 1:00pm', rank: 1 }, { label: 'Fri 11:00am', rank: 3 }],
    nextAvailableRank: null, nextAvailableLabel: 'Not accepting new ongoing clients',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: true,
    location: { city: 'Austin', state: 'TX' },
    licenseVerified: true, licenseNumber: 'TX-51830',
    website: '',
    stats: { profileViews: 189, hearts: 47, top5: 10, conversationsStarted: 6, weekViews: 26, weekHearts: 6 },
    media: { video: null, office: 'https://picsum.photos/id/1060/700/460', outOfOffice: 'https://picsum.photos/id/106/700/460' },
    persona: {
      inOffice: "Soft light, a tea kettle, and no clock facing you. We move at your pace — silence is allowed here, and so is not being ready yet.",
      outOfOffice: "Tending an unreasonable number of plants and learning my grandmother's recipes one phone call at a time."
    }
  },
  {
    id: 't4', name: 'Dr. Sam Alvarez', credentials: ['PsyD'],
    pronouns: 'he/him', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1508341591423-4347099e1f19?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'SA', gradient: 'linear-gradient(135deg,#d4a24e,#b57e2f)',
    meta: ['Online & In-person', '$160/session'],
    bestFor: "I work best with men who are burnt out and tired of being told to 'just relax.'",
    tags: ['ADHD', 'Burnout', "Men's Issues", 'ACT'],
    mandatoryPromptAnswers: [
      "building a life that actually works with your brain instead of constantly fighting it.",
      "I'll ask a lot of direct questions and probably crack a joke or two. I want to know what's actually going on, not the polished version."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you're tired of being told to 'just relax' and want someone who gets that your brain doesn't work that way.", photo: null },
      { question: 'My greatest strength is...', answer: "helping you stop chasing the trade-off of eliminating anxiety or distraction, and instead build a good life around it.", photo: null },
      { question: "My favorite thing I've learned...", answer: "how much burnout gets misdiagnosed as a focus problem. Sometimes the fix isn't a better system, it's fewer things on your plate.", photo: null },
      { question: 'How I can help...', answer: "bring a direct, sometimes funny conversation instead of a couch-and-tissue-box vibe.", photo: null }
    ],
    modalities: ['ACT'], style: 'direct',
    identity: { gender: 'male', lgbtqAffirming: false }, languages: ['English', 'Spanish'],
    formats: ['video', 'in-person'], rateMin: 160, insuranceList: ['Cigna'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Chicago', state: 'IL' },
    licenseVerified: true, licenseNumber: 'IL-42917',
    website: '',
    stats: { profileViews: 143, hearts: 36, top5: 7, conversationsStarted: 5, weekViews: 19, weekHearts: 4 },
    media: { video: null, office: 'https://picsum.photos/id/60/700/460', outOfOffice: 'https://picsum.photos/id/1035/700/460' },
    persona: {
      inOffice: "Whiteboard on the wall, fidget bin on the table. We externalize everything — your brain gets to think out loud here without being graded on it.",
      outOfOffice: "Chasing waterfalls, literally. My camera roll is 90% trails and 10% terrible selfies at the top of them."
    }
  },
  {
    id: 't5', name: 'Dr. Leah Fitzgerald', credentials: ['PhD', 'Perinatal Specialist'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'LF', gradient: 'linear-gradient(135deg,#6ba4c9,#4278a0)',
    meta: ['Online only', '$135/session'],
    bestFor: 'I work best with new parents who feel like they should be coping better than they are.',
    tags: ['Postpartum', 'Anxiety', 'New Parents'],
    mandatoryPromptAnswers: [
      "feeling like yourself again, not just 'fine' for the baby's sake.",
      "I want to know how you're actually sleeping, eating, and coping — not just how the baby's doing. You matter here too."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you're exhausted, maybe scared to admit how hard this has been, and just want someone to say 'this makes sense.'", photo: null },
      { question: 'My greatest strength is...', answer: "reminding you that postpartum struggles are not a reflection of how much you love your baby — that guilt is common, and it's almost never true.", photo: null },
      { question: 'All I ask is that you...', answer: "let yourself say the unspeakable parts out loud without expecting yourself to flinch first.", photo: null },
      { question: "My favorite thing I've learned...", answer: "how much relief comes from just being told 'this is a normal reaction to an abnormal amount of pressure.' You're not broken.", photo: null }
    ],
    modalities: [], style: 'gentle',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video'], rateMin: 135, insuranceList: ['United'],
    acceptingOngoing: false, onDemand: false, onDemandSlots: [],
    nextAvailableRank: null, nextAvailableLabel: 'Paused',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Denver', state: 'CO' },
    licenseVerified: true, licenseNumber: 'CO-20348',
    website: 'drleahfitz.com',
    stats: { profileViews: 98, hearts: 22, top5: 4, conversationsStarted: 3, weekViews: 9, weekHearts: 2 },
    media: { video: null, office: 'https://picsum.photos/id/0/700/460', outOfOffice: 'https://picsum.photos/id/429/700/460' },
    persona: {
      inOffice: "Video-first and baby-friendly — nurse, rock, or pause whenever you need. Half my sessions happen during nap windows and that's exactly how it should be.",
      outOfOffice: "Slow breakfasts on weekends. Berries in a mug counts as self-care and I will defend that position professionally."
    }
  },
  {
    id: 't6', name: 'Marcus Webb', credentials: ['LCSW'],
    pronouns: 'he/him', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'MW', gradient: 'linear-gradient(135deg,#8a9b6e,#647a4a)',
    meta: ['In-person & Online', '$120/session'],
    selfPayNote: 'Sliding scale',
    bestFor: 'I work best with young adults who are ambivalent about change and sick of being lectured.',
    tags: ['Substance Use', 'Young Adults', 'Motivational Interviewing'],
    mandatoryPromptAnswers: [
      "figuring out what you actually want, without anyone else's voice in your head about it.",
      "No lectures, no judgment. I want to understand what role this has been playing in your life before we talk about changing anything."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you're sick of being told what to do and want someone who'll actually ask what you want instead.", photo: null },
      { question: 'My greatest strength is...', answer: "sitting with ambivalence instead of rushing you past it — most people who change something big felt torn about it the whole way through.", photo: null },
      { question: 'How I can help...', answer: "have a real conversation, not an intervention. There's no script I'm trying to get you to follow.", photo: null },
      { question: "My favorite thing I've learned...", answer: "that I'm not going to push you toward a decision. My job is to help you hear yourself think.", photo: null }
    ],
    modalities: ['Motivational Interviewing'], style: 'gentle',
    identity: { gender: 'male', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video', 'in-person'], rateMin: 120, insuranceList: [],
    acceptingOngoing: true, onDemand: true, onDemandSlots: [{ label: 'Tue 9:00am', rank: 1 }],
    nextAvailableRank: 4, nextAvailableLabel: 'In 2 weeks',
    practiceType: 'generalist', externalAppointments: [], agreedToOnDemandPolicy: true,
    location: { city: 'Austin', state: 'TX' },
    licenseVerified: true, licenseNumber: 'TX-66125',
    website: '',
    stats: { profileViews: 121, hearts: 30, top5: 6, conversationsStarted: 4, weekViews: 15, weekHearts: 3 },
    media: { video: null, office: 'https://picsum.photos/id/180/700/460', outOfOffice: 'https://picsum.photos/id/1036/700/460' },
    persona: {
      inOffice: "Hoodie-friendly. No clipboard between us, no trick questions. If you want to sit on the floor, the floor is honestly where the best sessions happen.",
      outOfOffice: "Winter camping, because apparently I only relax when it's slightly too cold to think."
    }
  },
  {
    id: 't7', name: 'Dr. Aaron Blake', credentials: ['LCSW'],
    pronouns: 'he/him', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'AB', gradient: 'linear-gradient(135deg,#5f7d6b,#3c5246)',
    meta: ['Online & In-person', '$135/session'],
    selfPayNote: '',
    bestFor: 'I work best with men who were raised to handle everything alone and are finally done doing that.',
    tags: ['Depression', 'Burnout', 'Anxiety'],
    mandatoryPromptAnswers: [
      "putting words to things you were taught to just push through.",
      "No performance required. First sessions are just about getting the weight of it out loud — we go at your pace."
    ],
    optionalPrompts: [
      { question: "You'll probably click with me if...", answer: "you want someone direct who won't tiptoe, but also won't make you feel like a project to be fixed.", photo: null },
      { question: 'How I can help...', answer: "make sense of the low-grade heaviness that looks like 'fine' from the outside.", photo: null },
      { question: 'I became a therapist because...', answer: "I watched too many good men white-knuckle their way through things that a single honest conversation could have eased.", photo: null }
    ],
    modalities: ['CBT'], style: 'direct',
    identity: { gender: 'male', lgbtqAffirming: false }, languages: ['English'],
    formats: ['video', 'in-person'], rateMin: 135, insuranceList: ['Aetna', 'BCBS'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Atlanta', state: 'GA' },
    licenseVerified: true, licenseNumber: 'GA-31882',
    website: 'aaronblakelcsw.com',
    stats: { profileViews: 88, hearts: 19, top5: 3, conversationsStarted: 3, weekViews: 12, weekHearts: 4 },
    media: { video: null, office: 'https://picsum.photos/id/1062/700/460', outOfOffice: 'https://picsum.photos/id/1074/700/460' },
    persona: {
      inOffice: "Even, unhurried, a little dry. I'll say the true thing out loud so you don't have to be the first one to.",
      outOfOffice: "Rebuilding an old motorcycle that may never run. My kids think that's hilarious."
    }
  },
  {
    id: 't8', name: 'Sofia Marín', credentials: ['LMFT'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'SM', gradient: 'linear-gradient(135deg,#a86377,#6b3c4e)',
    meta: ['Online only', '$145/session'],
    selfPayNote: 'Sliding scale available',
    bestFor: 'I work best with people carrying a big life change and the grief nobody warned them came with it.',
    tags: ['Life Transitions', 'Anxiety', 'Couples'],
    mandatoryPromptAnswers: [
      "steadying yourself when the ground you were standing on just moved.",
      "We'll start with what's loudest right now. You don't need to have it organized before you get here — that's the work."
    ],
    optionalPrompts: [
      { question: 'Together we could...', answer: "make room for the version of you that's still catching up to the change.", photo: null },
      { question: "Out of session, you'll find me...", answer: "cooking for far too many people — feeding people is how my family says the things we can't.", photo: null }
    ],
    modalities: ['EFT'], style: 'gentle',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English', 'Spanish'],
    formats: ['video'], rateMin: 145, insuranceList: ['Cigna', 'EAP'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 2, nextAvailableLabel: 'Next week',
    practiceType: 'generalist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Miami', state: 'FL' },
    licenseVerified: true, licenseNumber: 'FL-45107',
    website: 'sofiamarintherapy.com',
    stats: { profileViews: 104, hearts: 27, top5: 5, conversationsStarted: 4, weekViews: 16, weekHearts: 6 },
    media: { video: null, office: 'https://picsum.photos/id/1084/700/460', outOfOffice: 'https://picsum.photos/id/292/700/460' },
    persona: {
      inOffice: "Warm and a little maternal, but I'll ask the pointed question when it's time. Tissues are always within reach and never a big deal.",
      outOfOffice: "Salsa dancing badly and proudly, and calling my abuela every Sunday whether I have news or not."
    }
  },
  {
    id: 't9', name: 'Jordan Lee', credentials: ['LPC'],
    pronouns: 'they/them', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'JL', gradient: 'linear-gradient(135deg,#8a63a8,#5c3766)',
    meta: ['Online only', '$140/session'],
    selfPayNote: '',
    bestFor: 'I work best with LGBTQ+ folks who are tired of explaining themselves before they can even start.',
    tags: ['Anxiety', 'Self Esteem', 'Life Transitions'],
    mandatoryPromptAnswers: [
      "feeling at home in yourself, without translating for the room first.",
      "You won't have to catch me up on the basics of your identity — we get to skip straight to what actually brought you in."
    ],
    optionalPrompts: [
      { question: "We're the same type of weird if...", answer: "you process out loud, contradict yourself twice, and land somewhere truer than where you started.", photo: null },
      { question: 'I geek out on...', answer: "the moment a client stops managing how they come across and just says the real thing.", photo: null }
    ],
    modalities: ['ACT'], style: 'balanced',
    identity: { gender: 'nonbinary', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video'], rateMin: 140, insuranceList: ['Aetna', 'United'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Brooklyn', state: 'NY' },
    licenseVerified: true, licenseNumber: 'NY-58820',
    website: 'jordanleecounseling.com',
    stats: { profileViews: 131, hearts: 44, top5: 7, conversationsStarted: 6, weekViews: 20, weekHearts: 8 },
    media: { video: null, office: 'https://picsum.photos/id/1067/700/460', outOfOffice: 'https://picsum.photos/id/335/700/460' },
    persona: {
      inOffice: "Curious, warm, a little playful. I reflect a lot back to you — you'll hear your own patterns in my voice and go 'oh, huh.'",
      outOfOffice: "Thrifting for the exact right lamp for eleven years running, and losing to my cat at everything."
    }
  },
  {
    id: 't10', name: 'Dr. Evelyn Hart', credentials: ['PhD', 'Clinical Psychologist'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'EH', gradient: 'linear-gradient(135deg,#5c6b8a,#37436b)',
    meta: ['Online & In-person', '$175/session'],
    selfPayNote: '',
    bestFor: 'I work best with people carrying something from years ago that still runs the show today.',
    tags: ['Trauma', 'Grief', 'Anxiety'],
    mandatoryPromptAnswers: [
      "loosening the grip of something that happened, so it stops shaping what happens next.",
      "We move carefully and never faster than you're ready for. Safety and pace come before anything else in trauma work."
    ],
    optionalPrompts: [
      { question: 'I became a therapist because...', answer: "I believe the past is far more changeable in its meaning than it feels when you're inside it.", photo: null },
      { question: 'My greatest strength is...', answer: "staying steady and unflinching with the things people are most afraid will scare someone off.", photo: null }
    ],
    modalities: ['EMDR'], style: 'gentle',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video', 'in-person'], rateMin: 175, insuranceList: [],
    acceptingOngoing: false, onDemand: false, onDemandSlots: [],
    nextAvailableRank: null, nextAvailableLabel: 'Not accepting new ongoing clients',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Seattle', state: 'WA' },
    licenseVerified: true, licenseNumber: 'WA-20911',
    website: 'evelynhartphd.com',
    stats: { profileViews: 173, hearts: 52, top5: 9, conversationsStarted: 8, weekViews: 9, weekHearts: 2 },
    media: { video: null, office: 'https://picsum.photos/id/1040/700/460', outOfOffice: 'https://picsum.photos/id/29/700/460' },
    persona: {
      inOffice: "Calm, grounded, deliberate. I'll slow us down on purpose — the nervous system doesn't heal in a hurry.",
      outOfOffice: "Tending a garden that is mostly weeds I've decided to like, and reading three books at once."
    }
  },
  {
    id: 't11', name: 'Nathan Brooks', credentials: ['LPC'],
    pronouns: 'he/him', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'NB', gradient: 'linear-gradient(135deg,#bf7350,#9c5535)',
    meta: ['Online only', '$120/session'],
    selfPayNote: '',
    bestFor: 'I work best with people who start a hundred things and finish two, and are hard on themselves about it.',
    tags: ['ADHD', 'Life Transitions', 'Burnout'],
    mandatoryPromptAnswers: [
      "building systems that fit your actual brain instead of the one you keep apologizing for not having.",
      "We'll get practical fast. Expect real strategies you can try this week, not just insight for its own sake."
    ],
    optionalPrompts: [
      { question: "I won't shut up about...", answer: "how much of what you call 'lazy' is actually an executive-function traffic jam, not a character flaw.", photo: null },
      { question: 'How I can help...', answer: "turn the overwhelm into a short list of next steps that don't make you want to nap.", photo: null }
    ],
    modalities: ['CBT'], style: 'direct',
    identity: { gender: 'male', lgbtqAffirming: false }, languages: ['English'],
    formats: ['video'], rateMin: 120, insuranceList: ['BCBS', 'Cigna'],
    acceptingOngoing: true, onDemand: true, onDemandSlots: [{ label: 'Mon 12:00pm', rank: 1 }, { label: 'Wed 5:30pm', rank: 2 }],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'specialist', externalAppointments: [], agreedToOnDemandPolicy: true,
    location: { city: 'Columbus', state: 'OH' },
    licenseVerified: true, licenseNumber: 'OH-40255',
    website: '',
    stats: { profileViews: 96, hearts: 25, top5: 4, conversationsStarted: 3, weekViews: 18, weekHearts: 5 },
    media: { video: null, office: 'https://picsum.photos/id/119/700/460', outOfOffice: 'https://picsum.photos/id/225/700/460' },
    persona: {
      inOffice: "Fast, warm, a whiteboard-and-sticky-notes kind of energy. We'll laugh about the chaos while we actually sort it.",
      outOfOffice: "Half-built projects everywhere and a very patient dog who's seen all of them."
    }
  },
  {
    id: 't12', name: 'Amara Johnson', credentials: ['LCSW'],
    pronouns: 'she/her', showPronouns: true, useCompanyName: false, companyName: '',
    photo: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=512&h=512&fit=crop&crop=faces&q=85',
    initials: 'AJ', gradient: 'linear-gradient(135deg,#8a63a8,#5c3766)',
    meta: ['Online only', '$130/session'],
    selfPayNote: 'Sliding scale available',
    bestFor: 'I work best with high-achieving Black women who are exhausted from being everyone else’s steady one.',
    tags: ['Anxiety', 'Burnout', 'Self Esteem'],
    mandatoryPromptAnswers: [
      "putting yourself back on your own list, without the guilt tax.",
      "This is a space where you don't have to be strong or explain the context. We can just start with how you actually are."
    ],
    optionalPrompts: [
      { question: 'Together we could...', answer: "untangle the difference between what you truly want and what you've been carrying because no one else would.", photo: null },
      { question: "You'll probably click with me if...", answer: "you want warmth and realness both — I'll hold space and also gently call it when you're overfunctioning again.", photo: null }
    ],
    modalities: ['CBT'], style: 'gentle',
    identity: { gender: 'female', lgbtqAffirming: true }, languages: ['English'],
    formats: ['video'], rateMin: 130, insuranceList: ['Aetna', 'United', 'EAP'],
    acceptingOngoing: true, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: 'generalist', externalAppointments: [], agreedToOnDemandPolicy: false,
    location: { city: 'Atlanta', state: 'GA' },
    licenseVerified: true, licenseNumber: 'GA-52740',
    website: 'amarajohnsonlcsw.com',
    stats: { profileViews: 148, hearts: 47, top5: 8, conversationsStarted: 6, weekViews: 24, weekHearts: 9 },
    media: { video: null, office: 'https://picsum.photos/id/1078/700/460', outOfOffice: 'https://picsum.photos/id/431/700/460' },
    persona: {
      inOffice: "Warm, direct, and fully in it with you. I laugh, I get real, and I won't let you shrink yourself in here.",
      outOfOffice: "Sunday reset queen — candles, a good playlist, and absolutely not answering my phone."
    }
  }
];

// Identity-affinity data for the seed therapists (ethnicity / gender-sexuality
// affinities / faith backgrounds they work with). Kept as a side map so the
// large therapist literals above stay readable; new signups start empty and
// would fill these from a future profile section.
const THERAPIST_IDENTITY = {
  t1: { ethnicity: 'Asian', affinities: ['LGBTQ+'], faith: ['Secular and Non-Religious'] },
  t2: { ethnicity: 'Black and African American', affinities: [], faith: ['Christian'] },
  t3: { ethnicity: 'South Asian', affinities: ['LGBTQ+'], faith: ['Hindu'] },
  t4: { ethnicity: 'Hispanic and Latino', affinities: [], faith: ['Secular and Non-Religious'] },
  t5: { ethnicity: '', affinities: [], faith: ['Christian'] },
  t6: { ethnicity: '', affinities: ['LGBTQ+', 'Transgender'], faith: ['Secular and Non-Religious'] },
  t7: { ethnicity: '', affinities: [], faith: ['Secular and Non-Religious'] },
  t8: { ethnicity: 'Hispanic and Latino', affinities: [], faith: ['Christian'] },
  t9: { ethnicity: '', affinities: ['LGBTQ+', 'Non-binary'], faith: ['Secular and Non-Religious'] },
  t10: { ethnicity: '', affinities: [], faith: [] },
  t11: { ethnicity: '', affinities: [], faith: [] },
  t12: { ethnicity: 'Black and African American', affinities: [], faith: ['Christian'] }
};
// Recurring weekly openings the therapist has for NEW ongoing clients — the
// Home tab is an availability calendar, so this is the core of it. Only
// therapists accepting ongoing clients are seeded with open slots.
const THERAPIST_AVAILABILITY = {
  t1: [{ day: 'Mon', time: '9:00am' }, { day: 'Wed', time: '4:00pm' }, { day: 'Thu', time: '11:00am' }],
  t2: [{ day: 'Tue', time: '10:00am' }, { day: 'Fri', time: '2:00pm' }],
  t4: [{ day: 'Mon', time: '1:00pm' }, { day: 'Wed', time: '9:00am' }, { day: 'Fri', time: '3:00pm' }],
  t6: [{ day: 'Tue', time: '3:00pm' }, { day: 'Thu', time: '5:00pm' }]
};
// The therapist's PRIVATE ideal-client spec — who they're the strongest fit for.
// Never shown to clients. Everything on a therapist's profile above stays their
// "I also work with" tier, so stating an ideal never narrows who can find them.
// mustHaves (max 3) weigh double in scoring; they are not filters.
const THERAPIST_IDEAL = {
  t1: { ageBands: ['25–34', '35–44'], genders: ['Female'], fields: ['Tech', 'Healthcare'],
        needs: ['Anxiety', 'Burnout'], modalities: ['CBT'], payment: 'Either',
        availability: ['Early mornings', 'Evenings'], mustHaves: ['needs', 'modalities'] },
  t3: { ageBands: ['25–34', '35–44'], genders: ['Female'], fields: ['First responder', 'Military & Veteran'],
        needs: ['Trauma'], modalities: ['EMDR'], payment: 'Cash pay',
        availability: [], mustHaves: ['needs', 'modalities', 'fields'] },
  t6: { ageBands: ['18–24', '25–34'], genders: [], fields: ['Student', 'Creative'],
        needs: ['ADHD'], modalities: [], payment: 'Either',
        availability: [], mustHaves: ['needs'] }
};

// Demo-only: a few names waiting on therapists who are currently full, so the
// Inquiries → Waitlist section has something to show.
const WAITLIST_SEED = {
  t3: ['Jordan M.', 'Alex R.'],
  t5: ['Sam T.', 'Priya K.', 'Devon L.']
};
// Demo: a therapist licensed (and Stripe-verified) in more than one state.
const LICENSE_SEED = { t1: ['TX', 'CA'] };

// Backfill every generic default a therapist object needs, so seeded rows, rows
// loaded from the DB, and freshly-signed-up therapists all end up complete.
// (Only touches fields that are undefined — explicit values, e.g. a new signup's
// listed:false, are preserved.)
// NOTE: this block must stay ABOVE normalizeTherapist — the seed loop calls
// listingPricing() while this module is still evaluating, so a `const`
// declared after that loop would throw on load (temporal dead zone).
// ===== LISTING SUBSCRIPTION (therapists pay to list) =====
// Escalating founding ladder: the earlier you join, the lower your rate — and
// you KEEP that rate for 12 months before it moves to the standard rate. The
// long lock is what makes the urgency real (joining in Sept vs Dec saves $120
// over the year), and it fairly rewards the therapists who fill a cold-start
// marketplace. Billing starts immediately on signup.
// Paid on the WEBSITE (Stripe web checkout), never in-app — keeps Apple's cut
// at 0% and avoids any IAP surface in the App Store build.
const THERAPIST_BILLING_URL = '/activate.html';
/* UTC, matching activate.js — see the long note there. Without the Z these
   parse in the viewer's timezone, and this list has to agree with the one that
   picks the Stripe promo code or the app quotes a rate the checkout won't
   honour. Same instant on both sides is the only version of "in sync" worth
   having. */
const PRICING_TIERS = [
  { until: new Date('2026-09-01T00:00:00Z'), rate: 9.99 },
  { until: new Date('2026-10-01T00:00:00Z'), rate: 14.99 },
  { until: new Date('2026-11-01T00:00:00Z'), rate: 16.99 },
  { until: new Date('2026-12-01T00:00:00Z'), rate: 19.99 }
];
const STANDARD_RATE = 29.99;
const FOUNDING_LOCK_MONTHS = 12;
/* Mirrors TRIAL_DAYS in activate.js, which owns the Stripe links. Everyone
   activating gets the trial, so this appears in the Activate modal and in
   every sentence about billing state. */
const TRIAL_DAYS = 30;
const dateLabel = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

function listingPricing() {
  const now = new Date();
  const i = PRICING_TIERS.findIndex(t => now < t.until);
  if (i === -1) {
    // ladder has closed — standard rate for everyone
    return { founding: false, introRate: STANDARD_RATE, introMonths: 0, standardRate: STANDARD_RATE, nextRate: null, nextDateLabel: null };
  }
  const tier = PRICING_TIERS[i];
  const next = PRICING_TIERS[i + 1];
  return {
    founding: true,
    introRate: tier.rate,
    introMonths: FOUNDING_LOCK_MONTHS,
    standardRate: STANDARD_RATE,
    nextRate: next ? next.rate : STANDARD_RATE,   // what it becomes after this deadline
    nextDateLabel: dateLabel(tier.until)          // when this rate goes away
  };
}

/* ===== NAMES ==================================================================
   A therapist's name is the single most personal thing on the card, and
   "Kennady SCott" shipped to the public profile because nothing ever looked at
   it. But a name checker is one of the easiest things in software to get
   wrong, and getting it wrong on a therapy product means telling someone their
   own name is a mistake.

   SO: SUGGEST, NEVER SILENTLY CORRECT. Every one of these is a real name --
     McDonald  MacLeod  DeShawn  JoAnn  O'Brien  d'Angelo  van der Berg
     IJsselstein (the Dutch IJ digraph is genuinely two capitals)
     bell hooks (deliberately lowercase)
   Title-casing that list would mangle most of it. Nothing here rewrites a name
   on its own; it offers, and "keep it as I typed it" is always one tap away.

   The one pattern worth flagging is a shift-key slip: two or more capitals at
   the START of a word followed by lowercase -- SCott, KEnnady, THomas. That is
   distinct from McDonald (cap, lower, cap) and from initials like "JW Smith"
   (all caps, no lowercase tail). It still catches IJsselstein, which is why
   the escape hatch exists rather than being an edge case nobody thought about.

   Whitespace IS normalised silently -- collapsing a double space and trimming
   the ends cannot mangle anybody's name, and a trailing space is never
   deliberate. */
function tidyNameWhitespace(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

/* "Keep what I typed", remembered against the exact spelling. Deliberately NOT
   a column: this is a UI acknowledgement, and profileGaps() has to keep
   mirroring the SQL publish gate exactly -- adding a browser-only condition to
   it would let localStorage and the database disagree about whether someone is
   live, which is the bug this whole stretch of work has been about. Worst case
   on a new device is being asked once more and tapping keep. */
const NAME_OK_KEY = 'kindred-name-accepted';
function nameAccepted(name) {
  try { return localStorage.getItem(NAME_OK_KEY) === tidyNameWhitespace(name); } catch (e) { return false; }
}
function rememberNameAccepted(name) {
  try { localStorage.setItem(NAME_OK_KEY, tidyNameWhitespace(name)); } catch (e) {}
}

function nameIssue(raw) {
  const name = tidyNameWhitespace(raw);
  if (!name) return null;
  if (nameAccepted(name)) return null;      // they have already said it is right

  // shift held a beat too long: SCott, KEnnady
  const slip = name.split(' ').find(w => /^[A-Z]{2,}[a-z]/.test(w));
  if (slip) {
    const fixed = name.split(' ')
      .map(w => /^[A-Z]{2,}[a-z]/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)
      .join(' ');
    return { suggestion: fixed, why: `“${slip}” looks like the shift key stayed down.` };
  }

  // whole name shouting -- common paste artefact, but AGNES or initials could
  // be deliberate, so it is still only ever a suggestion
  if (/[A-Z]/.test(name) && name === name.toUpperCase() && name.replace(/[^A-Za-z]/g, '').length > 3) {
    const fixed = name.split(' ')
      .map(w => w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w)
      .join(' ');
    if (fixed !== name) return { suggestion: fixed, why: 'This is in all capitals.' };
  }
  return null;
}

/* ===== WHAT A PROFILE NEEDS BEFORE A CLIENT SHOULD SEE IT ====================
   The bar was `name is not null` -- client-side and in the database. So a
   therapist could pay, verify, go live, and be shown to clients as a name, a
   "Specialties" heading with nothing under it, and a "Get to Know Them"
   section that was empty. Every checklist on the page said they were set up.

   Kindred's pitch is "more than a specialty": clients are matched on how
   someone works, and the profile is the only place that exists. A blank one
   is worse than no listing -- it is a client's first impression of the whole
   product, and it says there is nothing here.

   Two essentials beyond the name, chosen because each is load-bearing for a
   different half of the pitch:
     SPECIALTIES  what matching filters on, and the tags on the card
     ONE ANSWER   the voice -- the thing a directory doesn't have
   Deliberately NOT a length or quality bar. "At least one" is a floor against
   emptiness, not an editor. */
/* MUST accept exactly the same set as profile_is_publishable() in migration
   0027. If the database is stricter, the app calls a profile finished and the
   therapist silently never appears; if the app is stricter, it withholds
   someone the database is already showing. Either way it is the same class of
   contradiction as the billing copy. The columns a therapist's words can land
   in are: best_for, prompt_fit, persona.inOffice/outOfOffice, any
   optional_prompts answer, any blocks prompt answer. */
function hasWrittenVoice(t) {
  if (!t) return false;
  const filled = v => !!(v && String(v).trim());
  if (filled(t.bestFor) || filled(t.promptFit)) return true;
  const p = t.persona || {};
  if (filled(p.inOffice) || filled(p.outOfOffice)) return true;
  if ((t.optionalPrompts || []).some(q => q && filled(q.answer))) return true;
  /* Read t.blocks directly rather than via getToKnowBlocks(), which WRITES
     t.blocks as a side effect -- a predicate that rearranges the profile feed
     every time something asks whether the profile is done is a trap. */
  if (Array.isArray(t.blocks) && t.blocks.some(b => b && b.type === 'prompt' && filled(b.answer))) return true;
  if ((t.mandatoryPromptAnswers || []).some(filled)) return true;
  return false;
}

/* What is still missing, named the way a therapist would name it. Returned as
   a list rather than a boolean so the checklist can say WHICH thing. */
function profileGaps(t) {
  if (!t) return [];
  const gaps = [];
  if (!(t.name && String(t.name).trim())) gaps.push('your name');
  /* A photo is not decoration on a therapy product. The question a client is
     actually answering is "can I picture myself opening up to this person",
     and initials on a coloured block answer it badly -- it reads as a listing
     rather than a person. Required for the same reason specialties are:
     without it the card cannot do its job. */
  if (!(t.photo && String(t.photo).trim())) gaps.push('a photo of you');
  if (!((t.tags || []).length))           gaps.push('at least one specialty');
  if (!hasWrittenVoice(t))                gaps.push('something in your own words');
  return gaps;
}

/* ===== WHAT IS THIS LISTING ACTUALLY DOING =====================================
   The Home banner and Settings each worked this out for themselves and reached
   opposite answers on the same screen: the banner required licence AND identity
   before saying "live", Settings said "Your profile is live" the moment billing
   started. A therapist could read "You're being billed but clients can't see
   you yet" and "Listed — $29.99/mo. Your profile is live." three inches apart.

   Two facts, deliberately separate, because they move independently:
     MONEY       none | trial | charging      (from Stripe's subscription_status)
     VISIBILITY  listed && licence && identity

   `listed` means the subscription exists -- the webhook flips `published` for
   BOTH 'active' and 'trialing' -- so it has never meant "a client can see you",
   and reading it as though it did is the whole bug.
   ========================================================================== */
/* A FIXED DATE, not a rolling window. Kindred is free for therapists until
   March 2027 — the same date for everyone, however and whenever they joined.
   An earlier version gave each therapist six months from their own go-live;
   that was an inference and it was wrong. A date is one sentence, says the
   same thing on the website and in the app without either computing anything,
   and cannot drift per therapist. Mirrors migration 0032. */
const FREE_UNTIL_LABEL = 'March 2027';
const FREE_ENDING_SOON_DAYS = 30;

/* Days until the free period ends. Infinity when it has not started -- they
   have never been findable, so nothing is running down. */
function fmtFreeUntil(t) {
  if (!t || !t.freeUntil) return '';
  const d = new Date(t.freeUntil);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function freeDaysLeft(t) {
  if (!t || !t.freeUntil) return Infinity;
  const end = new Date(t.freeUntil);
  if (isNaN(end)) return Infinity;
  return Math.ceil((end - Date.now()) / 86400000);
}

function listingState(t) {
  /* ENTITLEMENT, NOT PAYMENT. `t.listed` used to mean "Stripe says they are
     paying", and it was the only route to being visible -- so removing the
     paywall could not be done in the app alone. Now: inside the six free
     months, or subscribed. Null free_until means the clock has not started
     (never verified), which counts as entitled -- see migration 0029 for why
     it has to. */
  const subscribed = t.subscriptionStatus === 'active' || t.subscriptionStatus === 'trialing';
  const daysLeft   = freeDaysLeft(t);
  const inFree     = !subscribed && daysLeft > 0;
  const lapsed     = !subscribed && daysLeft <= 0;
  const paying     = subscribed || inFree;      // "entitled" — kept the name so callers still read
  const checked    = !!(t.licenseVerified && t.identityVerified);
  const trialing   = t.subscriptionStatus === 'trialing';
  /* Content is a publishing condition too, not just a nudge -- so it has to be
     part of `visible`, or the banner would announce someone as live while an
     empty profile kept them out of the results. That is the same contradiction
     the billing copy just had, one field over. */
  const gaps     = profileGaps(t);
  const complete = gaps.length === 0;
  return {
    paying, checked, trialing, gaps, complete,
    subscribed, inFree, lapsed, daysLeft,
    endingSoon: inFree && daysLeft <= FREE_ENDING_SOON_DAYS,
    visible: paying && checked && complete,
    /* Lapsed is NOT "stuck". Stuck means finish something; lapsed means the
       free period ran out and there is one decision to make. Different
       sentence, different button. */
    stuck:   paying && !(checked && complete),
    money:   lapsed ? 'lapsed' : subscribed ? (trialing ? 'trial' : 'charging') : 'free'
  };
}

/* The one sentence. Both surfaces call this, so they cannot disagree again.
   It used to take an `inChecklist` flag so the banner could append "one thing
   left that will sharpen who reaches you" -- a pointer at the ideal-client
   step. That step is no longer part of the path to going live, so the nudge
   travelled with it and now lives on the optional row itself, next to the
   button that does something about it. */
function listingLead(t, opts) {
  const allDone = !!(opts && opts.allDone);
  const s = listingState(t);

  /* The free period ran out and nobody renewed. Their profile and everything
     in it is intact -- it is simply not being shown -- and saying so plainly
     matters more than the offer does. */
  if (s.lapsed) {
    return `<strong>Kindred is no longer free for your account.</strong> Your profile is saved exactly as you left it, and clients stop seeing it until you keep it active.`;
  }

  const freeNote = s.endingSoon
    ? ` Kindred is free for you until ${FREE_UNTIL_LABEL} \u2014 ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left.`
    : s.inFree && s.daysLeft !== Infinity
      ? ` Kindred is free for therapists until ${FREE_UNTIL_LABEL} &mdash; nothing to pay until then.`
      : '';
  const trialNote = s.trialing
    ? ` Nothing has been charged yet &mdash; your free ${TRIAL_DAYS} days are still running.`
    : freeNote;

  if (s.visible) {
    return allDone
      ? `<strong>You're live.</strong> Clients matching your fit can now find you.${trialNote}`
      : `<strong>You're live</strong> &mdash; clients can find you.${trialNote}`;
  }

  /* Subscribed and invisible. Naming this is the point of the banner -- but
     "you're being billed" is a lie for the first 30 days, and it is the most
     alarming sentence on the page. Everyone activating now starts on the trial,
     so for most people it was alarming AND false.

     Name the ACTUAL blocker. This used to say "until your licence and identity
     are verified" whatever was wrong, so a therapist held back by an empty
     Specialties list was pointed at a queue they were not in. */
  const blocker = !s.complete
    ? `your profile is missing ${s.gaps.join(' and ')}`
    : 'your licence and identity are verified';
  const because = !s.complete
    ? `Clients can't see you while ${blocker}.`
    : `Clients can't see you until ${blocker}.`;

  /* "You're being billed" is only true of someone actually subscribed. With
     the paywall gone that is nobody at signup, so the alarming version now
     fires only for a therapist who renewed after their six months and is
     somehow still hidden. Everyone else is simply not finished yet, which is
     a smaller and more accurate thing to say. */
  if (s.trialing) {
    return `<strong>Your membership is active and nothing has been charged yet</strong> &mdash; you're in your free ${TRIAL_DAYS} days. ${because}`;
  }
  if (s.subscribed) {
    return `<strong>You're being billed but clients can't see you yet.</strong> ${because}`;
  }
  return `<strong>Almost there.</strong> ${because} Nothing to pay &mdash; Kindred is free for therapists until ${FREE_UNTIL_LABEL}.`;
}

function normalizeTherapist(t) {
  if (!t.media) t.media = {};
  if (!Array.isArray(t.media.photos)) t.media.photos = [t.media.office, t.media.outOfOffice].filter(Boolean).slice(0, 4);
  if (!t.topSpecialties || !t.topSpecialties.length) t.topSpecialties = (t.tags || []).slice(0, 3);
  if (t.selfPayNote === undefined) t.selfPayNote = '';
  if (t.acceptsSlidingScale === undefined) t.acceptsSlidingScale = /sliding/i.test(t.selfPayNote || '');
  if (t.offerWaitlist === undefined) t.offerWaitlist = !t.acceptingOngoing;
  if (!Array.isArray(t.waitlist)) t.waitlist = [];
  if (!Array.isArray(t.startedConversations)) t.startedConversations = [];
  if (!Array.isArray(t.licensedStates)) t.licensedStates = (t.location && t.location.state) ? [t.location.state] : [];
  if (t.onDemandRate == null) t.onDemandRate = t.rateMin;
  if (t.listed === undefined) t.listed = true;
  if (!Array.isArray(t.paymentOptions)) t.paymentOptions = [];
  if (t.licenseVerified === undefined) t.licenseVerified = false;   // never assume verified
  if (t.identityVerified === undefined) t.identityVerified = false;
  if (t.subscription === undefined) {
    // Derive from the live ladder rather than hard-coding. A literal here drifts
    // the moment the ladder rolls over, and omitting introMonths printed
    // "for your first undefined months" in Settings.
    const p = listingPricing();
    t.subscription = { plan: p.founding ? 'founding' : 'standard', founding: p.founding,
                       introRate: p.introRate, introMonths: p.introMonths, standardRate: p.standardRate };
  }
  /* The Ideal Client editor reads eight arrays with no guards --
     `t.idealClient.ageBands.includes(...)` and seven more. A therapist object
     carrying a partial (or absent) idealClient therefore did not degrade, it
     threw mid-render, and a thrown render leaves innerHTML unset: the profile
     tab went blank white. That is what "Fix my license" looked like from the
     outside -- the button worked, switched screens, and the destination
     crashed on arrival.
     Filling the shape here means no caller has to remember. */
  t.idealClient = Object.assign(emptyIdealClient(), t.idealClient || {});
  if (!t.stats) t.stats = { profileViews: 0, hearts: 0, top5: 0, conversationsStarted: 0, weekViews: 0, weekHearts: 0 };
  return t;
}
// Add or replace a therapist in the in-memory roster by id.
function upsertTherapistInMemory(t) {
  const i = THERAPISTS.findIndex(x => x.id === t.id);
  if (i === -1) THERAPISTS.push(t); else THERAPISTS[i] = t;
}

THERAPISTS.forEach(t => {
  const id = THERAPIST_IDENTITY[t.id] || {};
  t.ethnicity = id.ethnicity || '';
  t.affinities = id.affinities || [];
  t.faith = id.faith || [];
  t.availabilitySlots = THERAPIST_AVAILABILITY[t.id] || [];
  t.idealClient = Object.assign(emptyIdealClient(), THERAPIST_IDEAL[t.id] || {});
  // seed-specific overrides, then the shared normalizer fills the rest
  if (WAITLIST_SEED[t.id]) t.waitlist = WAITLIST_SEED[t.id].map(name => ({ name }));
  if (LICENSE_SEED[t.id]) t.licensedStates = LICENSE_SEED[t.id];
  normalizeTherapist(t);
});

let onDemandInfoShown = false;      // show the "what is On-Demand" popup once per session
let odNewSlotDay = null;            // day currently selected in the slot picker
const KINDRED_OD_FEE_PCT = 0.05;    // Kindred keeps 5% of each on-demand session
// Simulated Stripe processing fee (their standard 2.9% + $0.30), passed to the client.
function ondemandPricing(t) {
  const price = Number(t.onDemandRate) || Number(t.rateMin) || 0;
  const stripeFee = Math.round((price * 0.029 + 0.30) * 100) / 100;
  const kindredCut = Math.round(price * KINDRED_OD_FEE_PCT * 100) / 100;
  const clientTotal = Math.round((price + stripeFee) * 100) / 100;
  const therapistNet = Math.round((price - kindredCut) * 100) / 100;
  return { price, stripeFee, kindredCut, clientTotal, therapistNet };
}

let NEED_OPTIONS = ['Anxiety', 'Trauma', 'Couples', 'Grief', 'Life Transitions', 'Burnout', 'ADHD', 'Substance Use', 'Postpartum', 'Family Conflict'];
// The full specialty catalog behind "+ Other" — same no-free-text rule as
// languages: picking from a fixed list is what keeps client needs and
// therapist specialties matchable.
let OTHER_SPECIALTIES = [
  'Addiction', 'Adoption', 'Alcohol Use', 'Anger Management', 'Anorexia',
  'Antisocial Personality (ASPD)', 'ARFID', 'Autism', 'Behavioral Issues',
  'Binge Eating Disorder', 'Bipolar Disorder', 'Blended Family', 'Body Image',
  'Borderline Personality (BPD)', 'Bulimia', 'Cancer', 'Career Counseling',
  'Child Anxiety', 'Chronic Illness', 'Chronic Pain', 'Co-Parenting',
  'Codependency', 'Complex PTSD', 'Dementia', 'Depersonalization (DPDR)',
  'Depression', 'Dissociative Disorders (DID)', 'Divorce', 'Domestic Abuse',
  'Driving Anxiety', 'Drug Abuse', 'Dual Diagnosis', 'Eating Disorders',
  'Education and Learning Disabilities', 'Emotional Abuse', 'Emotional Regulation',
  'First Responders', 'Gambling', 'Geriatric', 'Health Anxiety', 'Hoarding',
  'Infertility', 'Infidelity', 'Intellectual Disability', 'Internet Addiction',
  'Life Coaching', 'Marriage Counseling', 'Medical Detox', 'Medical Trauma',
  'Medication Management', "Men's Issues", 'Menopause', 'Miscarriage',
  'Narcissistic Abuse', 'Narcissistic Personality (NPD)', 'Neurodivergence',
  'Obesity', 'Obsessive-Compulsive (OCD)', 'Oppositional Defiance (ODD)',
  'Parenting', 'Personality Disorders', 'Porn Addiction', 'Postpartum Depression',
  'Pregnancy, Prenatal, Postpartum', 'Premarital',
  'Premenstrual Dysphoric Disorder (PMDD)', 'Psychosis', 'Racial Identity',
  'Relationship Anxiety', 'Relationship Issues', 'Schizophrenia', 'Self Esteem',
  'Self-Harming', 'Sex Therapy', 'Sexual Abuse', 'Sexual Addiction',
  'Sleep or Insomnia', 'Social Anxiety', 'Spirituality', 'Sports Performance',
  'Stress', 'Suicidal Ideation', 'Testing and Evaluation', 'Trauma and PTSD',
  'Traumatic Brain Injury (TBI)', 'Veterans', 'Video Game Addiction',
  'Weight Loss', "Women's Issues"
];
let MODALITY_OPTIONS = ['CBT', 'EMDR', 'ACT', 'EFT', 'Motivational Interviewing'];
const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];

const MODALITY_INFO = {
  'CBT': "Cognitive Behavioral Therapy. Focuses on identifying and changing unhelpful thought patterns and behaviors — often structured, with exercises to practice between sessions.",
  'EMDR': "Eye Movement Desensitization and Reprocessing. A structured approach often used for trauma, using guided eye movements or other bilateral stimulation to help the brain reprocess difficult memories.",
  'ACT': "Acceptance and Commitment Therapy. Focuses on accepting difficult thoughts and feelings rather than fighting them, while committing to actions aligned with your values.",
  'EFT': "Emotionally Focused Therapy. Often used with couples and families — focused on identifying emotional patterns and building stronger, safer emotional bonds.",
  'Motivational Interviewing': "A collaborative conversational style that helps you explore and strengthen your own motivation for change — especially useful for ambivalence around habits or behaviors.",
  'ERP': "Exposure and Response Prevention. A structured approach for OCD and anxiety that gently, gradually reduces the power of intrusive thoughts and compulsions.",
  'Somatic': "Body-based therapy that works with physical sensations, not just talk — helpful when stress and trauma live in the body.",
  'IFS': "Internal Family Systems. Works with the different 'parts' of you (the critic, the protector, the wounded) to build inner harmony.",
  'DBT': "Dialectical Behavior Therapy. Teaches concrete skills for managing intense emotions, distress, and relationships.",
  'Couples Therapy': "Focused on the relationship itself — communication patterns, conflict, and connection between partners."
};
// Client "Types of Therapy" step — set up like languages: common ones as
// quick pills, everything else behind a "+ Other" dropdown. Single-select.
let MODALITY_QUICK = ['ERP', 'ACT', 'Motivational Interviewing', 'Somatic', 'EMDR', 'IFS', 'DBT', 'Couples Therapy'];
let OTHER_MODALITIES = [
  'Adlerian', 'AEDP', 'Applied Behavioral Analysis (ABA)', 'Art Therapy',
  'Attachment-based', 'Biofeedback', 'Brainspotting',
  'Clinical Supervision and Licensed Supervisors', 'Coaching',
  'Cognitive Behavioral (CBT)', 'Cognitive Processing (CPT)',
  'Compassion Focused', 'Culturally Sensitive', 'Dance Movement Therapy',
  'Eclectic', 'Emotionally Focused', 'Energy Psychology', 'Existential',
  'Experiential Therapy', 'Expressive Arts', 'Family Systems', 'Family Therapy',
  'Feminist', 'Forensic Psychology', 'Gestalt', 'Gottman Method', 'Humanistic',
  'Hypnotherapy', 'Imago', 'Integrative', 'Interpersonal', 'Intervention',
  'Jungian', 'Ketamine-Assisted', 'Mindfulness-Based (MBCT)', 'Multicultural',
  'Music Therapy', 'Narrative', 'Neuro-Linguistic (NLP)', 'Neurofeedback',
  'Parent-Child Interaction (PCIT)', 'Person-Centered', 'Play Therapy',
  'Positive Psychology', 'Prolonged Exposure Therapy', 'Psychoanalytic',
  'Psychobiological Approach Couple Therapy', 'Psychodynamic',
  'Rational Emotive Behavior (REBT)', 'Reality Therapy', 'Relational',
  'Sandplay', 'Schema Therapy', 'Solution Focused Brief (SFBT)',
  'Strength-Based', 'Structural Family Therapy', 'Transpersonal', 'Trauma Focused'
];

function openModalityInfo(name) {
  const desc = MODALITY_INFO[name];
  if (!desc) return;
  document.getElementById('modality-info-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>${name}</h2>
    <p class="modality-info-text">${desc}</p>
    <button class="primary-btn" style="margin-top:16px;background:var(--coral);color:white;" id="modality-info-close-btn">Got it</button>
  `;
  document.getElementById('modality-info-modal').classList.remove('hidden');
  document.getElementById('modality-info-close-btn').addEventListener('click', () => {
    document.getElementById('modality-info-modal').classList.add('hidden');
  });
}
document.getElementById('modality-info-modal').addEventListener('click', (e) => {
  if (e.target.id === 'modality-info-modal') document.getElementById('modality-info-modal').classList.add('hidden');
});
let INSURANCE_OPTIONS = ['Aetna', 'BCBS', 'Cigna', 'United', 'EAP'];
// Full carrier catalog behind "+ Other" — fixed list, same no-free-text
// rule as languages and specialties.
let OTHER_INSURANCES = [
  '1199SEIU', 'AARP', 'ACI Specialty Benefits', 'Aetna EAP', 'Aetna Medicare',
  'Aetna Student Health', 'All Savers', 'AllOne Health',
  "America's Choice Provider Network (ACPN)", 'AmeriHealth Caritas', 'Anthem',
  'Anthem EAP', 'APS Healthcare', 'Ascension SmartHealth',
  'BHS | Behavioral Health Systems', 'Blue Cross', 'Blue Shield',
  'BlueCross BlueShield', 'Carebridge EAP', 'CareConnect Health Plan',
  'Carelon Behavioral Health', 'CareOregon', 'CCN | Community Care Network',
  'Centivo', 'CHAMPVA', "Children's Health Insurance Program (CHIP)",
  'ChoiceCare Network', 'Cigna and Evernorth', 'Cigna EAP', 'Cigna Medicare',
  'Cofinity | First Health', 'Colorado Access', 'ComPsych', 'Concern',
  'Coventry', 'CuraLinc Healthcare', 'Curative', 'Dayforce',
  'Denver Health Medical Plan', 'ESI Employee Assistance Group',
  'Evernorth EAP', 'First Health', 'Friday Health Plans', 'Golden Rule',
  'Government Employees Health Association (GEHA)', 'Great-West Life',
  'Guardian', 'Health First Colorado', 'Health Net', 'Horizon Healthcare',
  'Humana', 'Humana Dual', 'Humana Medicare', 'Independence Administrators',
  'Kaiser Permanente (OON)', 'Lyra Health', 'Magellan', 'MagnaCare',
  'Managed Health Network (MHN)', 'Medicaid', 'Medicare',
  'MediNcrease Health Plans (MHP)', 'Meritain Health', 'Military OneSource',
  'MINES and Associates', 'Modern Health', 'Molina Healthcare', 'MotivHealth',
  'MultiPlan', 'MultiPlan Private Healthcare Systems (PHCS)', 'Mutual of Omaha',
  'New Directions | Lucet', 'Nippon Life Benefits', 'Northwell Direct',
  'Optum', 'Oscar Health', 'Oxford', 'Partners Direct Health',
  'Provider Network of America (PNOA)', 'PsychCare', 'Reliant',
  'Rocky Mountain Health Plans', 'Sagamore', 'Sana Benefits', 'SelectHealth',
  'Surest', 'TELUS Health', 'TRICARE', 'TriWest', 'Trustmark Benefits',
  'Ulliance', 'United Medical Resources (UMR)', 'UnitedHealthcare / Optum EAP',
  'UnitedHealthcare / Optum Medicaid', 'UnitedHealthcare / Optum Medicare',
  'UnitedHealthcare Student Resources', 'UnitedHealthcare UHC | UBH',
  'VA Community Care Network (CCN)', 'Velocity National Provider Network (VNPN)',
  'WellCare', 'Wellfleet', 'Wellpoint | Amerigroup', 'Workplace Options',
  'Zelis Healthcare'
];
const BUDGET_RANGES = [
  { label: 'Any budget', min: 0, max: Infinity },
  { label: 'Under $100', min: 0, max: 100 },
  { label: '$100–$150', min: 100, max: 150 },
  { label: '$150–$200', min: 150, max: 200 },
  { label: '$200+', min: 200, max: Infinity },
  { label: 'Sliding scale', slidingScale: true }
];
const CARE_FOR_OPTIONS = [
  { key: 'myself', label: 'Myself' },
  { key: 'child', label: 'A child' },
  { key: 'couples', label: 'Couples' },
  { key: 'family', label: 'Family' }
];
// When the client can usually meet — captured in intake, shown on the
// shared profile so a matched therapist can see if their open slots line up.
const AVAILABILITY_OPTIONS = ['Anytime', 'Early mornings', 'Lunch', 'Evenings', 'Weekends', 'Other'];

// ===== IDEAL-CLIENT VOCABULARY =====
// A therapist's "ideal client" is matched against what the client tells us about
// THEMSELVES, so both sides must pick from these exact lists — a mismatch here
// would silently break matching (same reason languages are a controlled list).
// These describe the client, not their preferences about a therapist.
// Life-stage bands the therapist picks in their ideal client. The CLIENT never
// sees these — they enter their exact age, and ageToBand() maps it to a band on
// the matching side. min/max inclusive.
const IDEAL_AGE_BANDS = [
  { label: 'Toddlers',  sub: '0–4',   min: 0,  max: 4   },
  { label: 'Children',  sub: '5–10',  min: 5,  max: 10  },
  { label: 'Preteen',   sub: '11–13', min: 11, max: 13  },
  { label: 'Teens',     sub: '14–17', min: 14, max: 17  },
  { label: 'Adults',    sub: '18–64', min: 18, max: 64  },
  { label: 'Seniors',   sub: '65+',   min: 65, max: 200 }
];
function ageToBand(age) {
  const n = parseInt(age, 10);
  if (isNaN(n)) return null;
  const b = IDEAL_AGE_BANDS.find(x => n >= x.min && n <= x.max);
  return b ? b.label : null;
}

let CLIENT_GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Transgender', 'Prefer not to say'];
// Ideal-client gender: no "prefer not to say" — you can't target the absence of an answer.
const IDEAL_GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Transgender'];

// A therapist's OWN gender identity. Trans identities are named rather than
// folded into "Female"/"Male": a therapist who is a trans woman and wants that
// visible had no way to say it, and a client looking for exactly that had no
// way to find it. "Prefer not to answer" exists because a therapist is entitled
// to not publish this; it costs them gender-filtered matches, nothing else.
const GENDER_IDENTITY_OPTIONS = [
  { value: 'woman',       label: 'Woman' },
  { value: 'man',         label: 'Man' },
  { value: 'trans-woman', label: 'Transgender Woman' },
  { value: 'trans-man',   label: 'Transgender Man' },
  { value: 'nonbinary',   label: 'Non-binary / Genderqueer / Genderfluid' },
  { value: 'prefer-not',  label: 'Prefer not to answer' }
];

// Clients state a preference in three buckets — female / male / nonbinary —
// and that is the vocabulary the intake, the saved filters and every stored
// row already speak. A trans woman IS a woman, so she belongs in the same
// bucket as one; comparing the raw value would have quietly hidden her from
// every client who asked for a woman, which is the exact failure this whole
// change exists to avoid. Legacy rows stored 'female'/'male' and map to
// themselves, so nothing saved before today shifts bucket.
// The saved value, expressed in today's vocabulary — so a therapist who picked
// "Female" before this existed opens their profile and finds "Woman" already
// ticked instead of a blank answer they'd have to give again.
function normalizeGender(v) {
  return v === 'female' ? 'woman'
       : v === 'male'   ? 'man'
       : v === 'non-binary' ? 'nonbinary'
       : (v || '');
}

function genderBucket(v) {
  switch (v) {
    case 'woman': case 'trans-woman': case 'female':  return 'female';
    case 'man':   case 'trans-man':   case 'male':    return 'male';
    case 'nonbinary': case 'non-binary':              return 'nonbinary';
    default: return null;   // 'prefer-not', blank, unknown — matches no preference
  }
}

// Field of work: common pills, then "Other" opens the fuller list + free text.
const FIELD_PRIMARY = ['First responder', 'Healthcare', 'Military & Veteran', 'Education', 'Entrepreneur', 'Full-time parent'];
let FIELD_MORE = ['Tech', 'Finance & Legal', 'Legal', 'Service industry', 'Retail', 'Hospitality',
  'Student', 'Creative', 'Skilled trades', 'Government', 'Nonprofit', 'Sales', 'Agriculture',
  'Transportation', 'Manufacturing', 'Small business owner', 'Remote / gig work', 'Between jobs', 'Retired'];
// What a therapist will accept as payment. 'Either' = no constraint.
const PAYMENT_TYPE_OPTIONS = ['Insurance', 'Cash pay', 'Either'];
// The ideal-fit dimensions a therapist can mark as a "must have" (max 3).
// Must-haves are WEIGHTED HEAVIER — they are never a filter.
const IDEAL_DIMENSIONS = [
  { key: 'ageBands', label: 'Age' },
  { key: 'genders', label: 'Gender' },
  { key: 'fields', label: 'Field of work' },
  { key: 'needs', label: 'What they want to work on' },
  { key: 'modalities', label: 'Modality' }
];
const MAX_MUST_HAVES = 3;
// A client is an "ideal match" when they clear the therapist's practical
// constraints AND score at or above this on the ideal-fit dimensions.
const IDEAL_MATCH_THRESHOLD = 0.8;

// A blank ideal-client spec — every therapist gets one; empty means "no ideal
// stated", which simply means nobody is ever flagged ideal for them.
function emptyIdealClient() {
  return { ageBands: [], genders: [], fields: [], needs: [], modalities: [],
    payment: 'Either', availability: [], mustHaves: [] };
}
// Identity-affinity options (from the client's requested filters). These are
// SOFT preferences — they surface as match reasons when they line up, but
// never hard-filter the pool empty. "Open to all" is the default for
// ethnicity; gender/sexuality and faith are optional multi-selects.
const ETHNICITY_OPTIONS = ['Arab and Middle Eastern', 'Asian', 'Black and African American', 'Hispanic and Latino', 'Multiracial', 'Native American', 'Pacific Islander', 'South Asian', 'White'];
/* Listing only minority identities quietly implies the others are the unmarked
   default, and leaves a straight or cisgender client with nothing to pick when
   it genuinely matters to them. */
const GENDER_SEXUALITY_OPTIONS = ['Bisexual', 'Cisgender', 'Gay', 'Lesbian', 'LGBTQ+', 'Polyamory & ENM', 'Sex-Positive & Kink-Friendly', 'Straight', 'Transgender'];
const FAITH_OPTIONS = ['Atheist, Agnostic or Non-Religious', 'Buddhist', 'Christian', 'Hindu', 'Jewish', 'Muslim', 'Secular and Non-Religious', 'Sikh', 'Spiritual', 'The Church of Jesus Christ of Latter-day Saints'];
// Three quick-tap chips cover the most common cases. "Other" opens a real
// dropdown pulled from OTHER_LANGUAGES instead of free text, so language
// names stay consistent between what a therapist selects and what a client
// filters by — a typo in either place would silently break matching.
let LANGUAGE_QUICK_OPTIONS = ['English', 'Spanish', 'Mandarin'];
let OTHER_LANGUAGES = ['American Sign Language', 'Arabic', 'Bengali', 'Burmese', 'Cantonese', 'Czech', 'Dutch', 'French', 'German', 'Greek', 'Haitian Creole', 'Hausa', 'Hebrew', 'Hindi', 'Hmong', 'Hungarian', 'Igbo', 'Indonesian', 'Italian', 'Japanese', 'Khmer', 'Korean', 'Lao', 'Nepali', 'Persian (Farsi)', 'Polish', 'Portuguese', 'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Sinhala', 'Somali', 'Swahili', 'Swedish', 'Tagalog', 'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Vietnamese', 'Yoruba'];

function languageChipsHtml(languagesArr, showOther, idPrefix) {
  const custom = languagesArr.filter(l => !LANGUAGE_QUICK_OPTIONS.includes(l));
  let html = `<div class="chip-grid" id="${idPrefix}-languages-grid">`;
  html += LANGUAGE_QUICK_OPTIONS.map(l => `<div class="chip-option ${languagesArr.includes(l) ? 'selected' : ''}" data-language="${l}">${l}</div>`).join('');
  html += custom.map(l => `<div class="chip-option selected" data-remove-custom-language="${l}">${l} ✕</div>`).join('');
  html += `<div class="chip-option" id="${idPrefix}-other-btn">+ Other</div>`;
  html += `</div>`;
  if (showOther) {
    const available = OTHER_LANGUAGES.filter(l => !languagesArr.includes(l));
    html += `<div class="other-language-row">
      <select id="${idPrefix}-other-select">${available.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
      <button id="${idPrefix}-other-add-btn">Add</button>
    </div>`;
  }
  return html;
}

// Same underlying tags as NEED_OPTIONS, just phrased as lived experience
// instead of clinical categories — for clients who don't have a name for
// what's going on yet. Selections still write into intake.needs directly,
// so nothing downstream (matching, therapist tags) has to know which path
// a client took.
// Veteran path only — what a returning client wants different this time.
let PREV_EXPERIENCE_OPTIONS = [
  'More direct feedback', 'More structure and homework', 'Less structure, more space to talk',
  'Someone who challenges me', 'Someone gentler', 'A different approach entirely',
  'Someone who shares my identity', 'Better at handling trauma', 'Nothing — it worked, I moved'
];

// The "new to me" quiz: plain-language statements grouped by theme. Each maps to
// a matchable specialty tag. Picking a few builds a live "here's what this might
// be about" read — turning felt experience into potential focus areas.
const UNSURE_OPTIONS = [
  // Mood & energy
  { group: 'Mood & energy', label: "I feel flat or heavy — things I used to enjoy don't land anymore", tag: 'Depression' },
  { group: 'Mood & energy', label: "I'm running on empty, exhausted no matter how much I rest", tag: 'Burnout' },
  { group: 'Mood & energy', label: "I'm harder on myself than I'd ever be on anyone else", tag: 'Self Esteem' },
  { group: 'Mood & energy', label: "My emotions swing fast and feel hard to steer", tag: 'Emotional Regulation' },
  // Worry & stress
  { group: 'Worry & stress', label: "My mind won't stop racing, or I feel on edge a lot", tag: 'Anxiety' },
  { group: 'Worry & stress', label: "Being around people makes me anxious — I overthink every interaction", tag: 'Social Anxiety' },
  { group: 'Worry & stress', label: "The pressure I'm under feels like more than I can carry", tag: 'Stress' },
  { group: 'Worry & stress', label: "Something happened and I can't shake it", tag: 'Trauma' },
  // Relationships
  { group: 'Relationships', label: 'Things feel tense or distant with my partner', tag: 'Couples' },
  { group: 'Relationships', label: 'Things are tense or painful with my family', tag: 'Family Conflict' },
  { group: 'Relationships', label: "I lose myself in relationships, or I can't say no", tag: 'Codependency' },
  // Focus, habits & self
  { group: 'Focus, habits & self', label: 'I have trouble focusing or finishing what I start', tag: 'ADHD' },
  { group: 'Focus, habits & self', label: 'My drinking or drug use has been on my mind', tag: 'Substance Use' },
  { group: 'Focus, habits & self', label: "I can't sleep, or sleep never leaves me rested", tag: 'Sleep or Insomnia' },
  { group: 'Focus, habits & self', label: 'My anger gets bigger than the moment calls for', tag: 'Anger Management' },
  // Big life stuff
  { group: 'Big life stuff', label: "Everything in my life feels like it's changing at once", tag: 'Life Transitions' },
  { group: 'Big life stuff', label: "I lost someone or something and it's been hard to move through", tag: 'Grief' },
  { group: 'Big life stuff', label: "I'm unsure where my career or sense of purpose is headed", tag: 'Career Counseling' },
  { group: 'Big life stuff', label: 'Things have felt different since having a baby', tag: 'Postpartum' }
];

// Plain-language read for each tag — what the quiz reflects back to the client.
const CONDITION_PLAIN = {
  'Anxiety': "that racing-mind, on-edge, bracing-for-the-worst feeling",
  'Social Anxiety': "dread and self-consciousness around other people",
  'Depression': "low, flat, or heavy — joy and motivation gone quiet",
  'Burnout': "depleted past the point that rest seems to fix",
  'Self Esteem': "a harsh inner critic and a shaky sense of worth",
  'Emotional Regulation': "big feelings that are hard to slow down or steer",
  'Stress': "carrying more pressure than feels sustainable",
  'Trauma': "a past event that still intrudes on the present",
  'Couples': "strain, distance, or conflict with a partner",
  'Family Conflict': "tension or hurt in family relationships",
  'Codependency': "losing yourself in other people's needs",
  'ADHD': "trouble with focus, follow-through, and overwhelm",
  'Substance Use': "a relationship with alcohol or drugs worth a closer look",
  'Sleep or Insomnia': "sleep that won't come, or won't leave you rested",
  'Anger Management': "anger that runs hotter than the moment calls for",
  'Life Transitions': "a season of change reshaping who you are",
  'Grief': "moving through a meaningful loss",
  'Career Counseling': "uncertainty about work, direction, or purpose",
  'Postpartum': "the identity and mood shifts that can follow a baby"
};

let intake = {
  knowsNeeds: null, // 'no' = new to therapy (symptom-led) | 'yes' = experienced (knows what they want)
  prevExperience: [],    // veteran path: what they'd change about previous therapy
  prevNotes: '',         // veteran path: free text for their next therapist
  careFor: null,         // 'myself' | 'child' | 'couples' | 'family'
  childAge: '',          // shown only when careFor === 'child'
  needs: [],
  quizStage: 0,          // "new to me" path walks one theme group at a time, then a read
  notSure: false,        // "I'm not sure" on the needs step — valid answer, adds no tag filter
  needsOtherOpen: false, // transient UI flag for the "+ Other" specialty panel
  modality: 'open', modalityRequired: false, modalityOtherOpen: false,
  stylePref: null,       // guidance style — optional, no default selection
  genderPref: 'no-preference', genderRequired: false,
  ethnicityPref: 'no-preference', // soft single-select
  lgbtqRequired: false,
  affinities: [],        // gender/sexuality affinity tags — soft multi-select ("anything else")
  faith: [],             // faith backgrounds — soft multi-select ("anything else")
  languagePref: 'any', languageRequired: false, languageOtherOpen: false,
  formats: [],            // desired session formats — multi-select; [] = either works
  availability: [],      // when the client can usually meet — multi-select
  mustBeAccepting: false,// only surface therapists open to new clients right now
  // About the client THEMSELVES (not preferences about a therapist). Used only
  // to see whether they line up with a therapist's private ideal-client spec.
  // All optional — skipping simply means those dimensions never count.
  age: '',               // the client's EXACT age; ageToBand() maps it for matching
  selfGender: null,      // one of CLIENT_GENDER_OPTIONS — the client's own gender
  field: null,           // FIELD_PRIMARY / FIELD_MORE, or a typed-in value
  fieldOtherOpen: false,
  city: '', state: '',
  insurance: 'any',
  hasInsurance: null,        // 'yes' | 'no' — gate question before any carrier picking
  insuranceOtherOpen: false, // transient UI flag for the "+ Other" carrier dropdown
  noInsurancePref: null,     // 'sliding-scale' | 'therapist-first' when hasInsurance === 'no'
  budgetRange: 'Any budget', // label into BUDGET_RANGES — a range, not a max
  completed: false
};

let deck = [];
let deckIndex = 0;
let shortlist = [];       // therapists swiped right on but not yet requested
let savedResources = [];  // resource ids the client saved from Explore — part of the shareable profile
let crisisAcknowledged = false; // per-session: client confirmed On-Demand isn't being used for a crisis

const EXPLORE_RESOURCES = [
  { id: 'r1', icon: '🌱', title: 'What to expect in your first session', blurb: 'A gentle walkthrough so the first hour feels less like a mystery.' },
  { id: 'r2', icon: '🫁', title: 'Grounding: the 5-4-3-2-1 exercise', blurb: 'A quick sensory reset for anxious moments, anywhere.' },
  { id: 'r3', icon: '📓', title: 'Journaling prompts for hard weeks', blurb: 'Five prompts for when you can’t find the words on your own.' },
  { id: 'r4', icon: '🌙', title: 'Winding down: sleep and stress', blurb: 'Why racing thoughts get louder at night, and what helps.' },
  { id: 'r5', icon: '🗣️', title: 'How to talk about therapy with family', blurb: 'Scripts for the "so why do you need a therapist?" conversation.' }
];
const MAX_PENDING_REQUESTS = 5; // 5 real shots: pending + matched count, only a decline frees a slot
let matches = [];         // {therapist, status: 'matched' | 'pending' | 'declined' | 'ondemand'}
const chatLog = {};       // therapistId -> [{from: 'me'|'them', text}] — 'me' is always the client, 'them' is always the therapist
let chatRole = 'client';  // which side of the chat screen we're currently rendering as
let chatReturnScreen = 'matches';

// ===================================================================
// CLIENT STATE — saved to THIS DEVICE only.
// A client spends real effort on intake, shortlisting, and reaching out; losing
// all of it on a refresh is unacceptable. This keeps it on their own device.
//
// HIPAA: writing to the client's own localStorage is NOT server-side PHI — it's
// the same category as any app remembering your preferences locally. Nothing
// here leaves the device. Server-side persistence stays behind
// clientDataPersistence (see clientStore) until the BAA is signed.
//
// Therapists are stored as SNAPSHOTS keyed by id, so a shortlist survives even
// when the live roster changes; on load we prefer the fresh copy if we have one.
// ===================================================================
const CLIENT_STATE_KEY = 'kindred-client';
const CLIENT_STATE_VERSION = 1;

// Something worth restoring? Anything answered counts -- we do not want to
// resurrect an untouched questionnaire on someone who only glanced at it.
function intakeStarted() {
  return !!(intake.careFor || intake.knows || (intake.needs && intake.needs.length)
            || intake.state || intake.field || intake.age);
}

function saveClientState() {
  try {
    /* Partial answers are worth keeping too. This used to bail unless the
       questionnaire was finished, so someone six questions in who got
       interrupted lost the lot and started over -- the most annoying possible
       moment to lose it. All local, so nothing here waits on the BAA. */
    if (!intake.completed && !intakeStarted()) return;
    const referenced = {};
    const remember = t => { if (t && t.id) referenced[t.id] = t; };
    shortlist.forEach(remember);
    matches.forEach(m => remember(m.therapist));

    localStorage.setItem(CLIENT_STATE_KEY, JSON.stringify({
      v: CLIENT_STATE_VERSION,
      intake,
      intakeStep,               // resume where they stopped
      savedResources,
      crisisAcknowledged,
      clientAgreedToOnDemandPolicy,
      shortlistIds: shortlist.map(t => t.id),
      matches: matches.map(m => {
        const { therapist, ...rest } = m;
        return { ...rest, therapistId: therapist ? therapist.id : null };
      }),
      therapists: referenced,
      chatLog
    }));
  } catch (e) {
    // Private browsing or a full quota — never let saving break the app.
    console.warn('client state not saved:', e.message);
  }
}

function loadClientState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(CLIENT_STATE_KEY) || 'null'); } catch (e) { return false; }
  if (!saved || saved.v !== CLIENT_STATE_VERSION || !saved.intake) return false;

  Object.assign(intake, saved.intake);
  // Where they stopped, so an interrupted questionnaire resumes rather than
  // restarting. Clamped: activeSteps() can shrink if an earlier answer
  // changed which steps apply.
  if (typeof saved.intakeStep === 'number') {
    intakeStep = Math.max(0, Math.min(saved.intakeStep, activeSteps().length - 1));
  }
  savedResources = Array.isArray(saved.savedResources) ? saved.savedResources : [];
  crisisAcknowledged = !!saved.crisisAcknowledged;
  clientAgreedToOnDemandPolicy = !!saved.clientAgreedToOnDemandPolicy;

  // Prefer a live therapist object when we have one (fresher rates, availability);
  // otherwise fall back to the snapshot we stored.
  const snaps = saved.therapists || {};
  const resolve = id => THERAPISTS.find(t => t.id === id) || (snaps[id] ? normalizeTherapist(snaps[id]) : null);

  shortlist = (saved.shortlistIds || []).map(resolve).filter(Boolean);
  matches.length = 0;
  (saved.matches || []).forEach(m => {
    const t = resolve(m.therapistId);
    if (t) matches.push({ ...m, therapist: t });
  });
  Object.keys(chatLog).forEach(k => delete chatLog[k]);
  Object.assign(chatLog, saved.chatLog || {});
  return true;
}

// Belt and braces: a match without a therapist would crash every list that
// renders one. Corrupted or partially-written storage should degrade quietly,
// never white-screen the app.
function pruneOrphanMatches() {
  for (let i = matches.length - 1; i >= 0; i--) {
    if (!matches[i] || !matches[i].therapist || !matches[i].therapist.id) matches.splice(i, 1);
  }
  shortlist = shortlist.filter(t => t && t.id);
}

function clearClientState() {
  try { localStorage.removeItem(CLIENT_STATE_KEY); } catch (e) {}
}

// Catch-all saves. beforeunload is unreliable on mobile/PWA, so pagehide and
// visibilitychange do the real work there.
window.addEventListener('pagehide', saveClientState);
window.addEventListener('beforeunload', saveClientState);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveClientState(); });

const cardStack = document.getElementById('card-stack');
const navBadge = document.getElementById('nav-badge');

// ===================================================================
// COMPATIBILITY LOGIC
// ===================================================================
// Sliding scale is a first-class flag now, but older/seeded profiles may only
// mention it in their free-text self-pay note — honor both.
function hasSlidingScale(t) {
  return !!t.acceptsSlidingScale || /sliding/i.test(t.selfPayNote || '');
}
function isCompatible(t, mode) {
  /* A profile only reaches clients once it is ENTITLED (inside the six free
     months, or subscribed) and license-verified — both are the floor, not
     ranking signals. This used to read `t.listed === false`, i.e. "has not
     paid", which is no longer a thing anyone does to sign up. */
  if (!listingState(t).paying) return false;
  if (!t.licenseVerified) return false;
  // Not-accepting therapists still show (with a "save for later" banner) unless
  // the client asked to see only those open to new clients right now.
  if (mode === 'ongoing' && !t.acceptingOngoing && intake.mustBeAccepting) return false;
  if (mode === 'ondemand' && (!t.onDemand || t.onDemandBanned || t.onDemandSlots.length === 0)) return false;

  // Generalists don't need a literal tag overlap — that's the whole point
  // of being a generalist. Specialists still have to actually match.
  if (intake.needs.length > 0 && t.practiceType !== 'generalist' && !t.tags.some(tag => intake.needs.includes(tag))) return false;

  if (intake.modality !== 'open' && intake.modalityRequired && !t.modalities.includes(intake.modality)) return false;

  if (intake.genderPref !== 'no-preference' && intake.genderRequired && genderBucket(t.identity.gender) !== intake.genderPref) return false;

  if (intake.lgbtqRequired && !t.identity.lgbtqAffirming) return false;

  if (intake.languagePref !== 'any' && intake.languageRequired && !t.languages.includes(intake.languagePref)) return false;

  // Format is multi-select: no pick = either works; otherwise the therapist has
  // to offer at least one of the formats the client is open to.
  if (intake.formats.length && !intake.formats.some(f => t.formats.includes(f))) return false;

  // State always matters — even online, a therapist has to be licensed
  // where the client lives. Multi-state therapists match on any verified state.
  // City only matters when they want IN-PERSON ONLY (open to online too = flexible).
  const licensed = (t.licensedStates && t.licensedStates.length) ? t.licensedStates : (t.location.state ? [t.location.state] : []);
  if (intake.state && !licensed.includes(intake.state)) return false;
  const inPersonOnly = intake.formats.length === 1 && intake.formats[0] === 'in-person';
  if (inPersonOnly && intake.city.trim() && t.location.city.trim().toLowerCase() !== intake.city.trim().toLowerCase()) return false;

  if (intake.hasInsurance === 'yes' && intake.insurance !== 'any' && !t.insuranceList.includes(intake.insurance)) return false;

  // No insurance + needs a sliding scale = only show therapists who offer one.
  // "The therapist is more important" deliberately adds no payment filter.
  if (intake.hasInsurance === 'no' && intake.noInsurancePref === 'sliding-scale' && !hasSlidingScale(t)) return false;

  const range = BUDGET_RANGES.find(r => r.label === intake.budgetRange);
  if (range && range.slidingScale && !hasSlidingScale(t)) return false;
  if (range && !range.slidingScale && range.max != null && t.rateMin > range.max) return false;

  return true;
}

// Which therapist style aligns with each guidance preference. empathy leans
// gentle, challenge leans direct — so the soft "similar style" reason still
// fires with the four new options.
const STYLE_ALIGN = { gentle: 'gentle', empathy: 'gentle', direct: 'direct', challenge: 'direct' };

/* "A mix of both" answers either request. A balanced therapist was matching
   NOBODY on style: the comparison is an equality, and 'balanced' never equals
   'gentle' or 'direct', so the one answer that means "I can do either" earned
   the bonus for neither. Style is a scoring signal rather than a filter, so it
   was costing them rank rather than hiding them — invisible, and exactly the
   wrong way round.

   Credited, but below an exact match. A therapist who says they are
   specifically direct is a better answer for someone asking for direct than
   one who does both — and if 'balanced' scored full marks it would be the
   strictly dominant answer, which turns an honest question into a box
   everybody ticks. */
function styleFit(therapistStyle, wanted) {
  if (!wanted) return 0;
  if (therapistStyle === wanted)    return 1;      // exactly what they asked for
  if (therapistStyle === 'balanced') return 0.6;   // works either way
  return 0;
}

function getMatchReasons(t) {
  const reasons = [];
  const overlap = t.tags.filter(tag => intake.needs.includes(tag));
  overlap.forEach(tag => reasons.push(tag));
  if (overlap.length === 0 && intake.needs.length > 0 && t.practiceType === 'generalist') {
    reasons.push('Works with a broad range of concerns');
  }
  if (intake.modality !== 'open' && t.modalities.includes(intake.modality)) reasons.push(intake.modality);
  if (intake.formats.length && intake.formats.some(f => t.formats.includes(f))) {
    if (intake.formats.includes('video') && t.formats.includes('video')) reasons.push('Online sessions');
    else if (intake.formats.includes('in-person') && t.formats.includes('in-person')) reasons.push('In-person sessions');
  }
  const wantsInPerson = intake.formats.includes('in-person');
  if (wantsInPerson && intake.city.trim() && t.location.city.trim().toLowerCase() === intake.city.trim().toLowerCase()) {
    reasons.push(`Located in ${t.location.city}, ${t.location.state}`);
  } else if (intake.state && t.location.state === intake.state) {
    reasons.push(`Licensed in ${intake.state}`);
  }
  if (intake.hasInsurance === 'yes' && intake.insurance !== 'any' && t.insuranceList.includes(intake.insurance)) reasons.push(`Accepts ${intake.insurance}`);
  if (intake.hasInsurance === 'no' && intake.noInsurancePref === 'sliding-scale' && hasSlidingScale(t)) reasons.push('Sliding scale available');
  if (intake.lgbtqRequired && t.identity.lgbtqAffirming) reasons.push('LGBTQ+ Affirming');
  if (intake.genderPref !== 'no-preference' && genderBucket(t.identity.gender) === intake.genderPref) {
    reasons.push({ female: 'Female therapist', male: 'Male therapist', nonbinary: 'Nonbinary therapist' }[intake.genderPref] || 'Preferred gender');
  }
  if (intake.languagePref !== 'any' && t.languages.includes(intake.languagePref)) reasons.push(`Speaks ${intake.languagePref}`);
  const styleWanted = intake.stylePref ? STYLE_ALIGN[intake.stylePref] : null;
  if (styleWanted && t.style === styleWanted) reasons.push('Similar style to what you want');
  else if (styleWanted && t.style === 'balanced') reasons.push('Adapts to how you want to work');
  if (prevExperienceScore(t) >= 0.5) reasons.push('Matches what you wanted different this time');
  if (intake.ethnicityPref !== 'no-preference' && t.ethnicity === intake.ethnicityPref) reasons.push(`${t.ethnicity} therapist`);
  // Soft identity affinities — surface shared ground, don't hard-filter.
  intake.affinities.filter(a => (t.affinities || []).includes(a)).forEach(a => reasons.push(`Affirming: ${a}`));
  intake.faith.filter(f => (t.faith || []).includes(f)).forEach(f => reasons.push(f));
  if ((intake.careFor === 'couples' && t.tags.includes('Couples')) || (intake.careFor === 'family' && t.tags.includes('Family Conflict'))) {
    reasons.push(intake.careFor === 'couples' ? 'Works with couples' : 'Works with families');
  }
  return reasons;
}

// ===================================================================
// LIVE DATABASE (config-gated)
// The app runs in demo mode (seeded roster, everything client-side) until a
// Supabase config exists. Set KINDRED_DB at launch — or paste the same object
// into localStorage 'kindred-db' to test against a project without a deploy.
// Reads only: match + search RPCs, both anon-safe. Therapist WRITES wait for
// real auth (Supabase Auth), so nobody can edit a profile they don't own.
// HIPAA note: nothing client-side is persisted by these calls — intake answers
// ride as unstored query parameters. Client ACCOUNTS/messaging must not be
// built until the project has a signed BAA (see supabase/README.md).
// ===================================================================
const KINDRED_DB = {
  url: 'https://izukppxgoerqtustfbnk.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk'
};

function dbConfig() {
  if (KINDRED_DB && KINDRED_DB.url && KINDRED_DB.key) return KINDRED_DB;
  try { return JSON.parse(localStorage.getItem('kindred-db') || 'null'); } catch (e) { return null; }
}
function dbReady() { const c = dbConfig(); return !!(c && c.url && c.key); }

async function dbRpc(name, params) {
  const c = dbConfig();
  const res = await fetch(`${c.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': c.key, 'Authorization': `Bearer ${c.key}` },
    body: JSON.stringify(params || {})
  });
  if (!res.ok) throw new Error(`rpc ${name}: HTTP ${res.status}`);
  return res.json();
}

// ===================================================================
// SUPABASE AUTH — real THERAPIST accounts (business data, HIPAA-safe).
// Clients stay demo-side (no server-persisted PHI) until the BAA. Uses the
// GoTrue + PostgREST endpoints directly, same raw-fetch style as dbRpc — no
// SDK/CDN dependency. One account works on the app AND the website (both point
// at this same project). RLS makes a therapist's JWT the only thing that can
// read/write their own row.
// ===================================================================
const KINDRED_AUTH = {
  url: 'https://izukppxgoerqtustfbnk.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk'
};
function authReady() { return !!(KINDRED_AUTH && KINDRED_AUTH.url && KINDRED_AUTH.key); }
const AUTH_SESSION_KEY = 'kindred-session';
function loadAuthSession() { try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch (e) { return null; } }
function saveAuthSession(d) {
  if (!d || !d.access_token) return null;
  const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + ((d.expires_in || 3600) * 1000), user: d.user };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s));
  return s;
}
function clearAuthSession() { localStorage.removeItem(AUTH_SESSION_KEY); }

async function authRequest(path, body) {
  const res = await fetch(`${KINDRED_AUTH.url}/auth/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': KINDRED_AUTH.key },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `auth error ${res.status}`);
  return data;
}
async function authSignUp(email, password) {
  const data = await authRequest('/signup', { email, password });
  const session = saveAuthSession(data);        // null when email confirmation is required
  const user = data.user || (data.id ? data : (session && session.user)) || null;
  return { user, session, needsConfirmation: !session };
}
async function authSignIn(email, password) {
  const data = await authRequest('/token?grant_type=password', { email, password });
  return { user: data.user, session: saveAuthSession(data) };
}
async function authSignOut() {
  const s = loadAuthSession();
  if (s && s.access_token) {
    try { await fetch(`${KINDRED_AUTH.url}/auth/v1/logout`, { method: 'POST', headers: { 'apikey': KINDRED_AUTH.key, 'Authorization': `Bearer ${s.access_token}` } }); } catch (e) {}
  }
  clearAuthSession();
}
  /* Supabase access tokens last an hour. Nothing ever used the refresh_token we
     were already storing, so a therapist was signed out hourly -- and since the
     session was never restored at page load either, every refresh sent them back
     to the login screen with valid credentials sitting in storage.
     Refresh tokens rotate, so the stored one is replaced each time. */
  let refreshInFlight = null;
  async function refreshAuthSession() {
    const s = loadAuthSession();
    if (!s || !s.refresh_token) return null;
    if (refreshInFlight) return refreshInFlight;      // never refresh twice at once
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${KINDRED_AUTH.url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': KINDRED_AUTH.key },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (!res.ok) { clearAuthSession(); return null; }   // revoked/expired: sign out cleanly
        return saveAuthSession(await res.json());
      } catch (e) {
        return s;      // offline: keep what we have rather than logging them out
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }
  // The session, refreshed if it is within two minutes of expiring.
  async function ensureFreshSession() {
    const s = loadAuthSession();
    if (!s) return null;
    if (s.expires_at && Date.now() > s.expires_at - 120000) return await refreshAuthSession();
    return s;
  }

// Authenticated PostgREST call — the therapist's own JWT, so RLS lets them
// touch only their own row.
async function authRest(path, opts = {}) {
  const s = await ensureFreshSession();
  if (!s) throw new Error('Not signed in.');
  return fetch(`${KINDRED_AUTH.url}/rest/v1${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'apikey': KINDRED_AUTH.key, 'Authorization': `Bearer ${s.access_token}`, ...(opts.headers || {}) }
  });
}

// in-memory therapist -> DB columns (mirror of dbRowToTherapist)
function therapistToDbRow(t, userId) {
  return {
    user_id: userId,
    name: t.name, credentials: t.credentials || [], pronouns: t.pronouns || '', show_pronouns: !!t.showPronouns,
    // license_verified is deliberately NOT sent: it is admin-only, and the DB
    // trigger reverts it on any non-service-role write.
    /* license_states is DERIVED from verified licences by a DB trigger, and
       license_number is superseded by the per-state therapist_licenses table.
       Sending either is ignored at best and misleading at worst. */
    payment_options: t.paymentOptions || [],
    website: t.website || '', photo: t.photo || null,
    specialties: t.tags || [], modalities: t.modalities || [], style: t.style || null, practice_type: t.practiceType || 'specialist',
    best_for: t.bestFor || '', persona: t.persona || {}, media: t.media || {}, optional_prompts: t.optionalPrompts || [],
    /* The ordered feed. Was built in memory and never sent, so every photo a
       therapist added and every drag they made lived only until the tab
       closed. Order is the point -- a bare photo list would lose it. */
    blocks: Array.isArray(t.blocks) ? t.blocks : [],
    formats: t.formats || [], insurance: t.insuranceList || [], languages: t.languages || [], rate_min: t.rateMin || 0,
    location: t.location || {}, gender: t.identity ? t.identity.gender : null, lgbtq_affirming: t.identity ? !!t.identity.lgbtqAffirming : false,
    ethnicity: t.ethnicity || '', affinities: t.affinities || [], faith: t.faith || [], ideal_client: t.idealClient || {},
    accepting: !!t.acceptingOngoing,
    marketing_opt_in: !!t.marketingOptIn
    /* `published` is deliberately NOT sent. Billing owns it: the Stripe webhook
       sets it on payment and clears it on cancellation or a failed charge.
       The flow is landing -> payment -> profile, so the profile is always saved
       AFTER the webhook has published the row -- and this payload used to
       include published:false from a fresh signup draft, silently un-paying a
       therapist the moment they finished building their profile, then asking
       them to pay again.
       PostgREST's merge-duplicates upsert only updates the columns present
       here, so omitting it preserves whatever billing last set. */
  };
}
/* Every edit in the profile editor mutated the in-memory therapist and
   re-rendered -- and nothing ever wrote it to the database. There is no Save
   button either, so a therapist filling in their whole profile lost all of it
   on reload, silently. Debounced autosave: the upsert is idempotent, so an
   extra write costs nothing and a missed one costs their work. */
let profileSaveTimer = null;
let profileSaveState = 'idle';   // 'idle' | 'saving' | 'saved' | 'error'
function persistProfileSoon(t) {
  if (!t || !authReady() || !loadAuthSession()) return;   // demo mode: nowhere to save
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    profileSaveState = 'saving'; paintSaveState();
    try {
      await saveTherapistProfile(t);
      profileSaveState = 'saved';
    } catch (e) {
      console.warn('profile save failed:', e.message);
      profileSaveState = 'error';
    }
    paintSaveState();
  }, 1000);
}
function paintSaveState() {
  const el = document.getElementById('t-save-state');
  if (!el) return;
  el.textContent = profileSaveState === 'saving' ? 'Saving...'
                 : profileSaveState === 'saved'  ? 'All changes saved'
                 : profileSaveState === 'error'  ? "Couldn't save - check your connection"
                 : '';
  el.className = 'save-state ' + profileSaveState;
}


/* Columns added by a migration that may not have been run yet. Sending one
   before it exists makes PostgREST reject the WHOLE upsert with 42703, so a
   therapist's entire profile would stop saving because of a checkbox. On that
   error the column is dropped and the save retried, and it stays dropped for
   the rest of the session rather than failing once per keystroke. */
const PENDING_COLUMNS = ['marketing_opt_in', 'blocks'];
let unavailableColumns = new Set();

// Upsert the signed-in therapist's profile (insert on first save, update after).
/* ---------------------------- analytics ----------------------------------
   The same aggregate tracker the marketing site uses, and the same rules:
   an event name and nothing else. No user id, no session id, no state, no
   licence number — the events table has no column for a person and this must
   not become the thing that adds one.

   The app is where the therapist funnel actually happens (the site hands off
   after payment), so without this the drop-off between paying and going live
   is invisible. That gap is currently 100%: two paid accounts, zero live.
-------------------------------------------------------------------------- */
const KA_SUPA = 'https://izukppxgoerqtustfbnk.supabase.co';
const KA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dWtwcHhnb2VycXR1c3RmYm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTAzMTYsImV4cCI6MjEwMDQyNjMxNn0.FeJFOu4PmOJAbk2OqfMH1sQX6DlynKmTyhc-dtKfvZk';
const KA_ONCE_KEY = 'kindred-milestones';
function kaSeen(event) {
  try { return (JSON.parse(localStorage.getItem(KA_ONCE_KEY) || '[]') || []).includes(event); }
  catch (e) { return false; }
}
function kaMark(event) {
  try {
    const a = JSON.parse(localStorage.getItem(KA_ONCE_KEY) || '[]') || [];
    if (!a.includes(event)) { a.push(event); localStorage.setItem(KA_ONCE_KEY, JSON.stringify(a)); }
  } catch (e) {}
}
function kTrack(event, once) {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    if (localStorage.getItem('kindred-no-analytics') === '1') return;
    /* A milestone is reached once per therapist, not once per page load. The
       checklist repaints constantly, so without this "live" would count how
       often someone opened the app rather than how many went live. Persisted,
       so it survives a reload too. */
    if (once) { if (kaSeen(event)) return; kaMark(event); }
    fetch(KA_SUPA + '/rest/v1/events', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: KA_ANON,
                 Authorization: 'Bearer ' + KA_ANON, Prefer: 'return=minimal' },
      body: JSON.stringify({ event: String(event).slice(0, 64), props: {} })
    }).catch(() => {});
  } catch (e) { /* analytics must never break the app */ }
}

async function saveTherapistProfile(t) {
  const s = loadAuthSession();
  if (!authReady() || !s) return false;

  const send = async () => {
    const row = therapistToDbRow(t, s.user.id);
    unavailableColumns.forEach(c => { delete row[c]; });
    return authRest('/therapists', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    });
  };

  let res = await send();
  if (res.ok) kTrack('app_profile_saved');
  if (!res.ok) {
    const body = await res.text();
    /* 23505 on therapists_slug_key: the upsert's speculative insert proposed a
       slug that already exists — almost always the therapist's OWN, because
       ON CONFLICT (user_id) does not cover a conflict on a different unique
       index. Migration 0031 stops it happening at all; until that is applied,
       send the slug explicitly so the trigger leaves it alone and the row
       resolves on user_id. Costs one extra request only on the failure path. */
    if (/23505/.test(body) && /slug/i.test(body)) {
      console.warn('slug conflict on upsert — retrying with an explicit slug (run migration 0031)');
      const retry = await authRest('/therapists', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(Object.assign(therapistToDbRow(t, s.user.id), {
          slug: slugifyName(displayName(t)) + '-' + String(s.user.id).replace(/-/g, '').slice(0, 6)
        }))
      });
      if (retry.ok) { kTrack('app_profile_saved'); return true; }
    }
    const missing = PENDING_COLUMNS.find(c => !unavailableColumns.has(c) && body.includes(c));
    if (missing && /42703|does not exist|schema cache/i.test(body)) {
      console.warn(`${missing} column not present yet — saving without it. Run the migration.`);
      unavailableColumns.add(missing);
      res = await send();
      if (res.ok) return true;
      throw new Error('save profile: ' + (await res.text()));
    }
    throw new Error('save profile: ' + body);
  }
  return true;
}
/* Licences live in their own table now: one row per (therapist, state), each
   with its own number and its own verification. therapists.license_states is
   derived from the VERIFIED ones by a DB trigger, so nothing here writes it. */
async function loadLicenses() {
  if (!authReady() || !loadAuthSession()) return [];
  try {
    const res = await authRest('/therapist_licenses?select=*&order=state');
    if (!res.ok) return [];
    return (await res.json()).map(r => ({
      state: r.state, number: r.license_number,
      // undefined until 0026 runs; the UI treats that as "not supplied"
      expiresOn: r.expires_on || '',
      verifiedAt: r.verified_at, rejectedAt: r.rejected_at,
      rejectedReason: r.rejected_reason || ''
    }));
  } catch (e) { return []; }
}
/* Set once a write proves the column is missing, so the retry happens at most
   once per session rather than on every save. Same idea as unavailableColumns
   for the therapists table. */
let licenseExpiryUnavailable = false;

async function saveLicense(state, number, expiresOn) {
  const s = loadAuthSession();
  if (!s) return false;
  const base = {
    user_id: s.user.id,
    state: String(state).toUpperCase(),
    license_number: String(number).trim()
  };
  /* merge-duplicates upserts on (user_id, state) -- which is what makes
     "fix my license" work at all: a denied licence is corrected in place
     rather than needing to be deleted and re-added. */
  const post = body => authRest('/therapist_licenses', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body)
  });

  let res;
  const wantsExpiry = !!expiresOn && !licenseExpiryUnavailable;
  if (wantsExpiry) {
    res = await post({ ...base, expires_on: expiresOn });
    /* 0026 may not have been run yet. PostgREST answers an unknown column with
       PGRST204/42703 -- drop the field and save the rest rather than losing a
       licence number over a date. */
    if (!res.ok) {
      const txt = await res.clone().text().catch(() => '');
      if (/PGRST204|42703|expires_on/i.test(txt)) {
        licenseExpiryUnavailable = true;
        console.warn('therapist_licenses.expires_on not present yet (migration 0026) — saving without it');
        res = await post(base);
      }
    }
  } else {
    res = await post(base);
  }
  /* Deliberately no state in the payload — which states have supply is a
     server-side aggregate (admin_supply_by_state), not something to put in an
     events row where it would start to identify people at low volumes. */
  if (res.ok) kTrack('app_license_entered');
  return res.ok;
}
async function deleteLicense(state) {
  const res = await authRest('/therapist_licenses?state=eq.' + encodeURIComponent(String(state).toUpperCase()), { method: 'DELETE' });
  return res.ok;
}

async function loadTherapistRow() {
  const s = loadAuthSession();
  if (!authReady() || !s) return null;
  const res = await authRest(`/therapists?user_id=eq.${s.user.id}&select=*`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// A database row -> the therapist shape the whole UI already renders. Keeping
// the adapter in ONE place means the day the roster goes live, nothing else
// in the app has to know the difference.
const DB_GRADIENTS = [
  'linear-gradient(135deg,#8a63a8,#5c3766)', 'linear-gradient(135deg,#bf7350,#9c5535)',
  'linear-gradient(135deg,#5f7d6b,#3c5246)', 'linear-gradient(135deg,#a86377,#6b3c4e)'
];
function dbRowToTherapist(row) {
  const nameWords = (row.name || '').replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean);
  let h = 0; for (const ch of (row.user_id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const formats = row.formats || [];
  const formatLabel = formats.length >= 2 ? 'Online & In-person'
    : formats.includes('video') ? 'Online only'
    : formats.includes('in-person') ? 'In-person only' : 'Format not set';
  const optionalPrompts = Array.isArray(row.optional_prompts) ? row.optional_prompts.slice() : [];
  if (row.prompt_fit) optionalPrompts.unshift({ question: 'You may be a fit if...', answer: row.prompt_fit, photo: null });
  return {
    id: row.user_id,
    name: row.name || 'Kindred Therapist',
    credentials: row.credentials && row.credentials.length ? row.credentials : ['Licensed Therapist'],
    pronouns: row.pronouns || '', showPronouns: row.show_pronouns !== false,
    useCompanyName: false, companyName: '',
    photo: row.photo || null,
    initials: nameWords.map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'KT',
    gradient: DB_GRADIENTS[h % DB_GRADIENTS.length],
    meta: [formatLabel, row.rate_min ? `$${row.rate_min}+/session` : 'Rate on request'],
    bestFor: row.best_for || '',
    tags: row.specialties || [],
    mandatoryPromptAnswers: [row.prompt_style || '', row.prompt_first_session || ''],
    optionalPrompts,
    modalities: row.modalities || [], style: row.style || 'balanced',
    identity: { gender: row.gender || '', lgbtqAffirming: !!row.lgbtq_affirming },
    languages: row.languages && row.languages.length ? row.languages : ['English'],
    marketingOptIn: !!row.marketing_opt_in,
    /* Empty means a profile from before this was stored -- leave it undefined
       so getToKnowBlocks() rebuilds the default arrangement instead of
       showing an empty feed. */
    ...(Array.isArray(row.blocks) && row.blocks.length ? { blocks: row.blocks } : {}),
    formats, rateMin: row.rate_min || 0, insuranceList: row.insurance || [],
    licensedStates: (row.license_states && row.license_states.length) ? row.license_states : undefined,
    paymentOptions: row.payment_options || [],
    listed: !!row.published,
    /* Stripe's own word for it: 'trialing' | 'active' | 'past_due' | ... The
       column has existed since 0008 and `select=*` has always returned it; it
       was simply never read, which is why the app could not tell a therapist
       on a free trial from one being charged. */
    subscriptionStatus: row.subscription_status || null,
    /* End of the six free months. Null until they first go live — the clock
       starts at findability, not signup, so nobody burns free time waiting on
       a hand-checked licence. See migration 0029. */
    freeUntil: row.free_until || null,
    /* Was: a hardcoded {founding:false, standardRate:29.99} for every row that
       came back published. Settings printed it verbatim, so a founding member
       paying $9.99 was told "Listed — $29.99/mo" by their own account page.
       There is no rate column to read, so the honest thing is to carry no rate
       at all rather than a confident wrong one. */
    subscription: row.published ? { status: row.subscription_status || null } : null,
    acceptingOngoing: row.accepting !== false, onDemand: false, onDemandSlots: [],
    nextAvailableRank: 1, nextAvailableLabel: 'This week',
    practiceType: row.practice_type || 'specialist', externalAppointments: [],
    agreedToOnDemandPolicy: false,
    location: row.location || {},
    // The badge is a credential claim shown to clients: it tracks the admin-set
    // column ONLY. It used to be !!row.license_number, so any typed string
    // produced a verified badge.
    licenseVerified: row.license_verified === true, licenseNumber: row.license_number || '',
    identityVerified: row.identity_verified === true,
    licenseRejectedReason: row.license_rejected_reason || '',
    website: row.website || '',
    ethnicity: row.ethnicity || '', affinities: row.affinities || [], faith: row.faith || [],
    availabilitySlots: [],
    /* Was a bare emptyIdealClient(): the column was WRITTEN on every save and
       never read back, so a therapist described their ideal client, reloaded,
       and found the section blank and the checklist step un-ticked again. The
       server still had it and still matched on it -- only the therapist could
       not see it. Same shape of bug as `blocks`.
       Merged OVER the empty shape, not used raw: every renderer here does
       `t.idealClient.ageBands.includes(...)` with no guard, so a partial object
       from an older row is a TypeError mid-render. */
    idealClient: Object.assign(emptyIdealClient(), row.ideal_client || {}),
    stats: { profileViews: 0, hearts: 0, top5: 0, conversationsStarted: 0, weekViews: 0, weekHearts: 0 },
    media: row.media || { video: null, office: null, outOfOffice: null },
    persona: row.persona || { inOffice: '', outOfOffice: '' },
    _serverScore: typeof row.match_score === 'number' ? row.match_score : undefined,
    _serverIdeal: !!row.is_ideal
  };
}

// The client's intake, translated to match_therapists() arguments.
function matchParams() {
  return {
    p_needs: intake.needs || [],
    p_modality: intake.modality || 'open',
    p_style: intake.stylePref ? (STYLE_ALIGN[intake.stylePref] || null) : null,
    p_gender: intake.genderPref !== 'no-preference' ? intake.genderPref : null,
    p_ethnicity: intake.ethnicityPref !== 'no-preference' ? intake.ethnicityPref : null,
    p_lgbtq: !!intake.lgbtqRequired,
    p_affinities: intake.affinities || [],
    p_faith: intake.faith || [],
    p_language: intake.languagePref !== 'any' ? intake.languagePref : null,
    p_format: intake.formats.length === 1 ? intake.formats[0] : null,
    p_insurance: (intake.hasInsurance === 'yes' && intake.insurance !== 'any') ? intake.insurance : null,
    p_state: intake.state || null,
    p_age_band: ageToBand(intake.age), // send the derived life-stage band
    p_self_gender: intake.selfGender || null,
    p_field: intake.field || null,
    p_has_insurance: intake.hasInsurance === 'yes' ? true : intake.hasInsurance === 'no' ? false : null,
    p_prev_experience: intake.prevExperience || [],
    p_limit: 50
  };
}

// Controlled vocabularies: the DB is the source of truth (see supabase/API.md
// — the clients had already drifted from each other before this existed). The
// baked lists above are the offline fallback; this refreshes them at boot.
async function loadVocab() {
  if (!dbReady()) return;
  try {
    const v = await dbRpc('get_vocab', {});
    const take = (key, assign) => { if (Array.isArray(v[key]) && v[key].length) assign(v[key]); };
    take('specialty_core',  x => { NEED_OPTIONS = x; });
    take('specialty_more',  x => { OTHER_SPECIALTIES = x; });
    take('modality_core',   x => { MODALITY_OPTIONS = x; });
    take('modality_quick',  x => { MODALITY_QUICK = x; });
    take('modality_more',   x => { OTHER_MODALITIES = x; });
    take('insurance_core',  x => { INSURANCE_OPTIONS = x; });
    take('insurance_more',  x => { OTHER_INSURANCES = x; });
    take('language_quick',  x => { LANGUAGE_QUICK_OPTIONS = x; });
    take('language_more',   x => { OTHER_LANGUAGES = x; });
    take('client_gender',   x => { CLIENT_GENDER_OPTIONS = x; });
    take('field_more',      x => { FIELD_MORE = x; });
    take('prev_experience', x => { PREV_EXPERIENCE_OPTIONS = x; });
  } catch (e) { /* offline or vocab not deployed yet — baked lists stand */ }
}
loadVocab();

let deckLoading = false;
let deckFetchSeq = 0;

// How many therapists are live on the platform AT ALL, ignoring this client's
// filters. Lets an empty deck say the true thing: "we're still onboarding"
// (cold start) vs "your filters are too tight". null = not known yet.
let rosterCount = null;
function refreshRosterCount() {
  if (!dbReady()) { rosterCount = null; return Promise.resolve(null); }
  const c = dbConfig();
  return fetch(`${c.url.replace(/\/$/, '')}/rest/v1/therapists_public?select=user_id&limit=1`, {
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, Prefer: 'count=exact' }
  })
    .then(res => {
      // PostgREST reports the true total in Content-Range as "0-0/12"
      const range = res.headers.get('content-range') || '';
      const total = parseInt(range.split('/')[1], 10);
      rosterCount = Number.isFinite(total) ? total : null;
      return rosterCount;
    })
    .catch(() => { rosterCount = null; return null; });
}

function computeDeck() {
  const seededDeck = () => THERAPISTS.filter(t => isCompatible(t, 'ongoing'))
    .sort((a, b) => a.nextAvailableRank - b.nextAvailableRank);

  if (!dbReady()) { deck = seededDeck(); deckIndex = 0; return; }

  // Server mode: Postgres filters and scores, we render one page. The seq
  // guard drops stale responses if the client edits preferences mid-flight.
  const seq = ++deckFetchSeq;
  deckLoading = true; deck = []; deckIndex = 0;
  dbRpc('match_therapists', matchParams())
    .then(rows => {
      if (seq !== deckFetchSeq) return;
      deck = rows.map(dbRowToTherapist);
      // The real roster is still filling up, so an empty result would mean a
      // blank app for demos and previews. Fall back to the seeded therapists —
      // but NEVER in a production build: real clients must not be shown
      // fictional people presented as bookable.
      if (!deck.length && !PRODUCTION_BUILD) deck = seededDeck();
    })
    .catch(() => {
      // network/DB failure: a seeded deck beats a blank screen in demo, but in
      // production showing nothing is the honest outcome.
      if (seq === deckFetchSeq) deck = PRODUCTION_BUILD ? [] : seededDeck();
    })
    .then(() => refreshRosterCount())   // so an empty deck can explain itself honestly
    .then(() => { if (seq === deckFetchSeq) { deckLoading = false; renderStack(); } });
}

function computeOnDemandList() {
  return THERAPISTS.filter(t => isCompatible(t, 'ondemand'))
    .sort((a, b) => Math.min(...a.onDemandSlots.map(s => s.rank)) - Math.min(...b.onDemandSlots.map(s => s.rank)));
}

function loosenRequirements() {
  intake.modalityRequired = false;
  intake.genderRequired = false;
  intake.lgbtqRequired = false;
  intake.languageRequired = false;
  computeDeck();
  renderStack();
}

// ===================================================================
// INTAKE QUIZ
// ===================================================================
let intakeStep = 0;
// Keyed step order so inserting or reordering steps never means renumbering a
// pile of `intakeStep === N` checks. The 'needs' step renders either the
// clinical chips or the plain-language list depending on the knows-fork.
/* Two halves, in this order: everything about THEM, then everything about the
   therapist they want. The old order interleaved the two -- "who do you want to
   work with?" arrived before "a little about you" -- which made the
   questionnaire feel like it kept changing subject. */
const INTAKE_STEPS = [
  // Let's get to know you
  'careFor', 'knows', 'needs', 'experience', 'aboutYou', 'logistics',
  // What you're looking for in a therapist
  'who', 'approach', 'guidance', 'anythingElse'
];
const INTAKE_SECTION = {
  careFor: 'about', knows: 'about', needs: 'about',
  experience: 'about', aboutYou: 'about', logistics: 'about',
  who: 'therapist', approach: 'therapist', guidance: 'therapist', anythingElse: 'therapist'
};
const INTAKE_SECTION_LABEL = {
  about: "Let's get to know you",
  therapist: 'What you want in a therapist'
};

// Two genuinely different paths, chosen at the 'knows' step:
//   'no'  — new to therapy. Matched from SYMPTOMS in plain language. We never
//           ask them to name a modality, because that question assumes
//           vocabulary they don't have yet.
//   'yes' — been in therapy before. They get the modality picker AND a question
//           about what they want different this time, which is the most useful
//           matching signal a returning client can give us.
function activeSteps() {
  return INTAKE_STEPS.filter(k => {
    if (k === 'approach' && intake.knowsNeeds === 'no') return false;
    if (k === 'experience' && intake.knowsNeeds !== 'yes') return false;
    return true;
  });
}
const intakeContent = document.getElementById('intake-content');

function renderIntakeStep() {
  const steps = activeSteps();
  const k = steps[intakeStep];
  const section = INTAKE_SECTION[k] || 'about';
  // First step of the second half: say plainly that the subject has changed.
  const firstOfSection = steps.findIndex(x => INTAKE_SECTION[x] === section) === intakeStep;
  let html = `<div class="intake-progress">${steps.map((x, i) =>
    `<div class="dot ${i <= intakeStep ? 'done' : ''} ${INTAKE_SECTION[x] === 'therapist' ? 'dot-therapist' : ''}"></div>`).join('')}</div>
    <p class="intake-section ${firstOfSection ? 'is-new' : ''}">${INTAKE_SECTION_LABEL[section]}</p>`;

  if (k === 'careFor') {
    html += `
      <h1>I'm looking for therapy for...</h1>
      <div class="intake-sub">This helps us line you up with the right kind of therapist from the start.</div>
      <div class="option-list" id="care-for-list">
        ${CARE_FOR_OPTIONS.map(o => `<div class="option-row ${intake.careFor === o.key ? 'selected' : ''}" data-care-for="${o.key}">${o.label}</div>`).join('')}
      </div>
      ${intake.careFor === 'child' ? `
      <div class="t-form-label">How old is the child?</div>
      <input type="text" class="t-rate-input" id="child-age-input" placeholder="e.g. 8" value="${intake.childAge}">` : ''}`;
  } else if (k === 'knows') {
    html += `
      <h1>Have you been to therapy before?</h1>
      <div class="intake-sub">There's no better answer — it just changes which questions are worth your time.</div>
      <div class="option-list" id="knows-list">
        <div class="path-card-option ${intake.knowsNeeds === 'no' ? 'selected' : ''}" data-knows="no">
          <div class="path-card-title">This is new to me</div>
          <div class="path-card-desc">We'll start with what you've actually been feeling — in plain words, no clinical terms. Kindred works out the rest.</div>
        </div>
        <div class="path-card-option ${intake.knowsNeeds === 'yes' ? 'selected' : ''}" data-knows="yes">
          <div class="path-card-title">I've done this before</div>
          <div class="path-card-desc">We'll skip the basics and ask what you're looking for directly — including the approach you want and what you'd do differently this time.</div>
        </div>
      </div>`;
  } else if (k === 'needs' && intake.knowsNeeds === 'no') {
    const groups = [...new Set(UNSURE_OPTIONS.map(o => o.group))];
    const stage = Math.min(intake.quizStage || 0, groups.length);
    // friendly per-section prompts
    const GROUP_PROMPTS = {
      'Mood & energy': "How have your mood and energy been?",
      'Worry & stress': 'What about worry and stress?',
      'Relationships': 'How are your relationships feeling?',
      'Focus, habits & self': 'What about focus, habits, and how you treat yourself?',
      'Big life stuff': 'Any big life stuff going on?'
    };
    if (stage < groups.length) {
      const g = groups[stage];
      const opts = UNSURE_OPTIONS.filter(o => o.group === g);
      // NOTE: statements quietly map to matchable focus areas behind the scenes,
      // but we never surface a condition/label to the client — no diagnosing.
      html += `
        <div class="quiz-step-count">Section ${stage + 1} of ${groups.length}</div>
        <h1>${GROUP_PROMPTS[g] || g}</h1>
        <div class="intake-sub">Pick anything that sounds like you — or skip this one if nothing fits. No right words needed.</div>
        <div id="unsure-list">
          <div class="option-list">
            ${opts.map(o => `<div class="option-row ${intake.needs.includes(o.tag) ? 'selected' : ''}" data-unsure-tag="${o.tag}">${o.label}</div>`).join('')}
          </div>
        </div>`;
    } else {
      // neutral close — reassurance only, deliberately names no conditions
      html += `
        <h1>Thanks! That's everything we need</h1>
        <div class="intake-sub">We'll use what you shared to find therapists who work with what you're carrying. Tap Continue whenever you're ready.</div>`;
    }
  } else if (k === 'needs') {
    const extraSelected = intake.needs.filter(n => !NEED_OPTIONS.includes(n));
    html += `
      <h1>What brings you to therapy right now?</h1>
      <div class="intake-sub">Pick as many as apply — this is how we find therapists who actually work with what you're dealing with.</div>
      <div class="chip-grid" id="needs-grid">
        ${NEED_OPTIONS.map(n => `<div class="chip-option ${intake.needs.includes(n) ? 'selected' : ''}" data-need="${n}">${n}</div>`).join('')}
        ${extraSelected.map(n => `<div class="chip-option selected" data-need="${n}">${n}</div>`).join('')}
        <div class="chip-option ${intake.notSure ? 'selected' : ''}" id="needs-not-sure-btn">I'm not sure</div>
        <div class="chip-option ${intake.needsOtherOpen ? 'selected' : ''}" id="needs-other-btn">${intake.needsOtherOpen ? 'Done' : '+ Other'}</div>
      </div>
      ${intake.needsOtherOpen ? `
      <div class="specialty-panel" id="specialty-panel">
        ${OTHER_SPECIALTIES.map(s => `
          <label class="specialty-row">
            <input type="checkbox" data-specialty="${s}" ${intake.needs.includes(s) ? 'checked' : ''}>
            <span>${s}</span>
          </label>`).join('')}
      </div>` : ''}`;
  } else if (k === 'who') {
    html += `
      <h1>Who do you want to work with?</h1>
      <div class="intake-sub">Preferences are optional — but we do need to know where you are, since therapists are licensed by state.</div>
      <div class="t-form-label">Gender</div>
      <div class="chip-grid" id="gender-list">
        <div class="chip-option ${intake.genderPref === 'no-preference' ? 'selected' : ''}" data-gender="no-preference">Open to all</div>
        <div class="chip-option ${intake.genderPref === 'female' ? 'selected' : ''}" data-gender="female">Female</div>
        <div class="chip-option ${intake.genderPref === 'male' ? 'selected' : ''}" data-gender="male">Male</div>
        <div class="chip-option ${intake.genderPref === 'nonbinary' ? 'selected' : ''}" data-gender="nonbinary">Nonbinary</div>
      </div>
      <div id="gender-must-have" style="${intake.genderPref === 'no-preference' ? 'display:none;' : ''}">
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>Must-have</strong><span>Only show therapists matching this</span></div>
          <div class="switch ${intake.genderRequired ? 'on' : ''}" id="gender-required-switch"></div>
        </div>
      </div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>LGBTQ+ affirming</strong><span>Must be explicitly affirming</span></div>
        <div class="switch ${intake.lgbtqRequired ? 'on' : ''}" id="lgbtq-switch"></div>
      </div>
      <div class="t-form-label">Ethnicity</div>
      <select id="ethnicity-select">
        <option value="no-preference" ${intake.ethnicityPref === 'no-preference' ? 'selected' : ''}>Open to all</option>
        ${ETHNICITY_OPTIONS.map(e => `<option value="${e}" ${intake.ethnicityPref === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
      <div class="t-form-label">Language</div>
      <div class="chip-grid" id="language-grid">
        ${LANGUAGE_QUICK_OPTIONS.map(l => `<div class="chip-option ${intake.languagePref === l ? 'selected' : ''}" data-language="${l}">${l}</div>`).join('')}
        ${(!LANGUAGE_QUICK_OPTIONS.includes(intake.languagePref) && intake.languagePref !== 'any') ? `<div class="chip-option selected" data-language="${intake.languagePref}">${intake.languagePref}</div>` : ''}
        <div class="chip-option" id="language-other-btn">+ Other</div>
      </div>
      ${intake.languageOtherOpen ? `<div class="other-language-row">
        <select id="language-other-select">${OTHER_LANGUAGES.map(l => `<option value="${l}" ${l === intake.languagePref ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>` : ''}
      <div id="language-must-have" style="${intake.languagePref === 'any' ? 'display:none;' : ''}">
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>Must-have</strong><span>Only show therapists who speak this language</span></div>
          <div class="switch ${intake.languageRequired ? 'on' : ''}" id="language-required-switch"></div>
        </div>
      </div>
      <div class="t-form-label">How do you want to meet?</div>
      <div class="chip-grid" id="format-list">
        <div class="chip-option ${intake.formats.includes('video') ? 'selected' : ''}" data-format="video">Online</div>
        <div class="chip-option ${intake.formats.includes('in-person') ? 'selected' : ''}" data-format="in-person">In-person</div>
      </div>
      <div class="t-form-label">When can you usually meet?</div>
      <div class="chip-grid" id="availability-grid">
        ${AVAILABILITY_OPTIONS.map(a => `<div class="chip-option ${intake.availability.includes(a) ? 'selected' : ''}" data-availability="${a}">${a}</div>`).join('')}
      </div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>Only accepting new clients</strong><span>Hide anyone you could only save for later</span></div>
        <div class="switch ${intake.mustBeAccepting ? 'on' : ''}" id="accepting-required-switch"></div>
      </div>
      <div class="t-form-label">Your state <span class="req-star" title="Required">★</span></div>
      <select id="intake-state">
        <option value="">Select a state</option>
        ${US_STATES.map(s => `<option value="${s}" ${intake.state === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <div id="location-fields" style="${intake.formats.includes('in-person') ? '' : 'display:none;'}">
        <div class="t-form-label">Your city <span class="req-star" title="Required for in-person">★</span></div>
        <input type="text" class="t-rate-input" id="intake-city" placeholder="e.g. Austin" value="${intake.city}">
      </div>
      <div class="intake-sub" style="margin-top:6px;">${intake.formats.includes('in-person') ? 'In-person only works with a therapist actually located near you.' : 'Even online, your therapist has to be licensed in your state.'}</div>`;
  } else if (k === 'approach') {
    const modalityExtra = (intake.modality !== 'open' && !MODALITY_QUICK.includes(intake.modality)) ? intake.modality : null;
    html += `
      <h1>Any type of therapy in mind?</h1>
      <div class="intake-sub">Optional — if you're not sure, "Open to anything" is a great answer. Tap the ? to learn what each one is.</div>
      <div class="chip-grid" id="modality-grid">
        <div class="chip-option ${intake.modality === 'open' ? 'selected' : ''}" data-modality="open">Open to anything</div>
        ${MODALITY_QUICK.map(m => `<div class="chip-option ${intake.modality === m ? 'selected' : ''}" data-modality="${m}">${m}${MODALITY_INFO[m] ? ` <span class="info-btn" data-info="${m}">?</span>` : ''}</div>`).join('')}
        ${modalityExtra ? `<div class="chip-option selected" data-modality="${modalityExtra}">${modalityExtra}</div>` : ''}
        <div class="chip-option ${intake.modalityOtherOpen ? 'selected' : ''}" id="modality-other-btn">+ Other</div>
      </div>
      ${intake.modalityOtherOpen ? `<div class="other-language-row">
        <select id="modality-other-select">${OTHER_MODALITIES.map(m => `<option value="${m}" ${m === intake.modality ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>` : ''}
      <div id="modality-must-have" style="${intake.modality === 'open' ? 'display:none;' : ''}">
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>Must-have</strong><span>Only show therapists who offer this</span></div>
          <div class="switch ${intake.modalityRequired ? 'on' : ''}" id="modality-required-switch"></div>
        </div>
      </div>`;
  } else if (k === 'experience') {
    html += `
      <h1>What would you change about last time?</h1>
      <div class="intake-sub">You've been here before, so you know what works for you. This is the most useful thing you can tell us — all optional.</div>
      <div class="chip-grid" id="prev-experience-grid">
        ${PREV_EXPERIENCE_OPTIONS.map(o => `<div class="chip-option ${intake.prevExperience.includes(o) ? 'selected' : ''}" data-prev-exp="${o}">${o}</div>`).join('')}
      </div>
      <div class="match-tag-label">Anything they should know?</div>
      <textarea class="intake-textarea" id="prev-notes-input" rows="3" placeholder="e.g. I've done CBT for anxiety and want to go deeper into why it started.">${intake.prevNotes || ''}</textarea>`;
  } else if (k === 'guidance') {
    html += `
      <h1>What kind of guidance do you want?</h1>
      <div class="intake-sub">There's no wrong answer — this just helps us show you therapists whose style tends to match.</div>
      <div class="option-list" id="style-list">
        <div class="option-row ${intake.stylePref === 'gentle' ? 'selected' : ''}" data-style="gentle">Mostly listens and reflects back</div>
        <div class="option-row ${intake.stylePref === 'direct' ? 'selected' : ''}" data-style="direct">Direct — tells me like it is</div>
        <div class="option-row ${intake.stylePref === 'empathy' ? 'selected' : ''}" data-style="empathy">I'm needing more empathy and understanding</div>
        <div class="option-row ${intake.stylePref === 'challenge' ? 'selected' : ''}" data-style="challenge">I'm needing to be challenged and pushed</div>
      </div>`;
  } else if (k === 'anythingElse') {
    html += `
      <h1>Anything else that matters?</h1>
      <div class="intake-sub">All optional — pick anything that would help you feel understood, and we'll surface therapists who share it.</div>
      <div class="t-form-label">Gender &amp; sexuality</div>
      <div class="chip-grid" id="affinities-grid">
        ${GENDER_SEXUALITY_OPTIONS.map(o => `<div class="chip-option ${intake.affinities.includes(o) ? 'selected' : ''}" data-affinity="${o}">${o}</div>`).join('')}
      </div>
      <div class="t-form-label">Faith</div>
      <div class="chip-grid" id="faith-grid">
        ${FAITH_OPTIONS.map(o => `<div class="chip-option ${intake.faith.includes(o) ? 'selected' : ''}" data-faith="${o}">${o}</div>`).join('')}
      </div>`;
  } else if (k === 'aboutYou') {
    html += `
      <h1>A little about you</h1>
      <div class="intake-sub">Some therapists work especially closely with certain groups. This helps us spot those matches for you — all of it is optional, and skipping never limits who you can see.</div>
      <div class="match-tag-label" style="margin-top:0;">Your age</div>
      <input type="number" inputmode="numeric" min="0" max="120" class="t-rate-input" id="age-input" placeholder="e.g. 34" value="${intake.age}">
      <div class="match-tag-label">Your gender</div>
      <div class="chip-grid" id="self-gender-grid">
        ${CLIENT_GENDER_OPTIONS.map(g => `<div class="chip-option ${intake.selfGender === g ? 'selected' : ''}" data-self-gender="${g}">${g}</div>`).join('')}
      </div>
      <div class="match-tag-label">What you do</div>
      <div class="chip-grid" id="field-grid">
        ${FIELD_PRIMARY.map(f => `<div class="chip-option ${intake.field === f ? 'selected' : ''}" data-field="${f}">${f}</div>`).join('')}
        ${(intake.field && !FIELD_PRIMARY.includes(intake.field)) ? `<div class="chip-option selected" data-field="${intake.field}">${intake.field}</div>` : ''}
        <div class="chip-option ${intake.fieldOtherOpen ? 'selected' : ''}" id="field-other-btn">${intake.fieldOtherOpen ? 'Done' : '+ Other'}</div>
      </div>
      ${intake.fieldOtherOpen ? `
      <div class="other-language-row">
        <select id="field-other-select"><option value="">Choose…</option>${FIELD_MORE.map(f => `<option value="${f}" ${intake.field === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
      </div>
      <input type="text" class="t-rate-input" id="field-typed" placeholder="…or type your own" value="${(intake.field && !FIELD_PRIMARY.includes(intake.field) && !FIELD_MORE.includes(intake.field)) ? intake.field : ''}">` : ''}`;
  } else if (k === 'logistics') {
    html += `
      <h1>A few logistics</h1>
      <div class="intake-sub">Last step — how you'll pay for sessions.</div>
      <div class="match-tag-label" style="margin-top:0;">Do you have insurance?</div>
      <div class="option-list" id="has-insurance-list">
        <div class="option-row ${intake.hasInsurance === 'yes' ? 'selected' : ''}" data-has-insurance="yes">Yes</div>
        <div class="option-row ${intake.hasInsurance === 'no' ? 'selected' : ''}" data-has-insurance="no">No</div>
      </div>
      ${intake.hasInsurance === 'yes' ? `
      <div class="match-tag-label">Which insurance?</div>
      <div class="chip-grid" id="insurance-grid">
        ${INSURANCE_OPTIONS.map(i => `<div class="chip-option ${intake.insurance === i ? 'selected' : ''}" data-insurance="${i}">${i}</div>`).join('')}
        ${(!INSURANCE_OPTIONS.includes(intake.insurance) && intake.insurance !== 'any') ? `<div class="chip-option selected" data-insurance="${intake.insurance}">${intake.insurance}</div>` : ''}
        <div class="chip-option" id="insurance-other-btn">+ Other</div>
      </div>
      ${intake.insuranceOtherOpen ? `<div class="other-language-row">
        <select id="insurance-other-select">${OTHER_INSURANCES.map(i => `<option value="${i}" ${i === intake.insurance ? 'selected' : ''}>${i}</option>`).join('')}</select>
      </div>` : ''}` : ''}
      ${intake.hasInsurance === 'no' ? `
      <div class="match-tag-label">No problem — which sounds more like you?</div>
      <div class="option-list" id="no-insurance-list">
        <div class="option-row ${intake.noInsurancePref === 'sliding-scale' ? 'selected' : ''}" data-no-insurance="sliding-scale">I'm in need of a sliding scale</div>
        <div class="option-row ${intake.noInsurancePref === 'therapist-first' ? 'selected' : ''}" data-no-insurance="therapist-first">The therapist is more important to me</div>
      </div>` : ''}
      <div class="match-tag-label">Budget range for session</div>
      <div class="chip-grid" id="budget-range-grid">
        ${BUDGET_RANGES.map(r => `<div class="chip-option ${intake.budgetRange === r.label ? 'selected' : ''}" data-budget-range="${r.label}">${r.label}</div>`).join('')}
      </div>`;
  }

  let canProceed = true;
  if (k === 'careFor') canProceed = intake.careFor !== null && (intake.careFor !== 'child' || intake.childAge.trim() !== '');
  else if (k === 'knows') canProceed = intake.knowsNeeds !== null;
  else if (k === 'needs' && intake.knowsNeeds === 'yes') canProceed = intake.needs.length > 0 || intake.notSure;
  // The "not sure" path never blocks on a minimum selection. On the who step:
  // state is always required (therapists are licensed by state), city only for
  // in-person, and a language must now be chosen — there's no "no preference".
  else if (k === 'who') canProceed = intake.state !== '' && (!intake.formats.includes('in-person') || intake.city.trim() !== '');
  else if (k === 'logistics') canProceed = intake.hasInsurance === 'yes' ? intake.insurance !== 'any'
    : intake.hasInsurance === 'no' ? intake.noInsurancePref !== null
    : false;
  // On the optional "Anything else that matters?" step, the button reads Skip
  // until they pick something, then Continue.
  let nextLabel = intakeStep === activeSteps().length - 1 ? 'See My Matches' : 'Continue';
  if (k === 'anythingElse' && intake.affinities.length === 0 && intake.faith.length === 0) nextLabel = 'Skip';
  html += `
    <div class="intake-footer">
      ${intakeStep > 0 ? `<button class="btn-back" id="intake-back">Back</button>` : ''}
      <button class="btn-next" id="intake-next" ${canProceed ? '' : 'disabled'}>${nextLabel}</button>
    </div>`;

  intakeContent.innerHTML = html;
  attachIntakeHandlers();
}

function attachIntakeHandlers() {
  document.querySelectorAll('#care-for-list .option-row').forEach(el => {
    el.addEventListener('click', () => { intake.careFor = el.dataset.careFor; renderIntakeStep(); });
  });
  const childAgeInput = document.getElementById('child-age-input');
  if (childAgeInput) childAgeInput.addEventListener('input', () => {
    intake.childAge = childAgeInput.value;
    document.getElementById('intake-next').disabled = intake.childAge.trim() === '';
  });

  document.querySelectorAll('#knows-list [data-knows]').forEach(el => {
    el.addEventListener('click', () => { intake.knowsNeeds = el.dataset.knows; intake.quizStage = 0; renderIntakeStep(); });
  });

  document.querySelectorAll('#needs-grid .chip-option[data-need]').forEach(el => {
    el.addEventListener('click', () => {
      const need = el.dataset.need;
      const i = intake.needs.indexOf(need);
      if (i === -1) intake.needs.push(need); else intake.needs.splice(i, 1);
      renderIntakeStep();
    });
  });
  const notSureBtn = document.getElementById('needs-not-sure-btn');
  if (notSureBtn) notSureBtn.addEventListener('click', () => { intake.notSure = !intake.notSure; renderIntakeStep(); });
  const needsOtherBtn = document.getElementById('needs-other-btn');
  if (needsOtherBtn) needsOtherBtn.addEventListener('click', () => { intake.needsOtherOpen = !intake.needsOtherOpen; renderIntakeStep(); });
  // Checkbox toggles update state and the Continue button directly, without
  // a full re-render — re-rendering would reset the panel's scroll position
  // on every tick in a ~90-item list.
  document.querySelectorAll('#specialty-panel [data-specialty]').forEach(cb => {
    cb.addEventListener('change', () => {
      const s = cb.dataset.specialty;
      const i = intake.needs.indexOf(s);
      if (cb.checked && i === -1) intake.needs.push(s);
      if (!cb.checked && i !== -1) intake.needs.splice(i, 1);
      document.getElementById('intake-next').disabled = !(intake.needs.length > 0 || intake.notSure);
    });
  });

  document.querySelectorAll('#unsure-list [data-unsure-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.unsureTag;
      const i = intake.needs.indexOf(tag);
      if (i === -1) intake.needs.push(tag); else intake.needs.splice(i, 1);
      renderIntakeStep();
    });
  });

  document.querySelectorAll('#modality-grid .chip-option[data-modality]').forEach(el => {
    el.addEventListener('click', () => {
      intake.modality = el.dataset.modality;
      intake.modalityOtherOpen = false;
      if (intake.modality === 'open') intake.modalityRequired = false;
      renderIntakeStep();
    });
  });
  document.querySelectorAll('#modality-grid .info-btn').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openModalityInfo(el.dataset.info); });
  });
  const modalityOtherBtn = document.getElementById('modality-other-btn');
  if (modalityOtherBtn) modalityOtherBtn.addEventListener('click', () => { intake.modalityOtherOpen = true; renderIntakeStep(); });
  const modalityOtherSelect = document.getElementById('modality-other-select');
  if (modalityOtherSelect) modalityOtherSelect.addEventListener('change', () => { intake.modality = modalityOtherSelect.value; renderIntakeStep(); });
  const modReqSwitch = document.getElementById('modality-required-switch');
  if (modReqSwitch) modReqSwitch.addEventListener('click', () => { intake.modalityRequired = !intake.modalityRequired; renderIntakeStep(); });

  document.querySelectorAll('#style-list .option-row').forEach(el => {
    el.addEventListener('click', () => { intake.stylePref = el.dataset.style; renderIntakeStep(); });
  });

  document.querySelectorAll('#gender-list .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      intake.genderPref = el.dataset.gender;
      if (intake.genderPref === 'no-preference') intake.genderRequired = false;
      renderIntakeStep();
    });
  });
  const genderReqSwitch = document.getElementById('gender-required-switch');
  if (genderReqSwitch) genderReqSwitch.addEventListener('click', () => { intake.genderRequired = !intake.genderRequired; renderIntakeStep(); });
  const lgbtqSwitch = document.getElementById('lgbtq-switch');
  if (lgbtqSwitch) lgbtqSwitch.addEventListener('click', () => { intake.lgbtqRequired = !intake.lgbtqRequired; renderIntakeStep(); });
  const acceptingReqSwitch = document.getElementById('accepting-required-switch');
  if (acceptingReqSwitch) acceptingReqSwitch.addEventListener('click', () => { intake.mustBeAccepting = !intake.mustBeAccepting; renderIntakeStep(); });
  const ethnicitySelect = document.getElementById('ethnicity-select');
  if (ethnicitySelect) ethnicitySelect.addEventListener('change', () => { intake.ethnicityPref = ethnicitySelect.value; renderIntakeStep(); });

  document.querySelectorAll('#language-grid [data-language]').forEach(el => {
    el.addEventListener('click', () => {
      intake.languagePref = el.dataset.language;
      intake.languageOtherOpen = false;
      if (intake.languagePref === 'any') intake.languageRequired = false;
      renderIntakeStep();
    });
  });
  const languageOtherBtn = document.getElementById('language-other-btn');
  if (languageOtherBtn) languageOtherBtn.addEventListener('click', () => { intake.languageOtherOpen = true; renderIntakeStep(); });
  const languageOtherSelect = document.getElementById('language-other-select');
  if (languageOtherSelect) languageOtherSelect.addEventListener('change', () => { intake.languagePref = languageOtherSelect.value; renderIntakeStep(); });
  const languageReqSwitch = document.getElementById('language-required-switch');
  if (languageReqSwitch) languageReqSwitch.addEventListener('click', () => { intake.languageRequired = !intake.languageRequired; renderIntakeStep(); });

  document.querySelectorAll('#format-list .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      // multi-select: pick either or both. None picked = either works.
      const f = el.dataset.format, i = intake.formats.indexOf(f);
      if (i === -1) intake.formats.push(f); else intake.formats.splice(i, 1);
      renderIntakeStep();
    });
  });
  document.querySelectorAll('#availability-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      const a = el.dataset.availability;
      const has = intake.availability.includes(a);
      // "Anytime" is exclusive — it and the specific windows can't coexist.
      if (a === 'Anytime') intake.availability = has ? [] : ['Anytime'];
      else {
        intake.availability = intake.availability.filter(x => x !== 'Anytime');
        if (has) intake.availability = intake.availability.filter(x => x !== a);
        else intake.availability.push(a);
      }
      renderIntakeStep();
    });
  });
  const intakeCityInput = document.getElementById('intake-city');
  if (intakeCityInput) intakeCityInput.addEventListener('input', () => {
    intake.city = intakeCityInput.value;
    document.getElementById('intake-next').disabled = !(intake.city.trim() && intake.state);
  });
  document.querySelectorAll('#affinities-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      const a = el.dataset.affinity;
      const i = intake.affinities.indexOf(a);
      if (i === -1) intake.affinities.push(a); else intake.affinities.splice(i, 1);
      renderIntakeStep();
    });
  });
  document.querySelectorAll('#faith-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      const f = el.dataset.faith;
      const i = intake.faith.indexOf(f);
      if (i === -1) intake.faith.push(f); else intake.faith.splice(i, 1);
      renderIntakeStep();
    });
  });
  const intakeStateSelect = document.getElementById('intake-state');
  if (intakeStateSelect) intakeStateSelect.addEventListener('change', () => { intake.state = intakeStateSelect.value; renderIntakeStep(); });
  document.querySelectorAll('#has-insurance-list .option-row').forEach(el => {
    el.addEventListener('click', () => {
      intake.hasInsurance = el.dataset.hasInsurance;
      // switching branches clears the other branch's answer
      if (intake.hasInsurance === 'yes') intake.noInsurancePref = null; else { intake.insurance = 'any'; intake.insuranceOtherOpen = false; }
      renderIntakeStep();
    });
  });
  document.querySelectorAll('#insurance-grid .chip-option[data-insurance]').forEach(el => {
    el.addEventListener('click', () => { intake.insurance = el.dataset.insurance; intake.insuranceOtherOpen = false; renderIntakeStep(); });
  });
  // "About you" — single-select each, and tapping the selected chip clears it
  // again, because every one of these is optional.
  document.querySelectorAll('#prev-experience-grid [data-prev-exp]').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.dataset.prevExp;
      const i = intake.prevExperience.indexOf(v);
      if (i === -1) intake.prevExperience.push(v); else intake.prevExperience.splice(i, 1);
      renderIntakeStep();
    });
  });
  const prevNotes = document.getElementById('prev-notes-input');
  if (prevNotes) prevNotes.addEventListener('input', () => { intake.prevNotes = prevNotes.value; });
  const ageInput = document.getElementById('age-input');
  if (ageInput) ageInput.addEventListener('input', () => { intake.age = ageInput.value.replace(/[^\d]/g, ''); });
  document.querySelectorAll('#self-gender-grid .chip-option[data-self-gender]').forEach(el => {
    el.addEventListener('click', () => {
      intake.selfGender = intake.selfGender === el.dataset.selfGender ? null : el.dataset.selfGender;
      renderIntakeStep();
    });
  });
  document.querySelectorAll('#field-grid .chip-option[data-field]').forEach(el => {
    el.addEventListener('click', () => {
      intake.field = intake.field === el.dataset.field ? null : el.dataset.field;
      intake.fieldOtherOpen = false;
      renderIntakeStep();
    });
  });
  const fieldOtherBtn = document.getElementById('field-other-btn');
  if (fieldOtherBtn) fieldOtherBtn.addEventListener('click', () => { intake.fieldOtherOpen = !intake.fieldOtherOpen; renderIntakeStep(); });
  const fieldOtherSel = document.getElementById('field-other-select');
  if (fieldOtherSel) fieldOtherSel.addEventListener('change', () => { if (fieldOtherSel.value) { intake.field = fieldOtherSel.value; intake.fieldOtherOpen = false; renderIntakeStep(); } });
  const fieldTyped = document.getElementById('field-typed');
  if (fieldTyped) fieldTyped.addEventListener('input', () => { intake.field = fieldTyped.value.trim() || null; });
  const insuranceOtherBtn = document.getElementById('insurance-other-btn');
  if (insuranceOtherBtn) insuranceOtherBtn.addEventListener('click', () => { intake.insuranceOtherOpen = true; renderIntakeStep(); });
  const insuranceOtherSelect = document.getElementById('insurance-other-select');
  if (insuranceOtherSelect) insuranceOtherSelect.addEventListener('change', () => { intake.insurance = insuranceOtherSelect.value; renderIntakeStep(); });
  document.querySelectorAll('#no-insurance-list .option-row').forEach(el => {
    el.addEventListener('click', () => { intake.noInsurancePref = el.dataset.noInsurance; renderIntakeStep(); });
  });
  document.querySelectorAll('#budget-range-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => { intake.budgetRange = el.dataset.budgetRange; renderIntakeStep(); });
  });

  // The "new to me" needs step paginates through theme groups + a final read,
  // so Next/Back walk those sub-stages before moving between intake steps.
  const curStepKey = activeSteps()[intakeStep];
  const inUnsureQuiz = curStepKey === 'needs' && intake.knowsNeeds === 'no';
  const quizGroupCount = [...new Set(UNSURE_OPTIONS.map(o => o.group))].length;

  const backBtn = document.getElementById('intake-back');
  if (backBtn) backBtn.addEventListener('click', () => {
    if (inUnsureQuiz && (intake.quizStage || 0) > 0) { intake.quizStage--; }
    else { intakeStep--; }
    renderIntakeStep();
  });

  document.getElementById('intake-next').addEventListener('click', () => {
    if (inUnsureQuiz && (intake.quizStage || 0) < quizGroupCount) {
      intake.quizStage = (intake.quizStage || 0) + 1;   // next theme group, then the read
      renderIntakeStep();
    } else if (intakeStep < activeSteps().length - 1) {
      intakeStep++;
      renderIntakeStep();
    } else {
      finishIntake();
    }
  });
}

function finishIntake() {
  intake.completed = true;
  saveClientState();                 // keep it on this device so a refresh doesn't wipe it
  clientStore.persistIntake(intake); // no-op until clientDataPersistence flips on (post-BAA)
  computeDeck();
  document.getElementById('bottom-nav').classList.remove('hidden');
  renderStack();
  renderMatches();
  showScreen('discover');
}

// Demo helper: drop straight into a fully-populated client account so every
// client zone (Discover, Short List, Matches, On-Demand, Explore) has content.
function seedClientDemo() {
  accountType = 'client';
  Object.assign(intake, {
    knowsNeeds: 'yes', careFor: 'myself',
    needs: ['Anxiety', 'Burnout', 'Life Transitions'], notSure: false, quizStage: 0,
    modality: 'open', modalityRequired: false, modalityOtherOpen: false,
    stylePref: 'gentle',
    genderPref: 'no-preference', genderRequired: false,
    ethnicityPref: 'no-preference',
    lgbtqRequired: false, affinities: ['LGBTQ+'], faith: [],
    languagePref: 'any', languageRequired: false, languageOtherOpen: false,
    formats: [], availability: ['Evenings', 'Weekends'], mustBeAccepting: false,
    state: '', city: '',
    hasInsurance: 'no', noInsurancePref: 'therapist-first', budgetRange: 'Any budget',
    age: '32', selfGender: 'Female', field: 'Healthcare',
    prevExperience: [], prevNotes: '', completed: false
  });

  // reset client-side collections
  shortlist = [];
  matches.length = 0;
  Object.keys(chatLog).forEach(k => delete chatLog[k]);
  savedResources = ['r1', 'r2', 'r4'];

  const byId = id => THERAPISTS.find(t => t.id === id);
  const [t1, t2, t3, t4, t5, t6] = ['t1', 't2', 't3', 't4', 't5', 't6'].map(byId);

  // Short List — liked, not yet requested
  [t4, t5].filter(Boolean).forEach(t => shortlist.push(t));

  // Matched conversation — accepted, scheduled, a little back-and-forth
  if (t1) {
    matches.push({
      therapist: t1, status: 'matched', needsSnapshot: ['Anxiety', 'Burnout'],
      introMessage: 'Hi!', desiredFrequency: 'Weekly', profileShared: true,
      scheduledDay: 'Tuesday', scheduledTime: '5:00pm',
      portal: { goals: [{ text: 'Name one thing that drained me each day', done: false }], homework: [{ text: '5-4-3-2-1 grounding, once a day', done: true }], resources: [] }
    });
    chatLog[t1.id] = [
      { from: 'me', text: "Hi! I've been dealing with a lot of anxiety at work and could really use some support." },
      { from: 'them', text: "I'm so glad you reached out — that sounds exhausting. I'd love to help. I've got you down for Tuesdays at 5." },
      { from: 'me', text: 'Thank you, that means a lot. See you then!' }
    ];
  }
  // Pending request — waiting on the therapist
  if (t2) {
    matches.push({
      therapist: t2, status: 'pending', needsSnapshot: ['Anxiety', 'Burnout'],
      introMessage: "Your approach really resonated — I've been running on empty and would love to talk.",
      desiredFrequency: 'Weekly', profileShared: true, portal: { goals: [], homework: [], resources: [] }
    });
    chatLog[t2.id] = [{ from: 'me', text: "Your approach really resonated — I've been running on empty and would love to talk." }];
  }
  // Declined — not a fit on their end
  if (t3) {
    matches.push({
      therapist: t3, status: 'declined', needsSnapshot: ['Trauma'],
      introMessage: 'Hi', desiredFrequency: 'Weekly', profileShared: false, portal: { goals: [], homework: [], resources: [] }
    });
    chatLog[t3.id] = [
      { from: 'me', text: 'Hi, I was hoping to work with you.' },
      { from: 'them', text: "Thank you for reaching out. I don't think I'm the right fit right now, but I hope you find someone who is." }
    ];
  }
  // On-Demand — one confirmed, paid session
  if (t6 && Array.isArray(t6.onDemandSlots) && t6.onDemandSlots.length) {
    const slot = t6.onDemandSlots[0].label;
    const [day, ...rest] = slot.split(' ');
    matches.push({
      therapist: t6, status: 'ondemand', slotLabel: slot,
      amountPaid: ondemandPricing(t6).clientTotal, paymentStatus: 'paid',
      sessionDateTime: nextOccurrence(day, rest.join(' ')).toISOString()
    });
  }

  finishIntake();
}

function startIntake() {
  // Resume an unfinished questionnaire instead of throwing away their answers.
  if (!(intake.completed === false && intakeStarted())) intakeStep = 0;
  document.getElementById('bottom-nav').classList.add('hidden');
  renderIntakeStep();
  showScreen('intake');
}

// ===================================================================
// DISCOVER / CARD STACK
// ===================================================================
function renderStack() {
  cardStack.innerHTML = '';
  // The swipe controls are meaningless with nothing to swipe — hide them for
  // loading and every empty state, show them only when a card is present.
  const actionRow = document.getElementById('action-row');
  const setControls = on => { if (actionRow) actionRow.style.display = on ? '' : 'none'; };
  setControls(false);

  if (deckLoading) {
    cardStack.innerHTML = `<div class="empty-pool">Finding your matches…</div>`;
    return;
  }

  if (deck.length === 0) {
    // Two very different situations, and telling someone to "loosen their
    // requirements" when the roster is simply still filling up is bad advice
    // and reads as their fault. Distinguish them.
    if (rosterCount === 0) {
      /* This is the ONLY ending a client reaches today -- nobody is verified
         yet, so every completed intake lands here. It was written as an
         apology for an empty shelf. It now says what is actually happening,
         because "we check every licence by hand" is the reason the shelf is
         empty and the reason it is worth waiting for. */
      cardStack.innerHTML = `<div class="empty-pool">
        <strong>We're building our therapist community right now.</strong><br><br>
        Every therapist on Kindred is licensed and identity-verified before
        they can be matched — and we check each licence by hand, against the
        issuing state board. That takes time, and it's the whole point.<br><br>
        Join the waitlist and you'll be among the first to know when
        therapists arrive. Your answers stay on this device, ready for you.
        <button class="loosen-btn" id="notify-btn">Join the waitlist</button>
      </div>`;
      const nb = document.getElementById('notify-btn');
      if (nb) nb.addEventListener('click', openNotifyMe);
      return;
    }
    cardStack.innerHTML = `<div class="empty-pool">
      No therapists match everything you asked for right now.<br><br>
      Try loosening a must-have requirement to see more options.
      <button class="loosen-btn" id="loosen-btn">Loosen my requirements</button>
    </div>`;
    const btn = document.getElementById('loosen-btn');
    if (btn) btn.addEventListener('click', loosenRequirements);
    return;
  }

  const visible = deck.slice(deckIndex, deckIndex + 3);
  if (visible.length === 0) {
    cardStack.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--ink-soft);padding:0 20px;font-size:14px;">
      You've seen everyone in your matched pool for now.<br><br>Check back soon, or check the On-Demand tab for a sooner option.
    </div>`;
    return;
  }
  // Append back-to-front so the current therapist (visible[0]) ends up as
  // lastElementChild — that's what drag/button handlers treat as "the top card".
  setControls(true);
  const appendOrder = visible.slice().reverse();
  appendOrder.forEach((t, idx) => {
    const depthFromFront = appendOrder.length - 1 - idx; // 0 = current/front card
    const el = buildCard(t);
    el.style.zIndex = 10 + idx;
    el.style.top = `${depthFromFront * 12}px`;
    el.style.left = `${depthFromFront * 8}px`;
    el.style.right = `${depthFromFront * 8}px`;
    el.style.bottom = '0';
    cardStack.appendChild(el);
  });
  const topCard = cardStack.lastElementChild;
  if (topCard) makeDraggable(topCard);
}

function matchTagsHtml(t) {
  const reasons = getMatchReasons(t);
  if (reasons.length === 0) return '';
  return `<div class="match-tag-label">Matched on</div>
    <div class="match-tag-row">${reasons.map(r => `<span class="match-tag">${r}</span>`).join('')}</div>`;
}

function practiceBadgeHtml(t) {
  return t.practiceType === 'generalist' ? `<div class="practice-badge">🌐 General Practice</div>` : '';
}

function displayName(t) {
  return (t.useCompanyName && t.companyName) ? t.companyName : t.name;
}

function avatarHtml(t, sizeClass) {
  return t.photo
    ? `<div class="${sizeClass} photo" style="background-image:url('${t.photo}')"></div>`
    : `<div class="${sizeClass}" style="background:${t.gradient}">${t.initials}</div>`;
}

// A percentage of how directly the client's own stated preferences line up
// with this therapist — never reviews or ratings, and no invented number:
// if the client expressed no preferences at all, this returns null and the
// badge renders without a percent.

// ===== "WHAT WOULD YOU CHANGE?" BOOSTS (experienced-client path) =====
// A returning client telling us what didn't work last time is the strongest
// signal they can give. Like the ideal-client match, these ONLY ever add — a
// therapist is never pushed down for failing to line up, so nobody is filtered
// out of a pool they'd otherwise belong in.
const PREV_EXPERIENCE_SIGNALS = {
  'More direct feedback':            { style: 'direct' },
  'Someone who challenges me':       { style: 'direct' },
  'More structure and homework':     { style: 'direct', modalities: ['CBT', 'DBT', 'ERP', 'ACT'] },
  'Less structure, more space to talk': { style: 'gentle', modalities: ['IFS', 'Psychodynamic', 'Person-Centered'] },
  'Someone gentler':                 { style: 'gentle' },
  'Better at handling trauma':       { tags: ['Trauma', 'PTSD'], modalities: ['EMDR', 'Somatic', 'IFS'] },
  'Someone who shares my identity':  { identity: true }
  // 'A different approach entirely' and 'Nothing — it worked, I moved' carry no
  // directional signal, so they intentionally score nothing.
};

// 0..1 — how well a therapist answers what this client wants done differently.
function prevExperienceScore(t) {
  const picks = (intake.prevExperience || []).filter(p => PREV_EXPERIENCE_SIGNALS[p]);
  if (!picks.length) return 0;
  let earned = 0;
  picks.forEach(p => {
    const sig = PREV_EXPERIENCE_SIGNALS[p];
    let hit = false;
    if (sig.style && (t.style === sig.style || t.style === 'balanced')) hit = true;
    if (!hit && sig.modalities && (t.modalities || []).some(m => sig.modalities.includes(m))) hit = true;
    if (!hit && sig.tags && (t.tags || []).some(x => sig.tags.includes(x))) hit = true;
    if (!hit && sig.identity) {
      // "shares my identity" amplifies whatever identity preferences they set
      const idHits = [
        intake.genderPref !== 'no-preference' && genderBucket((t.identity || {}).gender) === intake.genderPref,
        intake.ethnicityPref !== 'no-preference' && t.ethnicity === intake.ethnicityPref,
        (intake.affinities || []).some(a => (t.affinities || []).includes(a)),
        (intake.faith || []).some(f => (t.faith || []).includes(f))
      ];
      if (idHits.some(Boolean)) hit = true;
    }
    if (hit) earned++;
  });
  return earned / picks.length;
}

// ===== IDEAL-CLIENT MATCHING =====
// A therapist privately describes the client they're the strongest fit for. This
// is NEVER shown to a client and NEVER filters anyone out of anything — a client
// who isn't a "unicorn" still matches normally on the regular criteria. All it
// does is (a) nudge ranking up and (b) earn a sparkle on the THERAPIST's own
// request list so they can spot the clients they're best suited to.
function idealMatchResult(t) {
  const blank = { stated: false, isIdeal: false, score: 0, reasons: [] };
  const ic = t.idealClient;
  if (!ic) return blank;

  const dims = IDEAL_DIMENSIONS.filter(d => (ic[d.key] || []).length > 0);
  const hasPractical = ic.payment !== 'Either' || (ic.availability || []).length > 0;
  if (!dims.length && !hasPractical) return blank;      // no ideal stated

  // PRACTICAL CONSTRAINTS ARE FILTERS (for the ideal flag only). If they can't
  // realistically work together, it isn't an ideal match however well they fit.
  if (ic.payment === 'Cash pay' && intake.hasInsurance === 'yes') return { ...blank, stated: true };
  if (ic.payment === 'Insurance' && intake.hasInsurance === 'no') return { ...blank, stated: true };
  const icAvail = ic.availability || [];
  if (icAvail.length && intake.availability.length &&
      !intake.availability.includes('Anytime') && !icAvail.includes('Anytime') &&
      !icAvail.some(a => intake.availability.includes(a))) return { ...blank, stated: true };

  // IDEAL FIT IS A BOOST. Must-haves simply weigh double — never a gate.
  const clientBand = ageToBand(intake.age); // exact age → life-stage band
  const clientValue = {
    ageBands:  clientBand ? [clientBand] : [],
    genders:   intake.selfGender ? [intake.selfGender] : [],
    fields:    intake.field ? [intake.field] : [],
    needs:     intake.needs || [],
    modalities: (intake.modality && intake.modality !== 'open') ? [intake.modality] : []
  };
  let earned = 0, possible = 0;
  const reasons = [];
  dims.forEach(d => {
    const weight = (ic.mustHaves || []).includes(d.key) ? 2 : 1;
    possible += weight;
    if ((clientValue[d.key] || []).some(v => ic[d.key].includes(v))) {
      earned += weight;
      reasons.push(d.label);
    }
  });
  const score = possible ? earned / possible : 0;
  return { stated: true, isIdeal: possible > 0 && score >= IDEAL_MATCH_THRESHOLD, score, reasons };
}


/* No number, deliberately (decided 2026-08-03).
   The score could never fall below 62 -- it was 62 + (earned/possible)*36 with
   two boosts that only ever added -- so a poor match was unrepresentable and
   the figure was reassurance dressed as measurement. It also argued against
   Kindred's own thesis: matching is a compatibility FILTER, and everyone a
   client sees has already passed it, so a percentage only ranked people who all
   qualified, on preferences they had just stated themselves. "94%" on a person
   someone might trust with their trauma is also the gamified version of that
   decision, which the brand voice rules rule out.
   The match-reason tags do this job honestly: specific, checkable, true. */
function matchBadgeHtml(t) {
  return `<div class="match-badge">Kindred Match</div>`;
}

const LEAF_SVG = `<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 9.5C1.5 4.5 4.5 1.5 9.5 1.5C9.5 6.5 6.5 9.5 1.5 9.5Z" fill="currentColor"/></svg>`;

function traitChipsHtml(t) {
  const styleTraits = {
    direct: ['Direct', 'Goal-oriented'],
    gentle: ['Warm', 'Patient'],
    balanced: ['Warm', 'Collaborative']
  }[t.style] || [];
  const traits = [...styleTraits];
  if (t.identity.lgbtqAffirming) traits.push('LGBTQ+ Affirming');
  if (!traits.length) return '';
  return `<div class="trait-chip-row">${traits.map((tr, i) => `<span class="trait-chip tc-${i % 3}">${LEAF_SVG} ${tr}</span>`).join('')}</div>`;
}

function credentialsLabel(t) {
  const filled = t.credentials.filter(Boolean);
  return filled.length ? filled.join(' • ') : 'Licensed Therapist';
}

function insuranceDisplayLabel(t, opts = {}) {
  if (!opts.preview && intake.hasInsurance === 'yes' && intake.insurance !== 'any') return `Accepts ${intake.insurance}`;
  /* Named explicitly in the therapist's own preview. "Accepts Aetna, BCBS"
     is unambiguous to a client reading a stranger's card, but a therapist
     looking at their own needs to recognise it as THEIR list -- the thing
     they typed -- rather than wonder whose insurance is being described. */
  if (t.insuranceList.length) {
    return opts.preview
      ? `Accepts insurance: ${t.insuranceList.join(', ')}`
      : `Accepts ${t.insuranceList.join(', ')}`;
  }
  /* How they take payment is often what a self-pay client most needs to know
     before reaching out -- a superbill or an HSA card changes the real cost,
     and "Self-pay" alone says none of it. */
  const payLabels = (t.paymentOptions || []).filter(k => k !== 'no_insurance').map(paymentLabel);
  if (payLabels.length) return payLabels.join(' \u00b7 ');
  return t.selfPayNote || 'Self-pay';
}

// True when this therapist is one of the client's active Top 5 (requested,
// pending or matched) — drives the star badge the SME liked.
function isInTop5(t) {
  return matches.some(m => m.therapist.id === t.id && (m.status === 'pending' || m.status === 'matched'));
}

// Hinge-style compact fact row for the detail view — icon + short label,
// wrapping, instead of stacked meta lines.
function detailFactsHtml(t, opts = {}) {
  const fmtIcon = t.formats.length === 2 ? '🎥' : t.formats.includes('video') ? '🎥' : '🏠';
  // Derive format + rate from the LIVE fields so edits show up for clients
  // immediately (the seeded t.meta could be stale after a profile change).
  const meta = buildTherapistMeta(t);
  /* Insurance is a match requirement, so a client with insurance only ever
     sees a therapist who takes it -- hence the verified tick and the
     personalised wording for them.

     PREVIEW MUST NOT GET THAT. `opts.preview` used to be ORed into the
     condition, which forced the personalised phrasing on the one screen where
     there is no "your": a therapist previewing their own card was told
     "Accepts your insurance" and had no way to tell which plans it meant, or
     whose. Preview shows the stored list instead -- and note that
     insuranceDisplayLabel already handled preview correctly, so the wrong
     branch was reaching past a function that had the right answer. */
  const personalised = !opts.preview && intake.hasInsurance === 'yes' && intake.insurance !== 'any';
  const insFact = personalised
    ? ['✅', 'Accepts your insurance']
    : ['🛡️', insuranceDisplayLabel(t, opts)];
  const facts = [
    ['📍', `${t.location.city}, ${t.location.state}`],
    [fmtIcon, meta[0]],
    ['💵', (meta[1] || '').replace('/session', '')],
    insFact
  ];
  if (hasSlidingScale(t)) facts.push(['🤝', 'Sliding scale available']);
  if (t.website) facts.push(['🌐', `<a class="website-link" href="https://${t.website}" target="_blank" rel="noopener">${t.website}</a>`]);
  return `<div class="detail-facts">${facts.filter(f => f[1]).map(([ic, txt]) => `<span class="fact"><span class="fact-ic">${ic}</span>${txt}</span>`).join('')}</div>`;
}

// Only surfaced when it's actually the reason this therapist is showing up —
// a client who didn't ask for a specific language shouldn't see one at all.
function languageBadgeHtml(t) {
  if (intake.languagePref === 'any' || intake.languagePref === 'English') return '';
  if (!t.languages.includes(intake.languagePref)) return '';
  return `<div class="language-badge">🗣️ I speak ${intake.languagePref}</div>`;
}

// The 3 specialties a client sees: 2 from the therapist's chosen top three, and
// 1 that overlaps what the client said they need. If the client named nothing,
// just the therapist's top three.
function displayedSpecialties(t, opts = {}) {
  const top = ((t.topSpecialties && t.topSpecialties.length) ? t.topSpecialties : t.tags).slice(0, 3);
  /* Same rule as the insurance line: a preview must not be personalised to
     whoever happens to be in `intake` on this device. A therapist checking
     their own card would otherwise see a third specialty chosen by a client's
     answers -- their starred three are what they control, so their preview
     shows exactly those. */
  const needs = opts.preview ? [] : (intake.needs || []);
  const overlap = t.tags.filter(x => needs.includes(x));
  if (!needs.length || !overlap.length) return top.slice(0, 3);
  const two = top.slice(0, 2);
  const overlapPick = overlap.find(x => !two.includes(x)) || overlap[0];
  const out = [...two];
  if (overlapPick && !out.includes(overlapPick)) out.push(overlapPick);
  for (const s of top) { if (out.length >= 3) break; if (!out.includes(s)) out.push(s); }
  return out.slice(0, 3);
}

function tagHtml(tag) {
  return MODALITY_INFO[tag]
    ? `<span class="tag tag-clickable" data-info="${tag}">${tag} <span class="info-icon">?</span></span>`
    : `<span class="tag">${tag}</span>`;
}

function promptCardHtml(q, a) {
  return `
    <div class="prompt-block">
      <div class="prompt-q">${q}</div>
      <div class="prompt-a">${a || "I'm still writing this one — check back soon."}</div>
    </div>`;
}

function feedPhotoHtml(src, caption) {
  return `
    <figure class="feed-media">
      <img class="prompt-photo" src="${src}" alt="" loading="lazy">
      ${caption ? `<figcaption class="feed-caption">${caption}</figcaption>` : ''}
    </figure>`;
}

// The Hinge-style scrollable profile: prompts and media interleaved so the
// person comes through, not just the credentials. Same feed on the swipe
// card (scroll down) and the full detail view.
// Photos on a therapist, unified: up to 4. Migrates the old office/outOfOffice
// named slots into the array so existing profiles keep their images.
function therapistPhotos(t) {
  if (t.media && Array.isArray(t.media.photos)) return t.media.photos.filter(Boolean).slice(0, 4);
  return [t.media && t.media.office, t.media && t.media.outOfOffice].filter(Boolean).slice(0, 4);
}

// The "Get to know them" feed renders the therapist's ordered blocks (prompts &
// photos) exactly as they arranged them. The quick-hello video slots in right
// after the first blurb so words still lead.
function profileFeedHtml(t) {
  const firstName = displayName(t).replace(/^Dr\.?\s*/i, '').split(' ')[0];
  const out = [];
  getToKnowBlocks(t).forEach(b => {
    if (b.type === 'prompt') {
      if (!b.answer) return;                       // skip a prompt they haven't answered
      out.push(promptCardHtml(b.question, b.answer));
    } else if (b.type === 'photo' && b.src) {
      out.push(feedPhotoHtml(b.src));
    } else if (b.type === 'video' && b.src) {
      out.push(`
        <div class="feed-media feed-video">
          <video src="${b.src}" controls preload="metadata" playsinline></video>
          <div class="feed-caption">A quick hello from ${firstName}</div>
        </div>`);
    }
  });
  return out.join('');
}

function whyYouMatchHtml(t) {
  const reasons = getMatchReasons(t);
  if (!reasons.length) return '';
  return `
    <div class="why-match-label">Why you match</div>
    <ul class="why-match-list">${reasons.map(r => `<li>${r}</li>`).join('')}</ul>
  `;
}

function capabilityRowHtml(t) {
  const acceptingLabel = t.acceptingOngoing ? 'Accepting new clients' : 'Not accepting new clients';
  return `
    <div class="capability-row">
      <div class="capability-item"><span class="cap-icon">🎥</span>${buildTherapistMeta(t)[0]}</div>
      <div class="capability-item"><span class="cap-icon">🌿</span>${acceptingLabel}</div>
      <div class="capability-item"><span class="cap-icon">🕐</span>${t.nextAvailableLabel}</div>
    </div>
  `;
}

function buildCard(t) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = t.id;
  card.innerHTML = `
    <div class="card-photo" style="background:${t.gradient}">
      ${t.photo ? `<img class="card-photo-img" src="${t.photo}" alt="">` : `<div class="initials">${t.initials}</div>`}
      <div class="stamp like">Like</div>
      <div class="stamp pass">Pass</div>
      ${matchBadgeHtml(t)}
      ${languageBadgeHtml(t)}
      ${!t.acceptingOngoing ? `<div class="not-accepting-banner">Not currently accepting clients — save for later</div>` : ''}
    </div>
    <div class="card-body">
      ${profileCardBodyHtml(t, {})}
    </div>
  `;
  card.querySelectorAll('[data-info]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openModalityInfo(el.dataset.info); });
  });
  card.addEventListener('click', (e) => {
    if (card.dataset.dragged === 'true') { card.dataset.dragged = 'false'; return; }
    openDetail(t);
  });
  return card;
}

function makeDraggable(card) {
  let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false;

  const likeStamp = card.querySelector('.stamp.like');
  const passStamp = card.querySelector('.stamp.pass');

  function down(x, y) {
    dragging = true;
    startX = x; startY = y;
    card.classList.add('dragging');
  }
  function move(x, y) {
    if (!dragging) return;
    curX = x - startX;
    curY = y - startY;
    if (Math.abs(curX) > 6) card.dataset.dragged = 'true';
    const rotate = curX / 14;
    card.style.transform = `translate(${curX}px, ${curY}px) rotate(${rotate}deg)`;
    const progress = Math.min(Math.abs(curX) / 100, 1);
    if (curX > 0) { likeStamp.style.opacity = progress; passStamp.style.opacity = 0; }
    else { passStamp.style.opacity = progress; likeStamp.style.opacity = 0; }
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (curX > 110) { resolveSwipe(card, 'like'); }
    else if (curX < -110) { resolveSwipe(card, 'pass'); }
    else {
      card.style.transform = '';
      likeStamp.style.opacity = 0;
      passStamp.style.opacity = 0;
    }
    curX = 0; curY = 0;
  }

  card.addEventListener('mousedown', (e) => down(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', up);

  card.addEventListener('touchstart', (e) => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
  card.addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
  card.addEventListener('touchend', up);

  card._forceSwipe = (dir) => resolveSwipe(card, dir);
}

function resolveSwipe(card, dir) {
  const t = deck[deckIndex];
  const flyX = dir === 'like' ? 600 : -600;
  card.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
  card.style.transform = `translate(${flyX}px, ${curYOf(card)}px) rotate(${dir === 'like' ? 25 : -25}deg)`;
  card.style.opacity = '0';
  deckIndex++;
  setTimeout(() => {
    renderStack();
    if (dir === 'like') handleLike(t);
  }, 220);
}

function curYOf(card) {
  const m = card.style.transform.match(/translate\([^,]+,\s*(-?\d+(?:\.\d+)?)px\)/);
  return m ? m[1] : 0;
}

function handleLike(t) {
  t.stats.hearts++;
  // Swiping right only shortlists — it sends no signal to the therapist yet.
  // A client picks from the shortlist which ones to actually request,
  // capped at MAX_PENDING_REQUESTS, so a therapist's inbox reflects real
  // intent instead of every impulsive right-swipe.
  if (!shortlist.find(s => s.id === t.id) && !matches.find(m => m.therapist.id === t.id)) {
    shortlist.push(t);
    saveClientState();
  }
  showToast('Added to your shortlist');
  renderShortlist();
}

function sendMatchRequest(therapistId) {
  if (activeRequestCount() >= MAX_PENDING_REQUESTS) return;
  openRequestIntake(therapistId);
}

function activeRequestCount() {
  // Counts against the cap of 5 "real shots": pending asks AND accepted
  // matches both use up a slot permanently. Only a decline frees one —
  // an acceptance is a real outcome, not something to churn through.
  return matches.filter(m => m.status === 'pending' || m.status === 'matched').length;
}

// ===== REQUEST MATCH — BRIEF INTAKE MESSAGE =====
const requestIntakeModal = document.getElementById('request-intake-modal');
const requestIntakeSheet = document.getElementById('request-intake-sheet');

function openRequestIntake(therapistId) {
  const t = shortlist.find(s => s.id === therapistId);
  if (!t) return;
  requestIntakeSheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>A quick note for ${displayName(t)}</h2>
    <div class="intake-sub">This becomes your opening message — keep it short and honest.</div>
    <div class="t-form-label">What brings you to therapy?</div>
    <textarea class="intake-textarea" id="intro-message" rows="3" placeholder="A sentence or two is plenty..."></textarea>
    <div class="t-form-label">How often are you hoping to meet?</div>
    <div class="freq-row">
      <div class="freq-chip-grid" id="freq-count-grid">
        <div class="chip-option selected" data-freq-count="1">1x</div>
        <div class="chip-option" data-freq-count="2">2x</div>
      </div>
      <span class="freq-per">per</span>
      <div class="freq-chip-grid" id="freq-period-grid">
        <div class="chip-option selected" data-freq-period="week">Week</div>
        <div class="chip-option" data-freq-period="month">Month</div>
      </div>
    </div>
    <button class="primary-btn" style="margin-top:16px;background:var(--coral);color:white;" id="submit-request-btn" disabled>Send Match Request</button>
  `;
  requestIntakeModal.classList.remove('hidden');

  let freqCount = 1;
  let freqPeriod = 'week';
  document.querySelectorAll('#freq-count-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#freq-count-grid .chip-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      freqCount = Number(el.dataset.freqCount);
    });
  });
  document.querySelectorAll('#freq-period-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#freq-period-grid .chip-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      freqPeriod = el.dataset.freqPeriod;
    });
  });

  const introInput = document.getElementById('intro-message');
  const submitBtn = document.getElementById('submit-request-btn');
  introInput.addEventListener('input', () => { submitBtn.disabled = introInput.value.trim().length === 0; });
  submitBtn.addEventListener('click', () => {
    const msg = introInput.value.trim();
    if (!msg) return;
    requestIntakeModal.classList.add('hidden');
    confirmMatchRequest(therapistId, msg, `${freqCount}x per ${freqPeriod}`);
  });
}
requestIntakeModal.addEventListener('click', (e) => { if (e.target === requestIntakeModal) requestIntakeModal.classList.add('hidden'); });

function confirmMatchRequest(therapistId, introMessage, desiredFrequency) {
  if (activeRequestCount() >= MAX_PENDING_REQUESTS) return;
  const idx = shortlist.findIndex(s => s.id === therapistId);
  if (idx === -1) return;
  const t = shortlist[idx];
  shortlist.splice(idx, 1);
  matches.push({
    therapist: t, status: 'pending', needsSnapshot: intake.needs.slice(), introMessage, desiredFrequency,
    profileShared: false,
    portal: { goals: [], homework: [], resources: [] }
  });
  t.stats.conversationsStarted++;
  chatLog[therapistId] = [{ from: 'me', text: introMessage }];
  const m = matches[matches.length - 1];
  clientStore.persistMatch(m);                                  // gated by the flag
  clientStore.persistMessage(therapistId, { from: 'me', text: introMessage });
  saveClientState();
  showToast('Match request sent — waiting for them to respond.');
  updateNavBadge();
  renderShortlist();
  renderMatches();
}

function declineRequest(therapistId) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'pending');
  if (!m) return;
  chatLog[therapistId] = chatLog[therapistId] || [];
  m.status = 'declined';
  chatLog[therapistId].push({ from: 'them', text: `Thank you for sharing this with me. I don't think I'm the right fit for what you're looking for right now, but I hope you find someone who is.` });
  renderRequests();
}

function confirmAcceptWithSchedule(therapistId, scheduledDay, scheduledTimeRaw) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'pending');
  if (!m) return;
  const scheduledTime = formatTime12h(scheduledTimeRaw);
  chatLog[therapistId] = chatLog[therapistId] || [];
  m.status = 'matched';
  m.newlyMatched = true;
  m.scheduledDay = scheduledDay;
  m.scheduledTime = scheduledTime;
  chatLog[therapistId].push({ from: 'them', text: `Great — I'd love to move forward. I've got you scheduled for ${scheduledDay}s at ${scheduledTime}, and I'll follow up here to confirm.` });
  renderRequests();
}

function checkForNewMatches() {
  const newly = matches.find(m => m.newlyMatched);
  if (newly) {
    newly.newlyMatched = false;
    showMatchModal(newly.therapist);
  }
  updateNavBadge();
  renderMatches();
}

// ===== THERAPIST SELF-MARKETING =====
// A therapist's own audience is the cheapest growth channel Kindred has, so
// give them a link that lands well for someone with no app and no account:
// the public profile page on the WEBSITE, which funnels into matching.
const KINDRED_SITE_URL = '';   // same origin now — plain paths
function slugifyName(name) {
  return (name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function therapistProfileUrl(t) {
  const ref = t.slug || slugifyName(displayName(t));
  return ref
    ? `${KINDRED_SITE_URL}/profile.html?t=${encodeURIComponent(ref)}`
    : `${KINDRED_SITE_URL}/profile.html?id=${encodeURIComponent(t.id)}`;
}

// Ready-to-post captions. Therapists are busy; giving them the words is the
// difference between "I'll do it later" and it actually going out.
function shareCaptions(t) {
  const first = displayName(t).replace(/^Dr\.?\s*/i, '').split(' ')[0];
  const url = therapistProfileUrl(t);
  return [
    { label: 'Short + direct', text: `I'm on Kindred — a therapy platform that matches people by fit, not by who's first in a directory. Here's my profile:\n${url}` },
    { label: 'Warm / personal', text: `If you've been putting off finding a therapist because the search itself feels exhausting — I get it. I'm on Kindred, where you answer a few questions and get matched on how you actually want to feel in the room.\n\nMy profile: ${url}` },
    { label: 'For your website', text: `Now accepting new clients through Kindred. See my profile and find out if we're a fit: ${url}` },
    { label: 'Email signature', text: `— ${displayName(t)}\nBook or see if we're a fit: ${url}` }
  ];
}

function openShareMyProfile() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  if (!t) return;
  const url = therapistProfileUrl(t);
  const caps = shareCaptions(t);
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Share your profile</h2>
    <div class="intake-sub">Your profile has a public page anyone can open — no app needed. Post it, email it, put it on your website. Everyone who lands there gets matched with you first.</div>

    ${!listingState(t).visible ? `<p class="portal-note" style="background:#fdf1ed;border-radius:12px;padding:10px 12px;">This link won't be live until your profile is &mdash; ${(nextStepToLive(t) || {}).why || 'verification is still in progress'}.</p>` : ''}

    <div class="t-form-label">Your profile link</div>
    <div class="share-link-row">
      <input type="text" class="t-rate-input" id="share-url-input" readonly value="${url}">
      <button class="media-upload-btn" id="share-copy-btn">Copy</button>
    </div>

    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="share-native-btn">↗ Share</button>

    <div class="t-form-label" style="margin-top:20px;">Ready-to-post captions</div>
    <div class="intake-sub" style="margin-top:-4px;">Tap any one to copy it.</div>
    ${caps.map((c, i) => `
      <div class="share-caption" data-share-caption="${i}">
        <div class="share-caption-label">${c.label}</div>
        <div class="share-caption-text">${c.text.replace(/\n/g, '<br>')}</div>
      </div>`).join('')}

    <p class="portal-note">Kindred never shares client information — this page only shows what clients already see on your profile.</p>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close'); if (sc) sc.addEventListener('click', close);

  const copy = (text, msg) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast(msg)).catch(() => showToast('Copy failed — select and copy manually.'));
    } else { showToast('Copy this: ' + text); }
  };
  document.getElementById('share-copy-btn').addEventListener('click', () => copy(url, 'Link copied.'));
  document.getElementById('share-native-btn').addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({ title: `${displayName(t)} on Kindred`, text: caps[0].text, url }).catch(() => {});
    } else { copy(caps[0].text, 'Caption + link copied.'); }
  });
  sheet.querySelectorAll('[data-share-caption]').forEach(el => el.addEventListener('click', () => {
    copy(caps[Number(el.dataset.shareCaption)].text, 'Caption copied — paste it anywhere.');
  }));
}

// ===== SHARE A THERAPIST =====
// Word of mouth is how most people actually find a therapist. This shares the
// THERAPIST's public profile — never anything about the client doing the
// sharing. The link deep-links straight to that therapist (see the #therapist=
// handler at the bottom of this file).
function shareTherapist(t) {
  const url = `${location.origin}${location.pathname}#therapist=${t.id}`;
  const text = `I found ${displayName(t)} on Kindred${t.bestFor ? ` — “${t.bestFor}”` : ''}`;
  if (navigator.share) {
    navigator.share({ title: `${displayName(t)} on Kindred`, text, url })
      .then(() => showToast('Shared — thank you for passing it on.'))
      .catch(() => {}); // dismissing the share sheet isn't an error
    return;
  }
  const fallback = `${text}\n${url}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fallback)
      .then(() => showToast('Link copied — paste it to whoever needs it.'))
      .catch(() => showToast('Copy this: ' + url));
  } else {
    showToast('Copy this: ' + url);
  }
}

function showToast(message) {
  const toast = document.getElementById('waitlist-toast');
  if (message) toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

function updateNavBadge() {
  const matchedCount = matches.filter(m => m.status === 'matched').length;
  if (matchedCount > 0) {
    navBadge.textContent = matchedCount;
    navBadge.classList.remove('hidden');
  }
}

// ===== DETAIL MODAL =====
const detailModal = document.getElementById('detail-modal');
const detailSheet = document.getElementById('detail-sheet');

// The client-facing profile body. Shared so a therapist's "View Profile" tab
// renders exactly what a client sees — one source of truth, no drift.
// opts.inline omits the close/like/share buttons (the tab has its own chrome).
// Everything below the photo. Shared by the detail view, the therapist's
// "View Profile", AND the Discover swipe card, so all three read identically.
function profileCardBodyHtml(t, opts = {}) {
  const preview = opts.preview === true;
  return `
    <div class="card-name-row" style="margin-top:14px;"><h2>${displayName(t)}</h2><span class="creds">${credentialsLabel(t)}</span></div>
    ${t.pronouns ? `<div class="pronouns-label">${t.pronouns}</div>` : ''}
    <div class="detail-badge-row">
      ${(!preview && isInTop5(t)) ? `<span class="top5-chip">★ In your Top 5</span>` : ''}
      ${t.licenseVerified ? `<span class="verified-chip">✓ License verified</span>` : ''}
    </div>
    ${detailFactsHtml(t, { preview })}
    ${t.bestFor ? `<div class="best-for">${t.bestFor}</div>` : ''}
    <!-- Headings used to render whether or not anything sat under them, so an
         empty profile showed a client the word "Specialties" followed by
         nothing and a "Get to Know Them" section with no content. Publishing is
         gated on both now, so this should be unreachable for a live profile --
         but the therapist's own PREVIEW renders through here too, and an
         honest preview of an unfinished profile is exactly what tells them
         what is missing. An empty heading is never the useful version. -->
    ${(() => {
      const specs = displayedSpecialties(t, { preview });
      return specs.length
        ? `<div class="section-title spec-title">Specialties</div>
           <div class="tag-row spec-tags">${specs.map(tagHtml).join('')}</div>`
        : (preview ? `<div class="profile-gap-note">No specialties yet &mdash; clients filter on these, so your profile can't go live without at least one.</div>` : '');
    })()}
    ${practiceBadgeHtml(t)}
    ${preview ? '' : matchTagsHtml(t)}
    ${(() => {
      const feed = profileFeedHtml(t);
      const empty = !feed || !String(feed).trim();
      if (empty) {
        return preview
          ? `<div class="profile-gap-note">Nothing here yet &mdash; this is the part clients read to decide if you're someone they can talk to. One answer is enough to go live.</div>`
          : '';
      }
      return `<div class="get-to-know">
      <div class="get-to-know-title">Get to Know Them</div>
      ${feed}
    </div>`;
    })()}`;
}

function profileCardHtml(t, opts = {}) {
  const preview = opts.preview === true;
  return `
    ${preview && !opts.inline ? `<div class="preview-banner">👀 This is what clients see when they view your profile</div>` : ''}
    <div class="card-photo detail-photo" style="background:${t.gradient};">
      ${t.photo ? `<img class="card-photo-img" src="${t.photo}" alt="">` : `<div class="initials">${t.initials}</div>`}
      ${preview ? '' : matchBadgeHtml(t)}
      ${preview ? '' : languageBadgeHtml(t)}
      <!-- The initials block is the single biggest thing on the card and, with
           no photo, it is the whole first impression: a coloured rectangle
           where a face should be. In the therapist's own preview, say so over
           the top of it -- this is the one place the absence is obvious at the
           size a client sees it. -->
      ${(preview && !t.photo) ? `<label class="photo-prompt">
        <span class="photo-prompt-title">Add a photo of you</span>
        <span class="photo-prompt-body">Clients decide who to open up to by looking at a face. Your profile can't go live without one.</span>
        <span class="photo-prompt-btn">Choose a photo</span>
        <input type="file" accept="image/*" data-media-upload="photo" hidden>
      </label>` : ''}
      ${!t.acceptingOngoing ? `<div class="not-accepting-banner">Not currently accepting clients — save for later</div>` : ''}
    </div>
    ${profileCardBodyHtml(t, opts)}`;
}

function openDetail(t, opts = {}) {
  const preview = opts.preview === true;
  if (!preview) t.stats.profileViews++;
  detailSheet.innerHTML = `
    <div class="sheet-close"></div>
    ${profileCardHtml(t, { preview })}
    ${preview
      ? `<button class="primary-btn" style="margin-top:20px;background:white;border:1.5px solid var(--coral);color:var(--coral-dark);" id="detail-close-btn">Close Preview</button>`
      : `<button class="primary-btn" style="margin-top:20px;background:var(--coral);color:white;" id="detail-like-btn">Add to Shortlist</button>
         <button class="primary-btn share-therapist-btn" id="detail-share-btn">↗ Share this therapist with someone</button>`}
  `;
  detailModal.classList.remove('hidden');
  detailSheet.querySelectorAll('[data-info]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openModalityInfo(el.dataset.info); });
  });
  if (preview) {
    document.getElementById('detail-close-btn').addEventListener('click', () => detailModal.classList.add('hidden'));
  } else {
    document.getElementById('detail-like-btn').addEventListener('click', () => {
      detailModal.classList.add('hidden');
      const topCard = cardStack.lastElementChild;
      if (topCard && topCard.dataset.id === t.id && topCard._forceSwipe) topCard._forceSwipe('like');
    });
    document.getElementById('detail-share-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      shareTherapist(t);
    });
  }
}
detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.classList.add('hidden'); });

// ===== MATCH MODAL =====
const matchModal = document.getElementById('match-modal');
function showMatchModal(t) {
  document.getElementById('match-name').textContent = displayName(t);
  const avatar = document.getElementById('match-avatar');
  if (t.photo) {
    avatar.classList.add('photo');
    avatar.style.background = `url('${t.photo}') center top / cover`;
    avatar.textContent = '';
  } else {
    avatar.classList.remove('photo');
    avatar.style.background = t.gradient;
    avatar.textContent = t.initials;
  }
  matchModal.classList.remove('hidden');
  matchModal.dataset.tid = t.id;
}
document.getElementById('match-keep-swiping').addEventListener('click', () => matchModal.classList.add('hidden'));
document.getElementById('match-message-btn').addEventListener('click', () => {
  const tid = matchModal.dataset.tid;
  matchModal.classList.add('hidden');
  const m = matches.find(m => m.therapist.id === tid);
  if (m) openChat(m.therapist);
});

// ===== MATCHES LIST =====
const matchesList = document.getElementById('matches-list');
const shortlistList = document.getElementById('shortlist-list');

function renderShortlist() {
  const atCap = activeRequestCount() >= MAX_PENDING_REQUESTS;
  if (shortlist.length === 0) {
    shortlistList.innerHTML = `<p class="empty-state">Nothing saved yet — swipe right on someone in Discover to add them here.</p>`;
    return;
  }
  shortlistList.innerHTML = shortlist.slice().reverse().map(t => `
    <div class="match-row shortlist-row">
      ${avatarHtml(t, 'avatar-md')}
      <div><div class="chat-name">${displayName(t)}</div><div class="last-msg">Saved — not yet requested</div></div>
      <button class="shortlist-request-btn" data-tid="${t.id}" ${atCap ? 'disabled' : ''}>${atCap ? 'Limit reached' : 'Request Match'}</button>
    </div>
  `).join('');
  shortlistList.querySelectorAll('.shortlist-request-btn').forEach(btn => {
    btn.addEventListener('click', () => sendMatchRequest(btn.dataset.tid));
  });
}

function renderMatches() {
  if (matches.length === 0) {
    matchesList.innerHTML = `<p class="empty-state">No requests sent yet — head to your Short List to pick your Top 5.</p>`;
    return;
  }
  let html = `<div class="request-cap-banner">${activeRequestCount()} of ${MAX_PENDING_REQUESTS} Top 5 slots used</div>`;
  html += matches.slice().reverse().map(m => {
    const t = m.therapist;
    const log = chatLog[t.id] || [];
    const last = log[log.length - 1];
    if (m.status === 'pending') {
      return `<div class="match-row" data-id="${t.id}">
        ${avatarHtml(t, 'avatar-md')}
        <div><div class="chat-name"><span class="top5-star">★</span>${displayName(t)}</div><div class="last-msg">${last ? last.text : 'Waiting on their response…'}</div></div>
        <span class="pending-tag">Requested</span>
      </div>`;
    }
    if (m.status === 'ondemand') {
      if (m.paymentStatus === 'authorized') {
        return `<div class="match-row pending" data-id="${t.id}">
          ${avatarHtml(t, 'avatar-md')}
          <div><div class="chat-name">${displayName(t)}</div><div class="last-msg">Awaiting their confirmation — $${m.amountPaid} authorized, not yet charged</div></div>
          <button class="cancel-session-btn" data-release-ondemand="${t.id}">Cancel</button>
        </div>`;
      }
      if (m.paymentStatus !== 'paid') {
        return `<div class="match-row pending" data-id="${t.id}" style="opacity:0.5;">
          ${avatarHtml(t, 'avatar-md')}
          <div><div class="chat-name">${displayName(t)}</div><div class="last-msg">${refundStatusLabel(m.paymentStatus)}</div></div>
        </div>`;
      }
      return `<div class="match-row pending" data-id="${t.id}">
        ${avatarHtml(t, 'avatar-md')}
        <div>
          <div class="chat-name">${displayName(t)}</div>
          <div class="last-msg">One-time session confirmed — ${m.slotLabel} · $${m.amountPaid} paid</div>
          <button class="noshow-link" data-noshow-ondemand="${t.id}">Therapist didn't show?</button>
        </div>
        <button class="cancel-session-btn" data-cancel-ondemand="${t.id}">Cancel</button>
      </div>`;
    }
    if (m.status === 'declined') {
      return `<div class="match-row pending" data-id="${t.id}" style="opacity:0.5;">
        ${avatarHtml(t, 'avatar-md')}
        <div><div class="chat-name">${displayName(t)}</div><div class="last-msg">Not a fit on their end right now</div></div>
      </div>`;
    }
    return `<div class="match-row" data-id="${t.id}">
      ${avatarHtml(t, 'avatar-md')}
      <div><div class="chat-name"><span class="top5-star">★</span>${displayName(t)}</div><div class="last-msg">${last ? last.text : 'Say hello!'}</div></div>
    </div>`;
  }).join('');

  matchesList.innerHTML = html;

  // Pending and matched rows both open the same chat — messaging is available
  // before a therapist accepts, not gated behind it. Declined/on-demand rows
  // are closed threads, so they stay non-interactive.
  matchesList.querySelectorAll('.match-row:not(.pending)').forEach(row => {
    row.addEventListener('click', () => {
      const m = matches.find(m => m.therapist.id === row.dataset.id);
      if (m) openChat(m.therapist, 'client');
    });
  });
  matchesList.querySelectorAll('[data-cancel-ondemand]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); requestCancelOndemand(btn.dataset.cancelOndemand); });
  });
  // Cancelling while still authorized just releases the hold — the
  // cancellation tiers only exist once a payment has actually processed.
  matchesList.querySelectorAll('[data-release-ondemand]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = matches.find(m => m.therapist.id === btn.dataset.releaseOndemand && m.status === 'ondemand' && m.paymentStatus === 'authorized');
      if (!m) return;
      m.paymentStatus = 'released';
      showToast('Request cancelled — the hold was released, you were not charged.');
      renderMatches();
    });
  });
  matchesList.querySelectorAll('[data-noshow-ondemand]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); reportNoShow(btn.dataset.noshowOndemand); });
  });
}

// ===== CHAT SCREEN =====
// Messaging works before a therapist accepts, not after — chatRole tracks
// which side of the conversation we're currently viewing/sending as, since
// this prototype simulates both the client and the therapist in one session.
function openChat(t, role) {
  chatRole = role || 'client';
  const av = document.getElementById('chat-avatar');
  const statusEl = document.querySelector('#screen-chat .chat-status');
  if (chatRole === 'therapist') {
    document.getElementById('chat-name').textContent = 'Prospective Client';
    av.classList.remove('photo');
    av.style.backgroundImage = '';
    av.style.background = 'linear-gradient(135deg,#9a9088,#6b6560)';
    av.textContent = '?';
    statusEl.textContent = `Replying as ${displayName(t)}`;
  } else {
    document.getElementById('chat-name').textContent = displayName(t);
    if (t.photo) {
      av.classList.add('photo');
      av.style.background = `url('${t.photo}') center top / cover`;
      av.textContent = '';
    } else {
      av.classList.remove('photo');
      av.style.background = t.gradient;
      av.textContent = t.initials;
    }
    statusEl.textContent = 'Usually replies within a day';
  }
  // The between-sessions portal only exists for an established (matched)
  // client-therapist pair, and only the client views it from chat — the
  // therapist manages it from their Home schedule.
  const m = matches.find(m => m.therapist.id === t.id && m.status === 'matched');
  document.getElementById('between-sessions-btn').classList.toggle('hidden', !(chatRole === 'client' && m));
  document.getElementById('between-sessions-btn').dataset.tid = t.id;
  document.getElementById('chat-input').dataset.tid = t.id;
  renderChatMessages(t.id);
  showScreen('chat');
}

// A therapist pays first and verifies afterwards, so there is a window where
// they are being billed and still invisible. Never let that be silent -- say
// what is missing and what to do about it, everywhere they might look.
const GETTING_STARTED_KEY = 'kindred-getting-started-done';

/* The welcome page explains the four steps beautifully -- and a therapist sees
   it exactly once, at the moment they least want to read: they have just paid
   and want to build their profile. The same content, tracked against their real
   state, belongs where they will actually be when the question occurs to them.

   This replaces the old verification banner rather than sitting beside it: two
   overlapping "here is what is outstanding" boxes is worse than one. */
function gettingStartedHtml(t) {
  if (!t) return '';

  /* Was `!!t.name`. A name is not a profile -- see profileGaps(). */
  const gaps = profileGaps(t);
  const hasProfile = gaps.length === 0;
  /* Ideal Client sits on its own tab in the profile editor and nothing pointed
     at it, so it was easy to finish setup having never opened it. The bar is
     engagement, not completeness: any one of these means they have been in
     there and made a decision. Requiring a specific field would block the
     therapist whose top specialties already say it. */
  const ic = t.idealClient || {};
  const hasIdeal = ['needs', 'ageBands', 'fields', 'genders', 'modalities', 'availability', 'mustHaves']
    .some(k => Array.isArray(ic[k]) && ic[k].length > 0);
  const licences = t.licenses || [];
  const hasLicence = licences.length > 0;
  const deniedLicence = licences.find(l => l.rejectedAt);
  /* ORDER IS THE PRODUCT DECISION, not a layout choice.
     Payment used to be step one: a card before a therapist had seen how
     Kindred represents them, on a marketplace with nobody in it yet. Building
     the profile IS the pitch -- it is where they see themselves described by
     how they work rather than by their credentials -- so it comes first and
     costs nothing.

     Activation is the paywall, and licence checking sits AFTER it on purpose:
     hand-verifying a state board takes real time, and spending it on people
     who never activate is work with no return. */
  /* ONLY THE STEPS THAT GATE VISIBILITY BELONG IN THE COUNT.
     "Describe your ideal client" used to sit at position two and count toward
     the total, but it has never gated anything -- a therapist can be fully
     live with it untouched. So the list said "3 of 6" while mixing four things
     that stop clients seeing you with one that doesn't, and the arithmetic
     could not be reconciled by reading it. It is still offered, below the
     list, outside the number.

     ORDER IS THE PRODUCT DECISION, not layout. Payment used to be step one: a
     card before a therapist had seen how Kindred represents them, on a
     marketplace with nobody in it yet. Building the profile IS the pitch, so it
     comes first and costs nothing. Licence checking sits AFTER payment on
     purpose -- hand-verifying a state board takes real time, and spending it on
     people who never activate is work with no return. */
  const licenceDone = hasLicence && !deniedLicence;
  const steps = [
    { key: 'profile',  done: hasProfile,          title: 'Build your profile', mine: true,
      /* Names the missing thing rather than restating the step. "Build your
         profile" with a generic blurb beside it is unactionable when the only
         gap is one unanswered prompt, and it was how a profile with an empty
         Specialties heading passed for finished. */
      body: hasProfile
        ? 'Your therapy style, who you work best with, what sessions feel like.'
        : `Clients can't see you until this has ${gaps.join(' and ')}. Everything else is optional.`,
      action: hasProfile ? null : { label: 'Build my profile', id: 't-gs-profile' } },
    /* THE PAYMENT STEP IS GONE. Signing up costs nothing and the first six
       months are free, so there is nothing to select, nothing to activate and
       no card to take. It used to sit here as step two -- a paywall between a
       therapist and the thing they came to do.
       Renewal is not a checklist item either: it happens once, six months
       later, and lives in the banner and in Settings where a billing decision
       belongs. A list called "what's left before clients see you" should only
       ever contain things that are actually left. */
    { key: 'licence',  done: licenceDone, title: 'Add your license(s)', mine: true,
      body: deniedLicence
        ? `${deniedLicence.state}: ${String(deniedLicence.rejectedReason || '').replace(/[<>&]/g, '')}`
        : hasLicence
          ? licences.map(l => l.state + ' ' + l.number).join(' &middot; ')
          : 'One per state &mdash; number and expiry date, checked against that board separately.',
      action: licenceDone ? null
            : { label: hasLicence ? 'Fix my license' : 'Add my license', id: 't-gs-licence' } },
    { key: 'identity', done: !!t.identityVerified, title: 'Verify your identity', mine: true,
      body: 'A photo of your ID and a selfie, through Stripe. About a minute.',
      action: t.identityVerified ? null : { label: 'Verify my ID', id: 't-gs-id' } },
    { key: 'check',    done: !!t.licenseVerified,  title: 'We check your license',
      body: 'A real person confirms it against your state board. Nothing for you to do.' }
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  // Once they are live, this has done its job -- let them put it away for good.
  if (allDone) {
    try { if (localStorage.getItem(GETTING_STARTED_KEY) === 'dismissed') return ''; } catch (e) {}
  }

  /* Derived, not re-derived. These two lines used to spell the rule out again
     by hand right here, while Settings spelled out a DIFFERENT rule of its own
     -- which is exactly how the same screen ended up claiming a profile was
     both invisible and live. One function decides now.

     Note publishing is driven by billing, licence and identity -- NOT by this
     checklist. A therapist can be live with the ideal-client step outstanding,
     and telling them they are "getting set up" would be plainly false while
     clients are already seeing them. */
  const s = listingState(t);
  const stuck = s.stuck;    // subscribed and invisible: the leak
  const live  = s.visible;  // the only outcome that serves a client
  if (stuck) kTrack('app_paying_but_invisible', true);
  if (live) kTrack('app_therapist_live', true);
  if (allDone) kTrack('app_setup_complete', true);
  const lead = listingLead(t, { allDone });

  const items = steps.map(s => {
    const state = s.done ? 'done' : s.mine ? 'todo' : 'waiting';
    const mark = s.done ? '&#10003;' : s.mine ? '' : '&middot;';
    return `<li class="gs-step is-${state}">
      <span class="gs-mark">${mark}</span>
      <div>
        <p class="gs-title">${s.title}${!s.done && !s.mine ? ' <span class="gs-tag">waiting on us</span>' : ''}</p>
        <p class="gs-body">${s.body}</p>
        ${(!s.done && s.action) ? `<button class="gs-action" id="${s.action.id}">${s.action.label}</button>` : ''}
      </div>
    </li>`;
  }).join('');

  return `
    <div class="getting-started ${allDone ? 'is-complete' : ''} ${stuck ? 'is-stuck' : ''}">
      <div class="gs-head">
        <p class="gs-lead">${lead}</p>
        ${allDone ? '<button class="gs-dismiss" id="t-gs-dismiss" aria-label="Dismiss">&#10005;</button>' : `<span class="gs-count">${doneCount} of ${steps.length}</span>`}
      </div>
      <ol class="gs-steps">${items}</ol>
      ${hasIdeal ? '' : `
      <!-- OUTSIDE the list and outside the count, on purpose. It does not gate
           anything: a therapist is live without it. Inside the count it made
           "3 of 6" unreadable, because four of the six were blockers and this
           one was advice. -->
      <div class="gs-optional">
        <p class="gs-optional-title">Optional &mdash; sharpens who reaches you</p>
        <p class="gs-optional-body">Describe your ideal client: ages, what they're working on, how they want to work. Private to you, and it makes your matches more accurate. This doesn't affect whether you go live.</p>
        <button class="gs-action gs-action-quiet" id="t-gs-ideal">Describe my ideal client</button>
      </div>`}
    </div>`;
}

function wireGettingStarted() {
  const id = document.getElementById('t-gs-id');
  if (id) id.addEventListener('click', () => startIdentityVerification(id));
  const lic = document.getElementById('t-gs-licence');
  if (lic) lic.addEventListener('click', openLicenseNumberField);
  const prof = document.getElementById('t-gs-profile');
  if (prof) prof.addEventListener('click', () => { profileMode = 'edit'; showTScreen('t-profile'); });
  /* The paywall. Sends them to the website's activate page rather than trying
     to take money in the app -- that is what keeps Apple out of it entirely.
     LATER, once there are clients: this step is the place for "N people in
     your state are waiting", which is the strongest possible reason to
     activate. It needs client_notify to store state, which it deliberately
     does not today -- that is a privacy decision to revisit, not an oversight. */
  const act = document.getElementById('t-gs-activate');
  if (act) act.addEventListener('click', () => {
    /* Shows the offer here rather than navigating to a page that shows the
       same offer again. It used to be: button -> activate.html (offer card)
       -> Continue -> Stripe. Two screens making the same promise, with a page
       load between them. Now: button -> this modal -> Stripe. */
    openActivateProfile();
  });
  const ideal = document.getElementById('t-gs-ideal');
  if (ideal) ideal.addEventListener('click', () => { profileMode = 'ideal'; showTScreen('t-profile'); });
  const dis = document.getElementById('t-gs-dismiss');
  if (dis) dis.addEventListener('click', () => {
    try { localStorage.setItem(GETTING_STARTED_KEY, 'dismissed'); } catch (e) {}
    renderTherapistInsights();
  });
}

// Kept as the name the render sites already call.
function verificationBannerHtml(t) { return gettingStartedHtml(t); }

// The licence number sits inside a collapsed "Additional Details" section of
// Edit Profile -- findable, but not discoverable. Jump straight to it.
function openLicenseNumberField() {
  profileMode = 'edit';          /* the editor, not Ideal Client or View */
  editSectionsOpen.additional = true;
  showTScreen('t-profile');      /* also calls renderTherapistProfile() */
  setTimeout(() => {
    const el = document.getElementById('t-lic-state');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  }, 120);
}

// ===== STRIPE IDENTITY =====
// Proves the person is who they claim. Separate from the license check, which
// proves the credential exists -- a state board registry is public, so a real
// license number in the wrong hands would otherwise sail through.
//
// The session is created SERVER-SIDE (the Edge Function holds the Stripe secret
// key) and the flag is set by the webhook, never here. Returning from Stripe
// only tells us they finished the flow, not that they passed it.
function identityStatus(t) {
  if (!t) return 'unknown';
  if (t.identityVerified) return 'verified';
  return t.stripeIdentityStarted ? 'pending' : 'not-started';
}

async function startIdentityVerification(btn) {
  const session = loadAuthSession();
  if (!session || !session.access_token) { showToast('Please log in again.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Opening Stripe...'; }
  try {
    const res = await fetch(`${KINDRED_DB.url}/functions/v1/identity-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KINDRED_DB.key,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      showToast(data.error === 'no_therapist_profile'
        ? 'Finish your profile first.'
        : "Couldn't start verification. Try again in a moment.");
      if (btn) { btn.disabled = false; btn.textContent = 'Verify my ID'; }
      return;
    }
    // Stripe hosts the document capture: no ID images ever touch Kindred.
    window.location.href = data.url;
  } catch (err) {
    showToast("Couldn't reach verification. Check your connection.");
    if (btn) { btn.disabled = false; btn.textContent = 'Verify my ID'; }
  }
}

// ===== LICENSE VERIFICATION =====
// openStripeVerification() lived here: a setTimeout that always reported
// success, behind Stripe Identity branding. Removed rather than fixed --
// Stripe Identity verifies government ID documents, not professional licenses
// against state boards, so there was no API to swap in. Verification is a
// manual state-board lookup; the admin sets license_verified via the
// service-role function verify_therapist_license() (migration 0009).

// Adding a licensed state. This used to open a Stripe-branded sheet that
// "checked the state registry" via setTimeout and always passed -- a therapist
// could self-grant all 50 states. It now states plainly that the state is
// pending review. The real gate is therapists.license_verified (migration
// 0009), which an admin sets only after checking the state board's registry,
// and which isCompatible() requires before a therapist is shown to anyone.
function openStateLicenseNotice(t, state, onAdded) {
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Add your ${state} license</h2>
    <div class="intake-sub">We check every license against the ${state} board's registry by hand before you're matched with anyone there. Add it now and we'll confirm it as part of reviewing your profile.</div>
    <button class="primary-btn" id="state-add-btn">Add ${state}</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close');
  if (sc) sc.addEventListener('click', close);
  document.getElementById('state-add-btn').addEventListener('click', () => { close(); onAdded(); });
}

// ===== BETWEEN-SESSIONS PORTAL =====
// One portal per matched pair. The therapist fills it (goals / homework /
// resources); the client reads it and can tick homework off. It also holds
// the therapist-facing view of the client's shared profile.
const PORTAL_SECTIONS = [
  { key: 'goals', label: 'Goals', icon: '🎯', placeholder: 'e.g. Practice saying no once this week' },
  { key: 'homework', label: 'Homework', icon: '📝', placeholder: 'e.g. 5-4-3-2-1 grounding, once a day' },
  { key: 'resources', label: 'Resources', icon: '🌿', placeholder: 'e.g. Ch. 2 of "Self-Compassion"' }
];

// The full picture a matched therapist sees when a client shares their
// profile — also what the client previews before deciding to share.
function sharedProfileBodyHtml() {
  const savedList = EXPLORE_RESOURCES.filter(r => savedResources.includes(r.id));
  return `
    <div class="pref-item"><div class="pref-label">Looking for support with</div><div class="pref-value">${needsSummary()}</div></div>
    <div class="pref-item"><div class="pref-label">What kind of guidance they want</div><div class="pref-value">${guidanceSummary()}</div></div>
    <div class="pref-item"><div class="pref-label">Type of therapy in mind</div><div class="pref-value">${modalitySummary()}</div></div>
    <div class="pref-item"><div class="pref-label">Session format</div><div class="pref-value">${formatSummary()}</div></div>
    <div class="pref-item"><div class="pref-label">When they can meet</div><div class="pref-value">${availabilitySummary()}</div></div>
    <div class="pref-item"><div class="pref-label">Identity preferences</div><div class="pref-value">${identitySummary()}</div></div>
    <div class="pref-item"><div class="pref-label">Saved resources</div><div class="pref-value">${savedList.length ? savedList.map(r => `${r.icon} ${r.title}`).join('<br>') : 'None saved yet.'}</div></div>
  `;
}

function clientProfileSummaryHtml(m) {
  if (!m.profileShared) {
    return `<div class="portal-note">This client hasn't shared their profile. They can turn on sharing from their own profile page whenever they're ready.</div>`;
  }
  return sharedProfileBodyHtml();
}

// Client-side preview of exactly what a therapist sees when sharing is on.
// ===== DELETE ACCOUNT (client) =====
// Deleting is permanent and people often reach for it when they just want a
// break. Leading with what they'd lose — the therapists they've saved — gives
// them a real reason to stay without guilt-tripping or hiding the delete.
function openDeleteAccountSheet() {
  const savedCount = matches.filter(m => m.status === 'matched' || m.status === 'pending').length;
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Delete your account?</h2>
    <div class="intake-sub">Before you go — you don't have to delete anything to take a break.</div>

    <div class="keep-card">
      <p><strong>Keep the app downloaded so you can save all your favorite therapists</strong> in case you need them in the future.</p>
      <p class="keep-card-sub">${savedCount ? `You have ${savedCount} therapist${savedCount === 1 ? '' : 's'} saved. Finding someone who fits is the hard part — you won't have to do it twice.` : `Finding someone who fits is the hard part. Keeping your account means you won't have to do it twice.`}</p>
      <p class="keep-card-sub">It's free to keep, and nothing happens while you're away — no emails, no notifications.</p>
    </div>

    <p class="modality-info-text">Deleting is permanent. Your saved therapists, matches, conversations, and preferences are all removed and can't be recovered.</p>

    <button class="primary-btn" style="background:var(--coral);color:white;" id="keep-account-btn">Keep my account</button>
    <button class="edit-prefs-btn" id="logout-instead-btn">Just log me out instead</button>
    <button class="edit-prefs-btn" id="confirm-delete-btn" style="color:#a8443a;">Delete my account</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  document.getElementById('keep-account-btn').addEventListener('click', () => {
    close();
    showToast('Your account is safe — your therapists are still here.');
  });
  document.getElementById('logout-instead-btn').addEventListener('click', () => { close(); logout(); });
  document.getElementById('confirm-delete-btn').addEventListener('click', () => { close(); confirmDeleteAccount(); });
}

// Second, deliberate confirmation — a destructive, irreversible action should
// never be one tap away.
function confirmDeleteAccount() {
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>This can't be undone</h2>
    <div class="intake-sub">Everything you've saved will be permanently deleted.</div>
    <button class="primary-btn" style="background:var(--coral);color:white;" id="delete-cancel-btn">Never mind, keep my account</button>
    <button class="edit-prefs-btn" id="delete-final-btn" style="color:#a8443a;">Yes, delete everything</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  document.getElementById('delete-cancel-btn').addEventListener('click', close);
  document.getElementById('delete-final-btn').addEventListener('click', () => {
    close();
    matches.length = 0;
    savedResources.length = 0;
    showToast('Your account has been deleted.');
    logout();
  });
}

function openSharedProfilePreview() {
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>What your therapist sees</h2>
    <div class="intake-sub">When you turn on sharing for a therapist, this is the snapshot they get — nothing more. You can turn it off anytime.</div>
    ${sharedProfileBodyHtml()}
    <button class="primary-btn" style="margin-top:16px;background:var(--coral);color:white;" id="shared-preview-close">Got it</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('shared-preview-close').addEventListener('click', () => document.getElementById('confirm-modal').classList.add('hidden'));
}

function openTherapistPortal(therapistId) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'matched');
  if (!m) return;
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Client Portal</h2>
    <div class="intake-sub">What this client sees between sessions — and what they've chosen to share with you.</div>
    <div class="section-title">Their shared profile</div>
    ${clientProfileSummaryHtml(m)}
    ${PORTAL_SECTIONS.map(s => `
      <div class="section-title">${s.icon} ${s.label}</div>
      ${m.portal[s.key].length ? m.portal[s.key].map((item, i) => `
        <div class="portal-item">
          <span class="portal-item-text">${s.key === 'homework' && item.done ? '✅ ' : ''}${s.key === 'homework' ? item.text : item}${s.key === 'homework' && item.done ? ' <em class="portal-done-note">— done</em>' : ''}</span>
          <button class="portal-remove" data-portal-remove="${s.key}:${i}">✕</button>
        </div>
      `).join('') : `<div class="portal-note">Nothing here yet.</div>`}
      <div class="add-slot-row">
        <input type="text" data-portal-input="${s.key}" placeholder="${s.placeholder}">
        <button data-portal-add="${s.key}">Add</button>
      </div>
    `).join('')}
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  sheet.querySelectorAll('[data-portal-add]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.portalAdd;
    const input = sheet.querySelector(`[data-portal-input="${key}"]`);
    const text = input.value.trim();
    if (!text) return;
    m.portal[key].push(key === 'homework' ? { text, done: false } : text);
    openTherapistPortal(therapistId);
  }));
  sheet.querySelectorAll('[data-portal-remove]').forEach(btn => btn.addEventListener('click', () => {
    const [key, i] = btn.dataset.portalRemove.split(':');
    m.portal[key].splice(Number(i), 1);
    openTherapistPortal(therapistId);
  }));
}

function openClientPortal(therapistId) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'matched');
  if (!m) return;
  const sheet = document.getElementById('confirm-sheet');
  const isEmpty = PORTAL_SECTIONS.every(s => m.portal[s.key].length === 0);
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Between Sessions</h2>
    <div class="intake-sub">From ${displayName(m.therapist)} — things to hold onto until you meet again.</div>
    ${isEmpty ? `<div class="portal-note" style="margin-top:14px;">Nothing here yet — after a session, ${displayName(m.therapist)} can leave goals, homework, and resources for you here.</div>` : PORTAL_SECTIONS.map(s => `
      <div class="section-title">${s.icon} ${s.label}</div>
      ${m.portal[s.key].length ? m.portal[s.key].map((item, i) => s.key === 'homework' ? `
        <label class="portal-item portal-checkable">
          <input type="checkbox" data-homework-toggle="${i}" ${item.done ? 'checked' : ''}>
          <span class="portal-item-text ${item.done ? 'portal-item-done' : ''}">${item.text}</span>
        </label>
      ` : `
        <div class="portal-item"><span class="portal-item-text">${item}</span></div>
      `).join('') : `<div class="portal-note">Nothing here yet.</div>`}
    `).join('')}
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  sheet.querySelectorAll('[data-homework-toggle]').forEach(cb => cb.addEventListener('change', () => {
    m.portal.homework[Number(cb.dataset.homeworkToggle)].done = cb.checked;
    openClientPortal(therapistId);
  }));
}

document.getElementById('between-sessions-btn').addEventListener('click', (e) => {
  openClientPortal(e.currentTarget.dataset.tid);
});

function renderChatMessages(tid) {
  const container = document.getElementById('chat-messages');
  const log = chatLog[tid] || [];
  container.innerHTML = log.map(m => {
    const isMine = chatRole === 'therapist' ? m.from === 'them' : m.from === 'me';
    return `<div class="msg ${isMine ? 'me' : 'them'}">${m.text}</div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  const tid = input.dataset.tid;
  if (!text || !tid) return;
  chatLog[tid] = chatLog[tid] || [];
  const from = chatRole === 'therapist' ? 'them' : 'me';
  chatLog[tid].push({ from, text });
  saveClientState();
  clientStore.persistMessage(tid, { from, text }); // gated by the flag
  input.value = '';
  renderChatMessages(tid);
  renderMatches();

  // Only simulate an auto-reply when the client is sending — this stands in
  // for "the therapist responded on their own time" without requiring the
  // person testing this prototype to switch views for every message. When
  // actually replying as the therapist, no canned reply is injected.
  if (chatRole === 'client') {
    setTimeout(() => {
      chatLog[tid].push({ from: 'them', text: "Thanks for sharing that. I'd love to talk through it more — want to grab a free 15-minute intro call this week?" });
      renderChatMessages(tid);
      renderMatches();
    }, 900);
  } else {
    renderRequests();
  }
}

document.getElementById('chat-back').addEventListener('click', () => {
  if (chatRole === 'therapist') showTScreen('t-requests');
  else showScreen('matches');
});

// ===== ON-DEMAND SCREEN =====
const ondemandList = document.getElementById('ondemand-list');
let clientAgreedToOnDemandPolicy = false;

function renderOndemandPolicyGate() {
  ondemandList.innerHTML = `
    <div class="policy-gate">
      <div class="t-form-label">Before you use On-Demand</div>
      <p class="modality-info-text">Requesting a slot authorizes your card, but <strong>you're only charged when the therapist accepts</strong>. If they decline or don't respond, the hold is released. Once a session is confirmed and your plans change:</p>
      <ul class="policy-list">
        <li>48+ hours before your session: full refund</li>
        <li>24–48 hours before: 50% refund</li>
        <li>Less than 24 hours before: no refund</li>
        <li>If the therapist doesn't show: full refund, always — and they lose On-Demand access</li>
      </ul>
      <button class="primary-btn" style="background:var(--coral);color:white;" id="agree-ondemand-btn">I Agree &amp; Continue</button>
    </div>
  `;
  document.getElementById('agree-ondemand-btn').addEventListener('click', () => {
    clientAgreedToOnDemandPolicy = true;
    renderOndemand();
  });
}

// On-Demand is confirmed by a human on their own schedule — hours, not
// minutes. That's the wrong tool for a crisis, and we say so before anyone
// books, with real resources up front.
function openCrisisCheck() {
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Before you book — is this a crisis?</h2>
    <p class="modality-info-text">On-Demand sessions are confirmed by the therapist, which can take a few hours. <strong>That's not fast enough if you're in crisis.</strong></p>
    <p class="modality-info-text">If you're in immediate danger, or having thoughts of harming yourself or someone else, please reach out right now:</p>
    <ul class="policy-list">
      <li><strong>Call or text 988</strong> — Suicide &amp; Crisis Lifeline, free, 24/7</li>
      <li><strong>Text HOME to 741741</strong> — Crisis Text Line</li>
      <li><strong>Call 911</strong> or go to your nearest emergency room</li>
    </ul>
    <button class="primary-btn crisis-help-btn" id="crisis-help-btn">I need help right now</button>
    <button class="primary-btn" style="margin-top:8px;background:var(--coral);color:white;" id="crisis-continue-btn">This isn't a crisis — continue</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('crisis-help-btn').addEventListener('click', () => {
    sheet.innerHTML = `
      <div class="sheet-close"></div>
      <h2>You don't have to hold this alone</h2>
      <p class="modality-info-text">Reaching out right now is the strongest move available to you. These are free, confidential, and open 24/7:</p>
      <a class="crisis-resource" href="tel:988">📞 Call 988 — Suicide &amp; Crisis Lifeline</a>
      <a class="crisis-resource" href="sms:988">💬 Text 988</a>
      <a class="crisis-resource" href="sms:741741&body=HOME">💬 Text HOME to 741741 — Crisis Text Line</a>
      <a class="crisis-resource" href="tel:911">🚨 Call 911</a>
      <p class="modality-info-text" style="margin-top:10px;">Kindred will be here when you're through this. On-Demand and matching aren't going anywhere.</p>
    `;
  });
  document.getElementById('crisis-continue-btn').addEventListener('click', () => {
    crisisAcknowledged = true;
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}

function renderOndemand() {
  if (!crisisAcknowledged) openCrisisCheck();
  if (!clientAgreedToOnDemandPolicy) {
    renderOndemandPolicyGate();
    return;
  }
  const list = computeOnDemandList();
  if (list.length === 0) {
    ondemandList.innerHTML = rosterCount === 0
      ? `<p class="empty-state">We're still welcoming therapists in your area. On-Demand opens up as soon as therapists near you start offering one-time sessions.</p>`
      : `<p class="empty-state">No one-time slots match your needs this week — check back soon.</p>`;
    return;
  }
  ondemandList.innerHTML = list.map(t => `
    <div class="ondemand-card" data-id="${t.id}">
      <div class="od-header">
        ${avatarHtml(t, 'avatar-md')}
        <div><div class="od-name">${displayName(t)}</div><div class="od-creds">${credentialsLabel(t)}</div></div>
      </div>
      ${matchTagsHtml(t)}
      <div class="od-price">$${ondemandPricing(t).clientTotal.toFixed(2)} · one-time, cash-pay session</div>
      <div class="slot-row">
        ${t.onDemandSlots.map(s => `<button class="slot-btn" data-tid="${t.id}" data-slot="${s.label}">${s.label}</button>`).join('')}
      </div>
    </div>
  `).join('');
  ondemandList.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => bookOndemand(btn.dataset.tid, btn.dataset.slot, btn));
  });
}

// ===== ON-DEMAND PAYMENT & CANCELLATION =====
// On-demand slots require payment up front. Cancellation policy is measured
// from the actual scheduled session time, not from when it was booked:
// 48+ hours out = full refund, 24-48 hours = half, under 24 hours = none.
function getRefundTier(hoursUntilSession) {
  if (hoursUntilSession >= 48) return { percent: 100, label: 'a full refund' };
  if (hoursUntilSession >= 24) return { percent: 50, label: 'a 50% refund' };
  return { percent: 0, label: 'no refund' };
}

function nextOccurrence(dayAbbrev, timeLabel) {
  const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDow = dayIndex[dayAbbrev];
  const match = (timeLabel || '').match(/(\d+):(\d+)(am|pm)/i);
  let hour = 0, minute = 0;
  if (match) {
    hour = parseInt(match[1], 10);
    minute = parseInt(match[2], 10);
    const period = match[3].toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  }
  const now = new Date();
  let daysAhead = (targetDow - now.getDay() + 7) % 7;
  if (daysAhead === 0) {
    const todayAtTime = new Date(now);
    todayAtTime.setHours(hour, minute, 0, 0);
    if (todayAtTime <= now) daysAhead = 7;
  }
  const result = new Date(now);
  result.setDate(now.getDate() + daysAhead);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function refundStatusLabel(status) {
  if (status === 'refunded') return 'full refund issued';
  if (status === 'partially-refunded') return '50% refund issued';
  if (status === 'declined-by-therapist') return 'they declined — hold released, no charge';
  if (status === 'noshow-refunded') return 'no-show — full refund issued';
  if (status === 'released') return 'cancelled — hold released, no charge';
  if (status === 'cancelled-no-refund') return 'no refund per policy';
  return '';
}

function bookOndemand(tid, slotLabel, btnEl) {
  const t = THERAPISTS.find(t => t.id === tid);
  openPaymentConfirm(t, slotLabel, btnEl);
}

function openPaymentConfirm(t, slotLabel, btnEl) {
  const p = ondemandPricing(t);
  const amount = p.clientTotal;
  document.getElementById('confirm-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>Request this session</h2>
    <div class="intake-sub">One-time session with ${displayName(t)} — ${slotLabel}</div>
    <div class="payment-amount">$${amount.toFixed(2)}</div>
    <ul class="policy-list">
      <li>Session fee: $${p.price.toFixed(2)}</li>
      <li>Stripe processing fee: $${p.stripeFee.toFixed(2)}</li>
      <li><strong>Total charged to you: $${amount.toFixed(2)}</strong></li>
    </ul>
    <p class="modality-info-text">On-Demand is <strong>cash-pay only</strong> (no insurance) and <strong>not for crises</strong>. Your card is <strong>authorized now but only charged when ${displayName(t)} accepts</strong>. If they decline or don't respond, the hold is released and you pay nothing.</p>
    <div class="t-form-label">Cancellation policy (after acceptance)</div>
    <ul class="policy-list">
      <li>48+ hours before your session: full refund</li>
      <li>24–48 hours before: 50% refund</li>
      <li>Less than 24 hours before: no refund</li>
      <li>Therapist no-show: full refund, always</li>
    </ul>
    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="confirm-pay-btn">Authorize $${amount.toFixed(2)} &amp; Request</button>
    <button class="text-btn" id="confirm-pay-cancel" style="color:var(--ink-soft);">Cancel</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('confirm-pay-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    finalizeOndemandBooking(t, slotLabel, btnEl, amount);
  });
  document.getElementById('confirm-pay-cancel').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}
document.getElementById('confirm-modal').addEventListener('click', (e) => {
  if (e.target.id === 'confirm-modal') e.currentTarget.classList.add('hidden');
});

function finalizeOndemandBooking(t, slotLabel, btnEl, amount) {
  const card = btnEl.closest('.ondemand-card');
  card.querySelectorAll('.slot-btn').forEach(b => { b.disabled = true; b.classList.add('booked'); });
  btnEl.textContent = `Requested: ${slotLabel}`;
  const [day, ...timeParts] = slotLabel.split(' ');
  const sessionDateTime = nextOccurrence(day, timeParts.join(' '));
  // Payment is a hold, not a charge — it only processes when the therapist
  // accepts. Declines and no-responses cost the client nothing.
  matches.push({
    therapist: t, status: 'ondemand', slotLabel,
    amountPaid: amount, paymentStatus: 'authorized',
    sessionDateTime: sessionDateTime.toISOString()
  });
  showToast(`Request sent — $${amount} authorized, charged only if ${displayName(t)} accepts.`);
  renderMatches();
}

// Therapist accepts an on-demand request: this is the moment the payment
// actually processes.
function acceptOndemandBooking(m) {
  m.paymentStatus = 'paid';
  chatLog[m.therapist.id] = chatLog[m.therapist.id] || [{ from: 'them', text: `Looking forward to our session ${m.slotLabel}! Feel free to message me anything beforehand.` }];
  showToast(`Session accepted — client's $${m.amountPaid} payment processed.`);
  renderRequests();
}

function declineOndemandBooking(m) {
  m.paymentStatus = 'declined-by-therapist';
  showToast('Request declined — the payment hold was released.');
  renderRequests();
}

// A reported no-show refunds the client in full and permanently suspends
// the therapist's On-Demand access — honoring confirmed sessions is the
// deal they agreed to when they turned On-Demand on.
function reportNoShow(therapistId) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'ondemand' && m.paymentStatus === 'paid');
  if (!m) return;
  document.getElementById('confirm-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>Report a no-show</h2>
    <div class="intake-sub">Your session with ${displayName(m.therapist)} was ${m.slotLabel}.</div>
    <p class="modality-info-text">If ${displayName(m.therapist)} didn't join your session, you'll receive a <strong>full refund of $${m.amountPaid}</strong> — the cancellation tiers never apply to a therapist no-show. Their On-Demand access is also suspended.</p>
    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="confirm-noshow-btn">They didn't show — refund me</button>
    <button class="text-btn" id="confirm-noshow-back" style="color:var(--ink-soft);">Never Mind</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('confirm-noshow-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    m.paymentStatus = 'noshow-refunded';
    m.refundAmount = m.amountPaid;
    m.therapist.onDemandBanned = true;
    m.therapist.onDemand = false;
    showToast(`$${m.amountPaid} refunded in full. ${displayName(m.therapist)}'s On-Demand access is suspended.`);
    renderMatches();
  });
  document.getElementById('confirm-noshow-back').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}

function requestCancelOndemand(therapistId) {
  const m = matches.find(m => m.therapist.id === therapistId && m.status === 'ondemand' && m.paymentStatus === 'paid');
  if (!m) return;
  const hoursUntil = (new Date(m.sessionDateTime) - new Date()) / 3600000;
  const tier = getRefundTier(hoursUntil);
  document.getElementById('confirm-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>Cancel this session?</h2>
    <div class="intake-sub">Your session with ${displayName(m.therapist)} is ${m.slotLabel}.</div>
    <p class="modality-info-text">Based on our cancellation policy, you'll receive <strong>${tier.label}</strong> (${tier.percent}% of $${m.amountPaid}).</p>
    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="confirm-cancel-btn">Confirm Cancellation</button>
    <button class="text-btn" id="confirm-cancel-back" style="color:var(--ink-soft);">Never Mind</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    finalizeCancellation(m, tier);
  });
  document.getElementById('confirm-cancel-back').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}

function finalizeCancellation(m, tier) {
  m.paymentStatus = tier.percent === 100 ? 'refunded' : tier.percent === 50 ? 'partially-refunded' : 'cancelled-no-refund';
  m.refundAmount = Math.round(m.amountPaid * (tier.percent / 100));
  showToast(tier.percent > 0 ? `Cancelled — $${m.refundAmount} refunded.` : 'Cancelled — no refund per policy.');
  renderMatches();
}

// A therapist must explicitly agree to the payment/cancellation terms before
// they can turn On-Demand on for themselves — same policy the client agrees
// to, but framed from the side that keeps the non-refunded portion.
function openTherapistOnDemandAgreement(onAgree) {
  /* Worked in THEIR number when they have set one. A policy that says "Kindred
     keeps 5% and the client covers Stripe" leaves the therapist to do arithmetic
     on the one screen where they are deciding whether the deal is worth taking
     -- and the answer is better than the fees sound, so it is worth showing
     rather than making them work out. Falls back to $150 before they have set a
     rate, clearly labelled as an example. */
  const t = THERAPISTS.find(x => x.id === currentTherapistId);
  const own = t ? ondemandPricing(t) : null;
  const usingOwnRate = !!(own && own.price);
  const ex = usingOwnRate ? own : ondemandPricing({ onDemandRate: 150 });
  const m = n => '$' + Number(n).toFixed(2);

  document.getElementById('confirm-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>On-Demand Payment Policy</h2>
    <div class="t-form-label">You set the price</div>
    <p class="modality-info-text">You choose what a one-time session costs, and you can change it whenever you like. Kindred never prices your time.</p>
    <div class="od-example">
      <div class="od-example-head">${usingOwnRate
        ? `At your rate of ${m(ex.price)} a session`
        : `For example, at ${m(ex.price)} a session`}</div>
      <div class="od-example-row"><span>Client pays</span><b>${m(ex.clientTotal)}</b></div>
      <div class="od-example-sub">your ${m(ex.price)} plus Stripe's ${m(ex.stripeFee)}</div>
      <div class="od-example-row"><span>Kindred keeps</span><b>${m(ex.kindredCut)}</b></div>
      <div class="od-example-sub">5% of your price</div>
      <div class="od-example-row is-total"><span>You receive</span><b>${m(ex.therapistNet)}</b></div>
    </div>
    <p class="modality-info-text">Clients authorize payment when they request a slot, and the charge processes when you accept. If a client cancels a confirmed session:</p>
    <ul class="policy-list">
      <li>48+ hours before the session: they get a full refund</li>
      <li>24–48 hours before: they get a 50% refund — you keep the other 50%</li>
      <li>Less than 24 hours before: no refund — you keep the full amount</li>
    </ul>
    <div class="t-form-label">Fees</div>
    <ul class="policy-list">
      <li><strong>Kindred keeps a 5% processing fee</strong> on each on-demand session cost.</li>
      <li>The client also covers the Stripe processing fee (2.9% + $0.30) on top of your price.</li>
    </ul>
    <p class="modality-info-text"><strong>Showing up is the deal:</strong> if you miss a confirmed session, the client is refunded in full and your On-Demand access is permanently suspended.</p>
    <p class="modality-info-text">By continuing, you agree to these terms — including Kindred's 5% fee — and to honor confirmed sessions.</p>
    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="agree-td-ondemand-btn">I Agree</button>
    <button class="text-btn" id="decline-td-ondemand-btn" style="color:var(--ink-soft);">Not Now</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('agree-td-ondemand-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    onAgree();
  });
  document.getElementById('decline-td-ondemand-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}

// ===== NAV / SCREENS =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('#bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
  if (name === 'profile') renderProfileScreen();
  if (name === 'explore') renderExploreResources();
  if (name === 'ondemand') renderOndemand();
  if (name === 'shortlist') renderShortlist();
  if (name === 'matches') renderMatches();
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.remove('hidden');
  const navBtn = document.querySelector(`#bottom-nav .nav-btn[data-screen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
}

document.querySelectorAll('#bottom-nav .nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ===== ACCOUNT TYPE / LOGIN / LOGOUT =====
// Two separate account types share the same underlying data (THERAPISTS,
// matches, shortlist) — logging in as one side or the other just changes
// which screens you see, not which data exists. That's what makes the
// client's requests actually visible to the right therapist's inbox.
let accountType = null; // 'client' | 'therapist'

document.getElementById('choose-client-btn').addEventListener('click', () => {
  accountType = 'client';
  openLogin();
});
document.getElementById('choose-therapist-btn').addEventListener('click', () => {
  accountType = 'therapist';
  openLogin();
});

function openLogin() {
  setLoginRestoring(false);   // any earlier restore is finished or irrelevant
  document.getElementById('login-title').textContent = accountType === 'client' ? 'Client Login' : 'Therapist Login';
  /* Reset what the post-checkout path may have changed -- someone who signs
     out and back in is not arriving from a purchase, and DOES need the
     create-account option. */
  const ctx = document.getElementById('login-context');
  if (ctx) { ctx.hidden = true; ctx.textContent = ''; }
  const create = document.getElementById('login-create-btn');
  const login  = document.getElementById('login-submit-btn');
  if (create && login) {
    /* Both buttons disable themselves on submit so nobody double-fires a sign
       in, and the SUCCESS paths never re-enable them -- they navigate away, so
       there was nothing to re-enable. Except signing out comes straight back
       here to the same two DOM nodes, still disabled, and the label reset below
       made it worse: it read "Log In" in full, just greyed at 40% and dead to
       every click. Reset the state as well as the words. */
    create.disabled = false;
    login.disabled  = false;
    create.hidden = false;
    create.textContent = 'New here? Create an Account';
    create.style.cssText = 'background:white;border:1.5px solid var(--coral);color:var(--coral-dark);';
    login.textContent = 'Log In';
    login.style.cssText = 'margin-top:20px;background:var(--coral);color:white;';
    login.parentNode.insertBefore(login, create);   // Log In back above Create
  }
  showScreen('login');
}

document.getElementById('login-back').addEventListener('click', () => {
  accountType = null;
  showScreen('account-type');
});

// "Log In" and "Create an Account" are two equally visible buttons rather
// than one button behind a toggle — burying account creation behind a small
// mode-switch link meant people testing the therapist flow never found it
// and always landed on the existing-profile picker instead.
document.getElementById('login-submit-btn').addEventListener('click', async () => {
  if (accountType === 'client') {
    // Clients stay demo-side (no server-persisted PHI until the BAA) — dive
    // straight into matching. Explore Kindred stays in the bottom nav.
    enterMatchingExperience();
    return;
  }
  const email = (document.getElementById('login-email').value || '').trim();
  const password = document.getElementById('login-password').value || '';
  // Empty fields (or no auth configured) = demo therapist portal, as before.
  if (!authReady() || (!email && !password)) { showTherapistView(); return; }
  if (!email || !password) { showToast('Enter your email and password.'); return; }
  const btn = document.getElementById('login-submit-btn'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    await authSignIn(email, password);
      const row = await loadTherapistRow();
      // 0013 creates a stub row the moment someone pays, so "a row exists" no
      // longer means "they have a profile". A stub has no name -- send those
      // people through signup rather than into an empty portal.
      const hasProfile = row && row.name && String(row.name).trim();
      if (hasProfile) {
        const t = normalizeTherapist(dbRowToTherapist(row));
        t.licenses = await loadLicenses();
        upsertTherapistInMemory(t);
        currentTherapistId = t.id;
        showTherapistView();
      } else {
        /* No profile on the server. Before handing them a blank wizard, check
           whether this device still holds one that failed to save -- being
           asked to retype twenty minutes of work is the worst possible
           moment, and it is exactly what happened before this existed. */
        let stash = null;
        try { stash = JSON.parse(localStorage.getItem('kindred-profile-unsaved') || 'null'); } catch (e) {}
        if (stash && stash.name && String(stash.name).trim()) {
          Object.assign(newTherapistDraft, stash);
          showToast('Picking up the profile you already wrote.');
          startTherapistSignup();
          signupStep = TOTAL_SIGNUP_STEPS - 1;   // straight to the finish, not the first question
          renderSignupStep();
        } else {
          startTherapistSignup(); // genuinely new, or a paid stub with nothing in it
        }
      }
  } catch (e) {
    showToast(/confirm/i.test(e.message) ? 'Please confirm your email first — check your inbox.'
      : /invalid|credential|grant/i.test(e.message) ? 'Wrong email or password.' : e.message);
    btn.disabled = false; btn.textContent = label;
  }
});

document.getElementById('login-create-btn').addEventListener('click', async () => {
  if (accountType === 'client') { startIntake(); return; }
  const email = (document.getElementById('login-email').value || '').trim();
  const password = document.getElementById('login-password').value || '';
  if (!authReady() || (!email && !password)) { startTherapistSignup(); return; } // demo fallback
  if (!email || password.length < 6) { showToast('Enter an email and a password of at least 6 characters.'); return; }
  const btn = document.getElementById('login-create-btn'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const { needsConfirmation } = await authSignUp(email, password);
    if (needsConfirmation) {
      showToast('Account created — check your email to confirm, then log in.');
      btn.disabled = false; btn.textContent = label;
      return;
    }
    startTherapistSignup(); // confirmed session → build their profile now
  } catch (e) {
    showToast(/registered|already/i.test(e.message) ? 'That email already has an account — try logging in.' : e.message);
    btn.disabled = false; btn.textContent = label;
  }
});

// ===== EXPERIENCE SWITCHING (matching app <-> explore/website) =====
const experienceModal = document.getElementById('experience-modal');

function openExperienceModal() {
  experienceModal.classList.remove('hidden');
}

function enterMatchingExperience() {
  experienceModal.classList.add('hidden');
  if (intake.completed) {
    finishIntake();
    checkForNewMatches();
  } else {
    startIntake();
  }
}

function showExploreScreen() {
  experienceModal.classList.add('hidden');
  document.getElementById('therapist-nav').classList.add('hidden');
  // The Kindred tab in the bottom nav only makes sense once the client has
  // a working matching experience to tab back to — before intake, Explore
  // is a full-screen page whose only exit is "Match with a Therapist".
  document.getElementById('bottom-nav').classList.toggle('hidden', !intake.completed);
  showScreen('explore');
}

function renderExploreResources() {
  const list = document.getElementById('explore-resources-list');
  list.innerHTML = EXPLORE_RESOURCES.map(r => {
    const saved = savedResources.includes(r.id);
    return `
      <div class="resource-card">
        <span class="resource-icon">${r.icon}</span>
        <div class="resource-text">
          <div class="resource-title">${r.title}</div>
          <div class="resource-blurb">${r.blurb}</div>
        </div>
        <button class="resource-save-btn ${saved ? 'saved' : ''}" data-resource="${r.id}">${saved ? '✓ Saved' : 'Save'}</button>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-resource]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.resource;
      const i = savedResources.indexOf(id);
      if (i === -1) savedResources.push(id); else savedResources.splice(i, 1);
      saveClientState();
      renderExploreResources();
    });
  });
}

document.getElementById('exp-match-btn').addEventListener('click', enterMatchingExperience);
document.getElementById('exp-explore-btn').addEventListener('click', showExploreScreen);
document.getElementById('explore-to-match-btn').addEventListener('click', enterMatchingExperience);
document.getElementById('explore-cta-btn').addEventListener('click', enterMatchingExperience);

// ===== THERAPIST SIGNUP — brand-new profile from scratch =====
const MANDATORY_PROMPTS = [
  'I look forward to helping you with...',
  'What can you expect in session with me?'
];
const OPTIONAL_PROMPTS = [
  "You'll probably click with me if...",
  'Together we could...',
  'I geek out on...',
  "We're the same type of weird if...",
  "I won't shut up about...",
  "Out of session, you'll find me...",
  'All I ask is that you...',
  'I became a therapist because...',
  'My greatest strength is...',
  "My favorite thing I've learned...",
  'I wish I could tell the younger version of myself...',
  'How I can help...'
];
const MAX_OPTIONAL_PROMPTS = 5;
const MAX_FEED_BLURBS = 7;  // most little blurbs shown in the get-to-know feed

// The get-to-know feed is now one ordered list of draggable BLOCKS — each block
// is either a prompt (a little blurb) or a photo. Mandatory prompts are gone;
// the therapist picks up to 7 prompts from this pool and arranges the blocks
// however they like (we recommend alternating a photo and a blurb).
const GET_TO_KNOW_PROMPTS = [
  'Who I am in the office...',
  'Who I am out of the office...',
  ...MANDATORY_PROMPTS,
  ...OPTIONAL_PROMPTS
];
const MAX_GET_TO_KNOW_PROMPTS = 7;

// Build t.blocks once from whatever the profile already had (persona, the old
// mandatory answers, and optional prompts), interleaved with photos. After this
// first pass, t.blocks is the single source of truth for the feed and editor.
function getToKnowBlocks(t) {
  if (Array.isArray(t.blocks)) return t.blocks;
  const prompts = [];
  if (t.persona && t.persona.inOffice)  prompts.push({ type: 'prompt', question: 'Who I am in the office...',  answer: t.persona.inOffice });
  if (t.persona && t.persona.outOfOffice) prompts.push({ type: 'prompt', question: 'Who I am out of the office...', answer: t.persona.outOfOffice });
  if (Array.isArray(t.mandatoryPromptAnswers)) MANDATORY_PROMPTS.forEach((q, i) => { if (t.mandatoryPromptAnswers[i]) prompts.push({ type: 'prompt', question: q, answer: t.mandatoryPromptAnswers[i] }); });
  (t.optionalPrompts || []).forEach(p => { if (p.question) prompts.push({ type: 'prompt', question: p.question, answer: p.answer || '' }); });
  const kept = prompts.slice(0, MAX_GET_TO_KNOW_PROMPTS);
  const photos = therapistPhotos(t).map(src => ({ type: 'photo', src }));
  // default arrangement: blurb, photo, blurb, photo…
  const out = [];
  const n = Math.max(kept.length, photos.length);
  for (let i = 0; i < n; i++) { if (kept[i]) out.push(kept[i]); if (photos[i]) out.push(photos[i]); }
  // the quick-hello video is a draggable block too — slot it right after the
  // first block by default so words still lead
  if (t.media && t.media.video) out.splice(Math.min(1, out.length), 0, { type: 'video', src: t.media.video });
  t.blocks = out;
  return t.blocks;
}
function blockPromptCount(t) { return getToKnowBlocks(t).filter(b => b.type === 'prompt').length; }
function blockPhotoCount(t)  { return getToKnowBlocks(t).filter(b => b.type === 'photo').length; }
function blockHasVideo(t)    { return getToKnowBlocks(t).some(b => b.type === 'video'); }
const MAX_TOP_SPECIALTIES = 3;
const MAX_PHOTOS = 4;       // up to 4 photos (+ 1 video) alternate with blurbs

/* Photos were stored as raw readAsDataURL output. A current phone camera
   produces 3-8MB per shot, which base64 inflates by a third again, and the
   result is written to therapists.photo and re-sent on EVERY autosave -- so a
   therapist tweaking one line of their bio pushes several megabytes each time.
   Downscaling to a long edge of 1200 and re-encoding as JPEG turns that into
   roughly 150-300KB, which is more than a swipe card or profile header needs.

   Falls back to the original file if anything goes wrong: a photo that is too
   big is a far better outcome than no photo at all. */
const PHOTO_MAX_EDGE = 1200;
const PHOTO_QUALITY  = 0.82;
function readPhoto(file) {
  return new Promise(resolve => {
    const bail = () => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file); };
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', PHOTO_QUALITY));
        } catch (e) { URL.revokeObjectURL(url); bail(); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); bail(); };
      img.src = url;
    } catch (e) { bail(); }
  });
}
const NEW_THERAPIST_GRADIENTS = [
  'linear-gradient(135deg,#c97b9e,#a3557a)',
  'linear-gradient(135deg,#7ba7c9,#4f7ea3)',
  'linear-gradient(135deg,#c9a15a,#a37a35)',
  'linear-gradient(135deg,#8fae7d,#5f7f4c)',
  'linear-gradient(135deg,#b08cc9,#82599e)'
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

function timeSortKey(t12h) {
  const match = (t12h || '').match(/(\d+):(\d+)(am|pm)/);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  if (match[3] === 'pm' && h !== 12) h += 12;
  if (match[3] === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

let signupStep = 0;
const TOTAL_SIGNUP_STEPS = 6;
let newTherapistDraft = null;
const signupContent = document.getElementById('therapist-signup-content');

function startTherapistSignup() {
  signupStep = 0;
  newTherapistDraft = {
    name: '', photo: null, credentials: ['', '', ''],
    marketingOptIn: false,   // consent is opt-IN; never default this to true
    licenseNumber: '', licenseVerified: false, licenses: [], paymentOptions: [],
    website: '',
    pronouns: '', showPronouns: true, useCompanyName: false, companyName: '',
    practiceType: 'specialist',
    bestFor: '',
    tags: [], modalities: [],
    style: 'balanced', gender: 'female', lgbtqAffirming: false, languages: [], showOtherLanguage: false,
    formats: [], insuranceList: [], selfPayNote: '', rateMin: 130,
    city: '', state: '',
    mandatoryPromptAnswers: ['', ''],
    selectedOptionalPrompts: [], optionalPromptAnswers: {}, optionalPromptPhotos: {},
    acceptingOngoing: true, onDemand: false, onDemandSlots: [], agreedToOnDemandPolicy: false
  };
  renderSignupStep();
  showScreen('therapist-signup');
}

/* Every checkbox tick re-renders the whole panel, which throws away the
   scroll position of the .cbx-dd-list it happened in -- so ticking the third
   therapy type sent you back to the top of a 240px window and you had to
   scroll down again for the fourth. Open/closed state was already kept in
   editDropdownOpen; this is the other half of the same problem.

   Focus is restored too, or a keyboard user loses their place in the list on
   every single tick, which is the same bug with a worse ending. */
let editDropdownScroll = {};

function captureDropdownState() {
  document.querySelectorAll('.cbx-dd[data-dd]').forEach(dd => {
    const list = dd.querySelector('.cbx-dd-list');
    if (list) editDropdownScroll[dd.dataset.dd] = list.scrollTop;
  });
  const a = document.activeElement;
  return (a && a.dataset && a.dataset.cbx) ? { key: a.dataset.cbx, value: a.value } : null;
}

function restoreDropdownState(focus) {
  document.querySelectorAll('.cbx-dd[data-dd]').forEach(dd => {
    const list = dd.querySelector('.cbx-dd-list');
    const y = editDropdownScroll[dd.dataset.dd];
    if (list && y) list.scrollTop = y;
  });
  if (!focus) return;
  /* Matched by walking rather than an attribute selector: option labels carry
     &, parentheses and slashes, which would need escaping to be safe here. */
  const el = [...document.querySelectorAll('input[data-cbx]')]
    .find(i => i.dataset.cbx === focus.key && i.value === focus.value);
  if (el) el.focus({ preventScroll: true });
}


/* Wrappers, so all ~70 call sites keep the scroll fix without each one
   remembering to ask for it. */
function renderTherapistProfile() {
  const focus = captureDropdownState();
  renderTherapistProfileBody();
  restoreDropdownState(focus);
}
/* What step one still needs before Continue does anything. ONE definition,
   read by both the initial render and the live refresh on every keystroke --
   they used to be two copies of the same condition, which is how a rule ends
   up enforced in one place and not the other.

   The photo is required here for the same reason it is required to publish:
   a client's first question is whether they can picture talking to this
   person, and initials on a coloured block cannot answer it. Better to ask
   while they are already in the flow than to let them finish, go away, and
   discover later that the profile cannot go live. */
function step0Missing(d) {
  const out = [];
  if (!(d.photo && String(d.photo).trim())) out.push('a photo');
  if (!d.name.trim())                        out.push('your name');
  if (!((d.licenses || []).length))          out.push('a license');
  return out;
}

function renderSignupStep() {
  const focus = captureDropdownState();
  renderSignupStepBody();
  restoreDropdownState(focus);
}

function renderSignupStepBody() {
  const d = newTherapistDraft;
  let html = `<div class="intake-progress">${Array.from({ length: TOTAL_SIGNUP_STEPS }).map((_, i) =>
    `<div class="dot ${i <= signupStep ? 'done' : ''}"></div>`).join('')}</div>`;

  if (signupStep === 0) {
    html += `
      <h1>Let's set up your profile</h1>
      <div class="intake-sub">This is what clients see first — you can edit all of it later.</div>

      <!-- Signup had no photo upload anywhere across its six steps. The lead
           photo only existed in the profile editor, under Media, which a
           therapist had to go looking for AFTER finishing setup and seeing an
           empty preview. It belongs here: it is the swipe-card image, so it
           sits with the name it appears beside. -->
      <div class="t-form-label">Your photo${d.photo ? '' : ' <span class="req-pill">required</span>'}</div>
      <label class="media-row ts-photo-row${d.photo ? '' : ' is-required'}">
        <span class="media-thumb">${d.photo ? `<img src="${d.photo}" alt="">` : '<span>—</span>'}</span>
        <span class="media-row-text">
          <strong>${d.photo ? 'Change photo' : 'Add a photo'}</strong>
          <span>${d.photo
            ? 'The first thing a client sees. You can add more later.'
            : 'The first thing a client sees, and the one a client answers “could I talk to this person?” with. Your profile can’t go live without it.'}</span>
        </span>
        <span class="media-upload-btn">${d.photo ? 'Change' : 'Add'}</span>
        <input type="file" accept="image/*" id="ts-photo" hidden>
      </label>

      <div class="t-form-label">Full name</div>
      <input type="text" class="t-rate-input" id="ts-name" placeholder="e.g. Dr. Jordan Reyes" value="${d.name}">
      <div class="t-form-label">Pronouns (optional)</div>
      <input type="text" class="t-rate-input" id="ts-pronouns" placeholder="e.g. she/her" value="${d.pronouns}">
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>Show pronouns on my swipe card</strong><span>Always visible on your full profile either way</span></div>
        <div class="switch ${d.showPronouns ? 'on' : ''}" id="ts-show-pronouns-switch"></div>
      </div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>List under a practice or company name</strong><span>Shows instead of your personal name to clients</span></div>
        <div class="switch ${d.useCompanyName ? 'on' : ''}" id="ts-use-company-switch"></div>
      </div>
      <div id="ts-company-name-field" style="${d.useCompanyName ? '' : 'display:none;'}">
        <div class="t-form-label">Company / practice name</div>
        <input type="text" class="t-rate-input" id="ts-company-name" placeholder="e.g. Bluebird Counseling" value="${d.companyName}">
      </div>
      <div class="t-form-label">Credentials (up to 3)</div>
      <input type="text" class="t-rate-input" id="ts-cred-0" placeholder="e.g. LPC" value="${d.credentials[0]}">
      <input type="text" class="t-rate-input" id="ts-cred-1" placeholder="e.g. PhD" value="${d.credentials[1]}">
      <input type="text" class="t-rate-input" id="ts-cred-2" placeholder="e.g. Certified Gottman Therapist" value="${d.credentials[2]}">
        <div class="t-form-label">Your licenses <span class="ideal-hint">one per state &mdash; each is checked separately</span></div>
        <div id="ts-license-list">${(d.licenses || []).map(l => `
          <div class="lic-row">
            <span class="lic-state">${l.state}</span>
            <span class="lic-num">${l.number}</span>
            <button type="button" class="lic-remove" data-drop-lic="${l.state}" aria-label="Remove ${l.state}">&#10005;</button>
          </div>`).join('')}</div>
        <div class="lic-add">
          <select id="ts-lic-state">
            <option value="">State&hellip;</option>
            ${US_STATES.filter(s => !(d.licenses || []).some(l => l.state === s)).map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <input type="text" class="t-rate-input" id="ts-lic-number" placeholder="License number">
          <button type="button" id="ts-lic-add">Add</button>
        </div>
        <div class="intake-sub" style="margin-top:6px;">A therapist can only be matched with clients in a state they're licensed in, so each license is checked against that state's board by hand before it counts.</div>`;
  } else if (signupStep === 1) {
    html += `
      <h1>What do you specialize in?</h1>
      <div class="intake-sub">Pick everything you have real experience with — this is what clients are matched on.</div>
        <!-- The specialist / generalist question used to sit here. Removed:
             it asked a therapist to categorise their whole practice before
             they had told us anything about it, and the answer is already
             implied by how many specialties they go on to pick.
             practiceType still exists on the record and still means something
             to matching (see below) — it is simply no longer asked as a
             question. -->
        <!-- Same phrasing as the profile editor. Two labels for one field
             invites them to drift apart. -->
        <div class="t-form-label">I have experience working with&hellip;</div>
        ${checkboxDropdownHtml(d.tags, specialtyAll(), 'ts-spec', 'Choose the specialties you work with…')}
        <div class="t-form-label" style="margin-top:16px;">Modalities you're certified in</div>
        ${checkboxDropdownHtml(d.modalities, modalityAll(), 'ts-modality', 'Choose the therapy types you offer…')}
      <div class="t-form-label">In one sentence, who do you work best with? <span class="ideal-hint">this is the first sentence the client sees</span></div>
      <input type="text" class="t-rate-input" id="ts-bestfor" placeholder="e.g. I work best with new parents navigating postpartum anxiety" value="${d.bestFor}">`;
  } else if (signupStep === 2) {
    html += `
      <h1>How would you describe yourself?</h1>
      <div class="intake-sub">This helps clients who care about style find a fit — there's no wrong answer.</div>
      <div class="option-list" id="ts-style-list">
        <div class="option-row ${d.style === 'gentle' ? 'selected' : ''}" data-style="gentle">Mostly listens and reflects back</div>
        <div class="option-row ${d.style === 'balanced' ? 'selected' : ''}" data-style="balanced">A mix of both</div>
        <div class="option-row ${d.style === 'direct' ? 'selected' : ''}" data-style="direct">Direct — tells it like it is</div>
      </div>
      <div class="t-form-label">Gender Identity</div>
      <div class="option-list" id="ts-gender-list">
        ${GENDER_IDENTITY_OPTIONS.map(g => `
        <div class="option-row ${normalizeGender(d.gender) === g.value ? 'selected' : ''}" data-gender="${g.value}">${g.label}</div>`).join('')}
      </div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>LGBTQ+ affirming</strong><span>Shown to clients who require this</span></div>
        <div class="switch ${d.lgbtqAffirming ? 'on' : ''}" id="ts-lgbtq-switch"></div>
      </div>
      <div class="t-form-label">Languages you speak</div>
      ${languageChipsHtml(d.languages, d.showOtherLanguage, 'ts')}`;
  } else if (signupStep === 3) {
    html += `
      <h1>Logistics</h1>
      <div class="intake-sub">So clients only see you if they can actually work with you.</div>
      <div class="t-form-label">Session format</div>
      <div class="chip-grid" id="ts-format-grid">
        <div class="chip-option ${d.formats.includes('video') ? 'selected' : ''}" data-format="video">Online</div>
        <div class="chip-option ${d.formats.includes('in-person') ? 'selected' : ''}" data-format="in-person">In-person</div>
      </div>
      <div class="t-form-label">City</div>
      <input type="text" class="t-rate-input" id="ts-city" placeholder="e.g. Austin" value="${d.city}">
      <div class="t-form-label">State</div>
      <select id="ts-state">
        <option value="">Select a state</option>
        ${US_STATES.map(s => `<option value="${s}" ${d.state === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <div class="intake-sub" style="margin-top:6px;">Clients looking for in-person sessions only see therapists located in their city/state.</div>
      <div class="t-form-label">Insurance accepted</div>
      ${checkboxDropdownHtml(d.insuranceList, insuranceAll(), 'ts-insurance', 'Choose every carrier you accept…')}
        <div class="t-form-label">Payment options</div>
        <div class="chip-grid" id="ts-payment-grid">
          ${PAYMENT_OPTIONS.map(p => `<div class="chip-option ${d.paymentOptions.includes(p.key) ? 'selected' : ''}" data-payment="${p.key}">${p.label}</div>`).join('')}
        </div>
        <div class="t-form-label">Anything else clients should know about paying? (optional)</div>
        <input type="text" class="t-rate-input" id="ts-selfpaynote" placeholder="e.g. First session free" value="${d.selfPayNote}">
        <div class="t-form-label">Your rate per session</div>
        <div class="rate-row">
          <span class="rate-currency">$</span>
          <input type="number" class="rate-number" id="ts-rate-number" min="20" max="600" step="1" placeholder="165" value="${d.rateMin || ''}">
        </div>`;
  } else if (signupStep === 4) {
    html += `
      <h1>In your words</h1>
      <div class="intake-sub">These two are required — answer in your own voice. Clients will scroll through all of them before reaching out.</div>
      ${MANDATORY_PROMPTS.map((q, i) => `
        <div class="t-form-label">${q}</div>
        <textarea class="intake-textarea" data-mandatory-prompt-index="${i}" rows="2" placeholder="Finish the sentence in your own voice...">${d.mandatoryPromptAnswers[i]}</textarea>
      `).join('')}
      <div class="t-form-label" style="margin-top:20px;">Pick up to ${MAX_OPTIONAL_PROMPTS} more to round out your profile</div>
      <div class="chip-grid" id="ts-optional-prompts-grid">
        ${OPTIONAL_PROMPTS.map(q => `<div class="chip-option ${d.selectedOptionalPrompts.includes(q) ? 'selected' : ''} ${(!d.selectedOptionalPrompts.includes(q) && d.selectedOptionalPrompts.length >= MAX_OPTIONAL_PROMPTS) ? 'chip-disabled' : ''}" data-optional-prompt="${q}">${q}</div>`).join('')}
      </div>
      ${d.selectedOptionalPrompts.map(q => `
        <div class="t-form-label">${q}</div>
        <textarea class="intake-textarea" data-optional-prompt-answer="${q}" rows="2" placeholder="Finish the sentence in your own voice...">${d.optionalPromptAnswers[q] || ''}</textarea>
        <!-- Was a bare <input type="file">, which renders as the browser's grey
             "Choose File / No file chosen" and tells a therapist nothing about
             what to put there. A photo beside a prompt is meant to SHOW the
             thing the sentence says, so the control suggests what that could be. -->
        <label class="prompt-photo-add ${d.optionalPromptPhotos[q] ? 'has-photo' : ''}">
          ${d.optionalPromptPhotos[q]
            ? `<img class="prompt-photo-thumb" src="${d.optionalPromptPhotos[q]}" alt="">`
            : '<span class="ppa-plus" aria-hidden="true">+</span>'}
          <span class="ppa-copy">
            <strong>${d.optionalPromptPhotos[q] ? 'Change this photo' : 'Add a photo (optional)'}</strong>
            <span>${d.optionalPromptPhotos[q] ? 'Tap to swap it out.' : 'Your office, the view on your walk, your dog, your bookshelf &mdash; something that shows what you just wrote.'}</span>
          </span>
          <input type="file" accept="image/*" hidden data-optional-prompt-photo="${q}">
        </label>
        <button type="button" class="prompt-remove-btn" data-remove-optional-prompt="${q}">Remove this prompt</button>
      `).join('')}`;
  } else if (signupStep === 5) {
    html += `
      <h1>Availability</h1>
      <div class="intake-sub">You can change this anytime from your profile.</div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>Accepting ongoing clients</strong><span>Shown in Discover for new long-term matches</span></div>
        <div class="switch ${d.acceptingOngoing ? 'on' : ''}" id="ts-ongoing-switch"></div>
      </div>
      <div class="must-have-toggle">
        <div class="toggle-label"><strong>Offering on-demand this week</strong><span>Shown in On-Demand for one-time sessions</span></div>
        <div class="switch ${d.onDemand ? 'on' : ''}" id="ts-ondemand-switch"></div>
      </div>
      <!-- "Open slots this week" was here. Removed from signup: asking someone
           to commit to specific times before their profile even exists is the
           one answer that goes stale fastest, and the On Demand tab already
           has a proper editor for it — day picker, time picker, price, the
           earnings split — that they will use every week anyway. Nothing is
           lost; the field simply starts empty. -->

      <!-- The only place consent is asked for. Deliberately OFF by default: a
           pre-ticked box is not consent, and it is the fastest way to lose a
           founding therapist. Deliberately last, so it is a closing question
           rather than a hurdle in front of the work.
           Named as marketing so nobody can later claim they thought it was
           about their account -- that mail sends either way. -->
      <div class="must-have-toggle" style="margin-top:18px;">
        <div class="toggle-label">
          <strong>Send me occasional Kindred emails</strong>
          <span>What's working for other therapists, new features, the odd bit of practice-building. Roughly monthly, unsubscribe any time. Nothing to do with your account, billing or licence &mdash; those always send.</span>
        </div>
        <div class="switch ${d.marketingOptIn ? 'on' : ''}" id="ts-marketing-switch"></div>
      </div>`;
  }

  let canProceed = true;
  if (signupStep === 0) canProceed = step0Missing(d).length === 0;
  else if (signupStep === 3) canProceed = d.city.trim() !== '' && d.state !== '';
  else if (signupStep === 4) canProceed = d.mandatoryPromptAnswers.every(a => a.trim().length > 0);
  html += `
    ${signupStep === 0 ? `<p class="step-missing" id="ts-step0-missing" ${canProceed ? 'hidden' : ''}>Still needed: ${step0Missing(d).join(', ')}.</p>` : ''}
    <div class="intake-footer">
      ${signupStep > 0 ? `<button class="btn-back" id="ts-back">Back</button>` : ''}
      <button class="btn-next" id="ts-next" ${canProceed ? '' : 'disabled'}>${signupStep === TOTAL_SIGNUP_STEPS - 1 ? 'Create Profile' : 'Continue'}</button>
    </div>`;

  signupContent.innerHTML = html;
  attachSignupHandlers();
}

function attachSignupHandlers() {
  const d = newTherapistDraft;

  /* One place decides whether step 0 can continue. Two copies drifted: the
     licence field updated the value but never re-checked the button, so
     filling in a licence last left Continue permanently disabled. */
  /* One place decides whether step 0 can continue: a name, and at least one
     licence with a state attached. A number without a state cannot be checked
     against anything. */
  const refreshStep0Next = () => {
    const b = document.getElementById('ts-next');
    const missing = step0Missing(d);
    if (b) b.disabled = missing.length > 0;
    /* A disabled button with no explanation is the same dead end as a broken
       one -- it was greyed out for a missing licence with nothing on screen
       saying so. Name what is left. */
    const note = document.getElementById('ts-step0-missing');
    if (note) {
      note.hidden = missing.length === 0;
      note.textContent = missing.length ? `Still needed: ${missing.join(', ')}.` : '';
    }
  };
  const nameInput = document.getElementById('ts-name');
  if (nameInput) nameInput.addEventListener('input', () => { d.name = nameInput.value; refreshStep0Next(); });
  const licAdd = document.getElementById('ts-lic-add');
  if (licAdd) licAdd.addEventListener('click', () => {
    const st = (document.getElementById('ts-lic-state') || {}).value;
    const num = (document.getElementById('ts-lic-number') || {}).value || '';
    if (!st) { showToast('Pick the state that issued the license.'); return; }
    if (!num.trim()) { showToast('Enter the license number.'); return; }
    d.licenses = d.licenses || [];
    d.licenses.push({ state: st, number: num.trim() });
    d.licenseNumber = d.licenses[0].number;   // kept for older copy that reads it
    renderSignupStep();
  });
  document.querySelectorAll('[data-drop-lic]').forEach(el => el.addEventListener('click', () => {
    d.licenses = (d.licenses || []).filter(l => l.state !== el.dataset.dropLic);
    d.licenseNumber = d.licenses.length ? d.licenses[0].number : '';
    renderSignupStep();
  }));
  const pronounsInput = document.getElementById('ts-pronouns');
  if (pronounsInput) pronounsInput.addEventListener('input', () => { d.pronouns = pronounsInput.value; });
  const showPronounsSwitch = document.getElementById('ts-show-pronouns-switch');
  if (showPronounsSwitch) showPronounsSwitch.addEventListener('click', () => { d.showPronouns = !d.showPronouns; renderSignupStep(); });
  const useCompanySwitch = document.getElementById('ts-use-company-switch');
  if (useCompanySwitch) useCompanySwitch.addEventListener('click', () => { d.useCompanyName = !d.useCompanyName; renderSignupStep(); });
  const companyNameInput = document.getElementById('ts-company-name');
  if (companyNameInput) companyNameInput.addEventListener('input', () => { d.companyName = companyNameInput.value; });
  [0, 1, 2].forEach(i => {
    const credInput = document.getElementById(`ts-cred-${i}`);
    if (credInput) credInput.addEventListener('input', () => { d.credentials[i] = credInput.value; });
  });

  /* The specialist/generalist picker was removed from step one, so this bound
     to nothing. Breadth is now expressed by how many specialties they choose
     rather than by self-declaring a category — which is more honest anyway:
     a therapist who works widely picks ten tags and matches widely, instead
     of ticking "generalist" and being exempted from the overlap check.
     practiceType stays on the record at its default of 'specialist'; existing
     generalist rows keep working, nothing new sets it. */

  /* The signup step used a short chip grid while the editor already offered the
     full catalogue behind a dropdown -- so a therapist could pick a specialty
     after signing up that they could not pick during it. Same control now. */
  const signupCbxArr = key => key === 'ts-spec' ? d.tags
    : key === 'ts-modality'  ? d.modalities
    : key === 'ts-insurance' ? d.insuranceList : null;
  document.querySelectorAll('input[data-cbx]').forEach(el => el.addEventListener('change', () => {
    const arr = signupCbxArr(el.dataset.cbx); if (!arr) return;
    const at = arr.indexOf(el.value);
    if (at === -1) arr.push(el.value); else arr.splice(at, 1);
    renderSignupStep();
  }));
  document.querySelectorAll('[data-cbx-chip]').forEach(el => el.addEventListener('click', () => {
    const arr = signupCbxArr(el.dataset.cbxChip); if (!arr) return;
    const at = arr.indexOf(el.dataset.val);
    if (at !== -1) arr.splice(at, 1);
    renderSignupStep();
  }));
  document.querySelectorAll('.cbx-dd').forEach(dd => dd.addEventListener('toggle', () => {
    editDropdownOpen[dd.dataset.dd] = dd.open;   // keep the panel where they left it
  }));
  const bestForInput = document.getElementById('ts-bestfor');
  if (bestForInput) bestForInput.addEventListener('input', () => { d.bestFor = bestForInput.value; });

  document.querySelectorAll('#ts-style-list .option-row').forEach(el => {
    el.addEventListener('click', () => { d.style = el.dataset.style; renderSignupStep(); });
  });
  document.querySelectorAll('#ts-gender-list .option-row').forEach(el => {
    el.addEventListener('click', () => { d.gender = el.dataset.gender; renderSignupStep(); });
  });
  const lgbtqSwitch = document.getElementById('ts-lgbtq-switch');
  if (lgbtqSwitch) lgbtqSwitch.addEventListener('click', () => { d.lgbtqAffirming = !d.lgbtqAffirming; renderSignupStep(); });

  document.querySelectorAll('#ts-languages-grid [data-language]').forEach(el => {
    el.addEventListener('click', () => {
      const l = el.dataset.language;
      const i = d.languages.indexOf(l);
      if (i === -1) d.languages.push(l); else d.languages.splice(i, 1);
      renderSignupStep();
    });
  });
  document.querySelectorAll('#ts-languages-grid [data-remove-custom-language]').forEach(el => {
    el.addEventListener('click', () => {
      d.languages = d.languages.filter(l => l !== el.dataset.removeCustomLanguage);
      renderSignupStep();
    });
  });
  const tsOtherBtn = document.getElementById('ts-other-btn');
  if (tsOtherBtn) tsOtherBtn.addEventListener('click', () => { d.showOtherLanguage = true; renderSignupStep(); });
  const tsOtherAddBtn = document.getElementById('ts-other-add-btn');
  if (tsOtherAddBtn) tsOtherAddBtn.addEventListener('click', () => {
    const val = document.getElementById('ts-other-select').value;
    if (val && !d.languages.includes(val)) d.languages.push(val);
    renderSignupStep();
  });

  document.querySelectorAll('#ts-format-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      const f = el.dataset.format;
      const i = d.formats.indexOf(f);
      if (i === -1) d.formats.push(f); else d.formats.splice(i, 1);
      renderSignupStep();
    });
  });
  const tsCityInput = document.getElementById('ts-city');
  if (tsCityInput) tsCityInput.addEventListener('input', () => {
    d.city = tsCityInput.value;
    document.getElementById('ts-next').disabled = !(d.city.trim() && d.state);
  });
  const tsStateSelect = document.getElementById('ts-state');
  if (tsStateSelect) tsStateSelect.addEventListener('change', () => { d.state = tsStateSelect.value; renderSignupStep(); });
  const selfPayNoteInput = document.getElementById('ts-selfpaynote');
  if (selfPayNoteInput) selfPayNoteInput.addEventListener('input', () => { d.selfPayNote = selfPayNoteInput.value; });
  /* Slider and number field drive the same value. The slider moves in 5s for a
     usable drag across $20-$600; the number field takes any exact figure,
     because plenty of people charge $165 and a $10 step could not reach it. */
  /* Just a number. A slider was imprecise at every useful figure and its range
     excluded both ends of the market -- typing is faster and exact. */
  const rateNumber = document.getElementById('ts-rate-number');
  if (rateNumber) rateNumber.addEventListener('input', () => { d.rateMin = Number(rateNumber.value) || 0; });
  document.querySelectorAll('#ts-payment-grid [data-payment]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.payment;
    const at = d.paymentOptions.indexOf(k);
    if (at === -1) d.paymentOptions.push(k); else d.paymentOptions.splice(at, 1);
    renderSignupStep();
  }));

  document.querySelectorAll('textarea[data-mandatory-prompt-index]').forEach(el => {
    el.addEventListener('input', () => {
      d.mandatoryPromptAnswers[Number(el.dataset.mandatoryPromptIndex)] = el.value;
      document.getElementById('ts-next').disabled = !d.mandatoryPromptAnswers.every(a => a.trim().length > 0);
    });
  });
  document.querySelectorAll('#ts-optional-prompts-grid .chip-option').forEach(el => {
    el.addEventListener('click', () => {
      const q = el.dataset.optionalPrompt;
      const i = d.selectedOptionalPrompts.indexOf(q);
      if (i !== -1) {
        d.selectedOptionalPrompts.splice(i, 1);
      } else if (d.selectedOptionalPrompts.length < MAX_OPTIONAL_PROMPTS) {
        d.selectedOptionalPrompts.push(q);
      }
      renderSignupStep();
    });
  });
  document.querySelectorAll('textarea[data-optional-prompt-answer]').forEach(el => {
    el.addEventListener('input', () => { d.optionalPromptAnswers[el.dataset.optionalPromptAnswer] = el.value; });
  });
  const tsPhoto = document.getElementById('ts-photo');
  if (tsPhoto) tsPhoto.addEventListener('change', () => {
    const file = tsPhoto.files[0];
    if (!file) return;
    readPhoto(file).then(src => { if (src) { d.photo = src; renderSignupStep(); } });
  });
  document.querySelectorAll('input[data-optional-prompt-photo]').forEach(el => {
    el.addEventListener('change', () => {
      const file = el.files[0];
      if (!file) return;
      const q = el.dataset.optionalPromptPhoto;
      /* Same downscale as every other photo path -- these ride along in
         optional_prompts and were the largest un-shrunk payload of the lot. */
      readPhoto(file).then(src => { if (src) { d.optionalPromptPhotos[q] = src; renderSignupStep(); } });
    });
  });
  document.querySelectorAll('[data-remove-optional-prompt]').forEach(el => {
    el.addEventListener('click', () => {
      const q = el.dataset.removeOptionalPrompt;
      d.selectedOptionalPrompts = d.selectedOptionalPrompts.filter(p => p !== q);
      delete d.optionalPromptAnswers[q];
      delete d.optionalPromptPhotos[q];
      renderSignupStep();
    });
  });

  const ongoingSwitch = document.getElementById('ts-ongoing-switch');
  if (ongoingSwitch) ongoingSwitch.addEventListener('click', () => { d.acceptingOngoing = !d.acceptingOngoing; renderSignupStep(); });
  const mktSwitch = document.getElementById('ts-marketing-switch');
  if (mktSwitch) mktSwitch.addEventListener('click', () => { d.marketingOptIn = !d.marketingOptIn; renderSignupStep(); });
  const ondemandSwitch = document.getElementById('ts-ondemand-switch');
  if (ondemandSwitch) ondemandSwitch.addEventListener('click', () => {
    if (!d.onDemand && !d.agreedToOnDemandPolicy) {
      openTherapistOnDemandAgreement(() => { d.agreedToOnDemandPolicy = true; d.onDemand = true; renderSignupStep(); });
    } else {
      d.onDemand = !d.onDemand;
      renderSignupStep();
    }
  });
  /* Slot handlers removed with the field — they bound to nothing. Slots are
     managed on the On Demand tab, which has the real editor. */

  const backBtn = document.getElementById('ts-back');
  if (backBtn) backBtn.addEventListener('click', () => { signupStep--; renderSignupStep(); });

  document.getElementById('ts-next').addEventListener('click', () => {
    saveSignupProgress(d);            // keep what they have typed so far
    if (signupStep < TOTAL_SIGNUP_STEPS - 1) {
      signupStep++;
      renderSignupStep();
    } else {
      finishTherapistSignup();
    }
  });
}

/* ---- partial signup saves -------------------------------------------------
   The therapist row was only written when the wizard FINISHED. Someone who
   made an account, typed their name, added a licence and then closed the tab
   left nothing behind but an auth user -- their work was gone, and there was
   no way to tell "started and stalled" from "never began".

   Now every Continue writes what exists so far. Two rules keep that safe:
     - only non-empty values are sent, because PostgREST's merge-duplicates
       upsert overwrites every column in the payload, so posting an empty
       array would erase a real one on the next step;
     - it never sends `published`, same as the full save -- billing owns that.

   Best-effort and silent: a failed autosave must not interrupt someone in the
   middle of writing their profile. localStorage is not a fallback here because
   the point is reaching a database you can email from.
--------------------------------------------------------------------------- */
function draftToPartialRow(d, userId) {
  const row = { user_id: userId };
  const put = (k, v) => {
    if (v == null) return;
    if (typeof v === 'string' && !v.trim()) return;
    if (Array.isArray(v) && !v.length) return;
    row[k] = v;
  };
  put('name', (d.name || '').trim());
  put('photo', d.photo);
  put('credentials', (d.credentials || []).map(c => (c || '').trim()).filter(Boolean));
  put('pronouns', (d.pronouns || '').trim());
  put('website', (d.website || '').trim());
  put('specialties', d.tags);
  put('modalities', d.modalities);
  put('style', d.style);
  put('practice_type', d.practiceType);
  put('best_for', (d.bestFor || '').trim());
  put('languages', d.languages);
  put('formats', d.formats);
  put('insurance', d.insuranceList);
  put('payment_options', d.paymentOptions);
  put('gender', d.gender);
  if (d.rateMin) row.rate_min = d.rateMin;
  if (d.city || d.state) row.location = { city: d.city || '', state: d.state || '' };
  if (typeof d.lgbtqAffirming === 'boolean') row.lgbtq_affirming = d.lgbtqAffirming;
  if (typeof d.marketingOptIn === 'boolean') row.marketing_opt_in = d.marketingOptIn;
  return row;
}

let signupSaveTimer = null;
function saveSignupProgress(d) {
  const s = loadAuthSession();
  if (!authReady() || !s || !s.user) return;
  clearTimeout(signupSaveTimer);
  signupSaveTimer = setTimeout(async () => {
    const row = draftToPartialRow(d, s.user.id);
    unavailableColumns.forEach(c => { delete row[c]; });
    try {
      const res = await authRest('/therapists', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
      });
      if (!res.ok) {
        const body = await res.text();
        const missing = PENDING_COLUMNS.find(c => !unavailableColumns.has(c) && body.includes(c));
        if (missing && /42703|does not exist|schema cache/i.test(body)) {
          unavailableColumns.add(missing);
          delete row[missing];
          await authRest('/therapists', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(row)
          });
        }
      }
    } catch (e) { /* never interrupt someone mid-profile */ }
  }, 600);
}

function buildTherapistMeta(d) {
  const formatLabel = d.formats.length === 2 ? 'Online & In-person'
    : d.formats.includes('video') ? 'Online only'
    : d.formats.includes('in-person') ? 'In-person only'
    : 'Format not set';
  return [formatLabel, `$${d.rateMin}/session`];
}

function finishTherapistSignup() {
  const d = newTherapistDraft;
  // When signed in, the therapist's id IS their auth uid so the DB row keys to
  // them (RLS requires user_id = auth.uid()). Demo signups keep a local id.
  const authSession = authReady() ? loadAuthSession() : null;
  const id = authSession ? authSession.user.id : 't' + Date.now();
  const nameWords = d.name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean);
  const initials = nameWords.map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
  const gradient = NEW_THERAPIST_GRADIENTS[THERAPISTS.length % NEW_THERAPIST_GRADIENTS.length];

  const trimmedCredentials = d.credentials.map(c => c.trim()).filter(Boolean);
  THERAPISTS.push({
    id, name: d.name.trim(),
    credentials: trimmedCredentials.length ? trimmedCredentials : ['Licensed Therapist'],
    licenseVerified: d.licenseVerified, licenseNumber: d.licenseNumber.trim(),
    website: d.website.trim(),
    stats: { profileViews: 0, hearts: 0, top5: 0, conversationsStarted: 0, weekViews: 0, weekHearts: 0 },
    media: { video: null, photos: [] },
    persona: { inOffice: '', outOfOffice: '' },
    ethnicity: '', affinities: [], faith: [], availabilitySlots: [],
    idealClient: emptyIdealClient(), // filled in later from the profile tab
    pronouns: d.pronouns.trim(), showPronouns: d.showPronouns,
    useCompanyName: d.useCompanyName, companyName: d.companyName.trim(),
    photo: d.photo || null,
    marketingOptIn: !!d.marketingOptIn,
    initials, gradient,
    meta: buildTherapistMeta(d),
    bestFor: d.bestFor.trim(), selfPayNote: d.selfPayNote.trim(),
    tags: d.tags, topSpecialties: (d.tags || []).slice(0, 3), practiceType: d.practiceType, externalAppointments: [],
    mandatoryPromptAnswers: d.mandatoryPromptAnswers.map(a => a.trim()),
    optionalPrompts: d.selectedOptionalPrompts.map(q => ({
      question: q,
      answer: (d.optionalPromptAnswers[q] || '').trim(),
      photo: d.optionalPromptPhotos[q] || null
    })),
    modalities: d.modalities, style: d.style,
    identity: { gender: d.gender, lgbtqAffirming: d.lgbtqAffirming }, languages: d.languages,
    formats: d.formats, rateMin: d.rateMin, insuranceList: d.insuranceList,
    location: { city: d.city.trim(), state: d.state },
    acceptingOngoing: d.acceptingOngoing, onDemand: d.onDemand, onDemandSlots: d.onDemandSlots,
    agreedToOnDemandPolicy: d.agreedToOnDemandPolicy,
    nextAvailableRank: d.acceptingOngoing ? 1 : null,
    nextAvailableLabel: d.acceptingOngoing ? 'This week' : 'Not accepting new ongoing clients',
    // profile is built but NOT listed until they subscribe
    listed: false, subscription: null
  });

  currentTherapistId = id;
  const newT = THERAPISTS.find(t => t.id === id);
  normalizeTherapist(newT);

  /* The wizard's draft has listed / licenseVerified / identityVerified all
     false, because a therapist building a profile cannot know any of them.
     But those are server-owned -- billing sets published, and the admin and
     Stripe Identity set the verification flags -- and the flow is
     landing -> payment -> welcome -> build profile, so by now they HAVE paid
     and may already have verified their ID.
     Rendering the draft told a paid, ID-verified therapist they were unlisted
     and unverified, and re-opened the pay modal. Save, then take the server's
     word for those three fields. */
  const finish = () => {
    /* Deliberately does NOT open the activate modal. Finishing a profile used
       to be met with a price the moment the last field was saved -- the first
       thing they saw after twenty minutes of writing was a paywall. The
       checklist already carries Activate as its own step, with the offer on
       it; let them look at what they built first. */
    showTherapistView();
  };

  /* A failed save here used to console.warn and carry on, so the therapist saw
     their finished profile, paid, came back, and found nothing -- twenty
     minutes of writing gone with no error at any point. The profile is only
     in memory until this request lands, so the failure has to be both LOUD
     and RECOVERABLE.

     Kept on the device first: if the request fails, the work still exists and
     can be retried rather than retyped. */
  const stashDraft = () => {
    try { localStorage.setItem('kindred-profile-unsaved', JSON.stringify(d)); } catch (e) {}
  };
  const clearDraft = () => {
    try { localStorage.removeItem('kindred-profile-unsaved'); } catch (e) {}
  };
  stashDraft();

  const saveFailed = (err) => {
    console.error('PROFILE SAVE FAILED', err);
    showTherapistView();
    const sheet = document.getElementById('confirm-sheet');
    sheet.innerHTML = `
      <div class="sheet-close"></div>
      <h2>We couldn't save your profile</h2>
      <div class="intake-sub">Everything you wrote is still here on this device — nothing is lost. This is on us, not you. Try again, and if it keeps failing send us a note and we'll sort it out.</div>
      <p class="portal-note" style="margin-top:10px;">${String(err && err.message || err).replace(/[<>&]/g, '').slice(0, 200)}</p>
      <button class="primary-btn" id="profile-save-retry">Try saving again</button>
      <button class="edit-prefs-btn" id="profile-save-email" style="color:var(--ink-soft);">Email us instead</button>`;
    document.getElementById('confirm-modal').classList.remove('hidden');
    const close = () => document.getElementById('confirm-modal').classList.add('hidden');
    sheet.querySelector('.sheet-close')?.addEventListener('click', close);
    document.getElementById('profile-save-email')?.addEventListener('click', () => {
      window.open('mailto:info@kindredtherapymatch.com?subject=' + encodeURIComponent('My Kindred profile would not save'), '_blank');
    });
    document.getElementById('profile-save-retry')?.addEventListener('click', () => {
      const b = document.getElementById('profile-save-retry');
      b.disabled = true; b.textContent = 'Saving…';
      saveTherapistProfile(newT)
        .then(() => { clearDraft(); close(); showToast('Saved — your profile is safe.'); })
        .catch(e2 => { b.disabled = false; b.textContent = 'Try saving again'; showToast('Still failing: ' + e2.message); });
    });
  };

  if (authSession) {
    saveTherapistProfile(newT)
      // Licences go to their own table. The DB derives license_states from the
      // verified ones, so these must land before we read the row back.
      .then(() => Promise.all((d.licenses || []).map(l => saveLicense(l.state, l.number))))
      .then(loadTherapistRow)
      .then(row => {
        if (!row) return;
        newT.listed             = !!row.published;
        newT.licenseVerified    = row.license_verified  === true;
        newT.identityVerified   = row.identity_verified === true;
        newT.subscriptionStatus = row.subscription_status || null;
        newT.freeUntil          = row.free_until || null;
        // No invented rate here either -- see dbRowToTherapist.
        newT.subscription       = row.published ? { status: row.subscription_status || null } : null;
      })
      .then(() => { clearDraft(); finish(); })
      .catch(saveFailed);
  } else {
    finish();
  }
}

// The "pay to list" gate. Therapists can build everything, but the profile only
// enters the match pool once they start a listing subscription.
/* One question, at the only moment it matters: the name is about to stop being
   a draft. Shows the name at card size, because "Kennady SCott" is easy to
   scroll past in a text input and hard to miss as a headline. */
function confirmNameThenActivate(t, issue) {
  const esc = v => String(v).replace(/[<>&"]/g, '');
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Is your name right?</h2>
    <div class="intake-sub">This is how it will appear to every client who sees you. ${esc(issue.why)}</div>
    <div class="name-confirm-card">
      <div class="name-confirm-as">As typed</div>
      <div class="name-confirm-name">${esc(t.name)}</div>
    </div>
    <button class="primary-btn" style="margin-top:14px;background:var(--coral);color:white;" id="name-confirm-fix">Use “${esc(issue.suggestion)}” instead</button>
    <button class="primary-btn" style="background:white;border:1.5px solid var(--coral);color:var(--coral-dark);" id="name-confirm-keep">That's correct &mdash; continue</button>
    <button class="text-btn" id="name-confirm-edit" style="color:var(--ink-soft);">Let me edit it myself</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close'); if (sc) sc.addEventListener('click', close);

  document.getElementById('name-confirm-fix').addEventListener('click', () => {
    t.name = issue.suggestion;
    rememberNameAccepted(t.name);
    persistProfileSoon(t);
    close(); openActivateProfile();            // straight on to the offer
  });
  document.getElementById('name-confirm-keep').addEventListener('click', () => {
    rememberNameAccepted(t.name);              // asked and answered; never again for this spelling
    close(); openActivateProfile();
  });
  document.getElementById('name-confirm-edit').addEventListener('click', () => {
    close();
    profileMode = 'edit';
    editSectionsOpen.first = true;
    showTScreen('t-profile');
    setTimeout(() => {
      const el = document.getElementById('t-name-input');
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); }
    }, 120);
  });
}

function openActivateProfile() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  /* Now the RENEWAL offer, not onboarding. Only reachable once the free
     period is ending or over — there is nothing to buy before that. */
  if (!t) return;
  const ls = listingState(t);
  if (ls.subscribed || !(ls.lapsed || ls.endingSoon)) return;
  /* Last look at the name before it becomes public. Activating is the moment
     it stops being a draft and starts being how strangers read them, so a
     spelling nobody has confirmed gets one question here rather than living on
     the card until someone notices. Only fires when nameIssue() has something
     to say, so a normal name never sees this screen. */
  const issue = nameIssue(t.name);
  if (issue) { confirmNameThenActivate(t, issue); return; }
  const p = listingPricing();
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>${ls.lapsed ? 'Keep your profile active' : 'Kindred stops being free soon'}</h2>
    <div class="intake-sub">${ls.lapsed
      ? `Your profile and everything in it is saved. Clients stop seeing it until you keep it active.`
      : `${ls.daysLeft} day${ls.daysLeft === 1 ? '' : 's'} left. Keep it active and nothing changes &mdash; same profile, same matches.`}</div>
    <!-- This screen is the RENEWAL offer now, not onboarding. Nobody pays to
         sign up, so the only people who reach it are six months in and
         deciding whether to carry on. The 30-day trial stays because the
         Stripe link carries it — it is a grace period on the decision, not a
         second free trial on top of the six months. -->
    <div class="activate-plan ${p.founding ? 'founding' : ''}">
      <!-- The badge used to count down to the next price rise. It read as a
           threat on the one screen where someone is deciding to pay, and it
           made the deadline the story instead of the rate. Same offer, stated
           as what they get: $20 a month less than the standard rate. -->
      ${p.founding ? `<div class="activate-badge">🌟 Founding rate — $${p.introRate.toFixed(2)}/mo instead of $${p.standardRate.toFixed(2)}</div>` : ''}
      <div class="activate-price">Free<span> for 30 days</span></div>
      ${p.founding
        ? `<div class="activate-terms">then $${p.introRate.toFixed(2)}/mo, locked for ${p.introMonths} months · cancel anytime</div>`
        : `<div class="activate-terms">then $${p.standardRate.toFixed(2)}/mo · cancel anytime</div>`}
    </div>
    <ul class="policy-list">
      <li><strong>Nothing is charged for 30 days.</strong> Your card is saved now; cancel before day 31 and you're never billed</li>
      <li>Your profile, your prompts, your photos and your conversations all stay exactly as they are</li>
      <li>Cancel anytime — your profile just unlists, nothing is deleted</li>
      <!-- The coupon's 12 months run from signup and the trial burns the
           first, so only 11 carry an invoice -- $20 x 12 was the wrong sum.
           Counted right the year is better: a free month is worth the STANDARD
           rate. Must stay identical to the figure activate.js puts on the
           website; two different savings numbers for one offer is worse than
           either of them being slightly conservative. -->
      ${p.founding ? `<li>Your $${p.introRate.toFixed(2)} rate is locked for a full ${p.introMonths} months — $${Math.floor(p.standardRate + (p.standardRate - p.introRate) * (p.introMonths - 1))} less than the standard $${p.standardRate.toFixed(2)}/mo across your first year</li>` : ''}
    </ul>
    <div id="activate-status"></div>
    <button class="primary-btn" style="margin-top:14px;background:var(--coral);color:white;" id="activate-pay-btn">Continue to secure checkout →</button>
    <button class="text-btn" id="activate-later-btn" style="color:var(--ink-soft);">I'll do this later</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close'); if (sc) sc.addEventListener('click', close);
  document.getElementById('activate-later-btn').addEventListener('click', () => { close(); renderTherapistInsights(); });

  // Payment happens on the WEBSITE (Stripe web checkout), never as an in-app
  // purchase — so Apple takes no cut and there's no IAP surface in the app.
  document.getElementById('activate-pay-btn').addEventListener('click', () => {
    const btn = document.getElementById('activate-pay-btn');
    const status = document.getElementById('activate-status');
    const founding = p.founding;
    const plan = founding ? 'founding' : 'standard';

    // Never simulate activation in a shipped build — that would hand out free
    // listings. Production ALWAYS goes to the web checkout; the simulated path
    // exists only for local/demo testing.
    if (KINDRED_FLAGS.therapistBillingLive || PRODUCTION_BUILD) {
      // Real: hand off to the website's Stripe checkout. Listing flips server-side
      // when the subscription is active; the app reflects it on next refresh.
      /* Same origin as the app now, so this is a page in the product rather
         than a trip to another site -- navigate instead of popping a tab. A
         new tab used to be the only way to keep their session alive; the
         session carries now, and a stranded second tab was its own confusion. */
      const sess = authReady() && loadAuthSession();
      const email = sess && sess.user && sess.user.email ? `&email=${encodeURIComponent(sess.user.email)}` : '';
      /* checkout=now tells activate.html to build the Stripe URL -- which is
         where the founding-rate ladder and the trial link live, in ONE place
         -- and go there immediately rather than rendering the offer a second
         time. The therapist sees this modal, then Stripe. */
      btn.disabled = true; btn.textContent = 'Taking you to checkout…';
      location.href = `${THERAPIST_BILLING_URL}?plan=${plan}&offer=trial30&checkout=now${email}`;
      return;
    }

    // Demo (therapistBillingLive off): simulate the web handoff + activation so
    // the flow can be shown end-to-end without the live backend.
    btn.disabled = true; btn.textContent = 'Opening secure checkout…';
    status.innerHTML = `<div class="portal-note" style="margin-bottom:8px;">Redirecting to the Kindred website…</div>`;
    setTimeout(() => {
      t.listed = true;
      t.subscription = { plan, founding, introRate: p.introRate, standardRate: p.standardRate, introMonths: p.introMonths };
      t.published = true;
      if (authReady() && loadAuthSession()) saveTherapistProfile(t).catch(e => console.warn('listing save deferred:', e.message));
      close();
      showToast(founding ? "You're a founding member — your profile is live! 🌟" : 'Your profile is live!');
      renderTherapistInsights();
    }, 1200);
  });
}

function logout() {
  if (authReady()) authSignOut();  // clear the Supabase session (fire-and-forget)
  // A therapy app on a shared device must not leave someone's intake and
  // conversations behind after they log out.
  clearClientState();
  accountType = null;
  therapistWelcomeShown = false;
  document.getElementById('bottom-nav').classList.add('hidden');
  document.getElementById('therapist-nav').classList.add('hidden');
  showScreen('account-type');
}

// ===== THERAPIST VIEW =====
let currentTherapistId = THERAPISTS[0].id;
let profileShowOtherLanguage = false; // transient UI flag for the profile editor's "+Other" language picker — not real therapist data

let therapistWelcomeShown = false; // once per login, reset on logout

function showTherapistView() {
  document.getElementById('bottom-nav').classList.add('hidden');
  document.getElementById('therapist-nav').classList.remove('hidden');
  showTScreen('t-insights');
  /* Only for someone who has actually been visible to clients. It reports the
     week's hearts and matches, and a therapist who has not activated has never
     been matchable -- so it greeted a brand-new signup with a modal of zeros
     in front of the checklist that was the only thing they needed to see.
     Nothing to report is not a reason to interrupt. */
  const t = THERAPISTS.find(x => x.id === currentTherapistId);
  const everLive = !!(t && listingState(t).visible);
  if (!therapistWelcomeShown && everLive) {
    therapistWelcomeShown = true;
    openTherapistWelcome();
  }
}

// Login greeting with the week's numbers — the dashboard's headline stats,
// served before the therapist even asks.
function openTherapistWelcome() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  if (!t) return;
  const hearts = t.stats.weekHearts;
  const matchCount = matches.filter(m => m.therapist.id === t.id && (m.status === 'pending' || m.status === 'matched')).length;
  const firstName = t.name.replace(/^Dr\.?\s*/i, '').split(' ')[0];
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2 class="welcome-stats-title">Welcome back, ${firstName}</h2>
    <div class="welcome-stats-line">💜 You got <strong>${hearts} heart${hearts === 1 ? '' : 's'}</strong> and <strong>${matchCount} match${matchCount === 1 ? '' : 'es'}</strong> this week.</div>
    <button class="primary-btn" style="margin-top:16px;background:var(--coral);color:white;" id="welcome-insights-btn">See My Insights</button>
    <button class="text-btn" id="welcome-close-btn" style="color:var(--ink-soft);">Continue to Home</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  document.getElementById('welcome-insights-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    showTScreen('t-insights');
  });
  document.getElementById('welcome-close-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
}

function showTScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('#therapist-nav .nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
  const navBtn = document.querySelector(`#therapist-nav .nav-btn[data-tscreen="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (name === 't-home') renderTherapistHome();
  if (name === 't-requests') renderRequests();
  if (name === 't-insights') renderTherapistInsights();
  if (name === 't-profile') renderTherapistProfile();
  if (name === 't-settings') renderTherapistSettings();
}

// ===== THERAPIST INSIGHTS DASHBOARD =====
function renderTherapistInsights() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  const container = document.getElementById('t-insights-content');
  // "Top 5" = how many clients are using one of their 5 match-request slots
  // on this therapist right now (pending or matched), on top of the seeded
  // historical baseline.
  const liveTop5 = matches.filter(m => m.therapist.id === t.id && (m.status === 'pending' || m.status === 'matched')).length;
  // clients booked = ongoing matches the therapist marked booked + paid on-demand sessions
  const ongoingBooked = matches.filter(m => m.therapist.id === t.id && m.booked).length;
  const odBookedCount = matches.filter(m => m.therapist.id === t.id && m.status === 'ondemand' && m.paymentStatus === 'paid').length;
  const clientsBooked = (t.stats.clientsBooked || 0) + ongoingBooked + odBookedCount;
  const tiles = [
    { label: 'Profile views', value: t.stats.profileViews, delta: `+${t.stats.weekViews} this week` },
    { label: 'Potential clients saved your profile', value: t.stats.hearts, delta: `+${t.stats.weekHearts} this week` },
    { label: "In clients' Top 5", value: t.stats.top5 + liveTop5, delta: 'active request slots' },
    { label: 'Conversations started', value: t.stats.conversationsStarted, delta: 'all time' },
    { label: 'Clients booked through Kindred', value: clientsBooked, delta: 'ongoing + on-demand' },
    { label: 'On-Demand sessions booked', value: (t.stats.onDemandBooked || 0) + odBookedCount, delta: 'all time' }
  ];
  container.innerHTML = `
    <!-- Was "Your profile isn't listed yet — Activate", shown to anyone who
         had not paid. Nobody pays to sign up now, so the only version of this
         worth showing is at the far end: the free period running out. -->
    ${(() => { const s = listingState(t);
      if (s.lapsed) return `<div class="activate-banner"><div><strong>Kindred is no longer free for your account</strong><span>Your profile is saved — clients stop seeing it until you keep it active.</span></div><button class="activate-banner-btn" id="t-activate-btn">Keep it active</button></div>`;
      if (s.endingSoon) return `<div class="activate-banner"><div><strong>${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} of free Kindred left</strong><span>Keep your profile active and nothing changes for your clients.</span></div><button class="activate-banner-btn" id="t-activate-btn">Keep it active</button></div>`;
      return ''; })()}
    ${verificationBannerHtml(t)}
    <div class="intake-sub" style="margin-bottom:14px;">How clients are finding and responding to your profile.</div>
    <div class="stat-grid">
      ${tiles.map(s => `
        <div class="stat-tile">
          <div class="stat-value">${s.value}</div>
          <div class="stat-label">${s.label}</div>
          <div class="stat-delta">${s.delta}</div>
        </div>
      `).join('')}
    </div>
    <button class="edit-prefs-btn share-profile-btn" id="t-share-profile-btn">↗ Share my profile</button>
    <div class="portal-note" style="margin-top:12px;">Counts reflect this demo session plus seeded history — real analytics arrive with the production backend.</div>
    <div class="home-accepting-card" style="margin-top:18px;margin-bottom:0;">
      <div class="must-have-toggle card-toggle">
        <div class="toggle-label"><strong>Accepting ongoing clients</strong><span>${t.acceptingOngoing ? 'New clients can find and book you' : "You're shown in Discover marked not accepting — clients can save you for later"}</span></div>
        <div class="switch ${t.acceptingOngoing ? 'on' : ''}" id="t-insights-ongoing-switch"></div>
      </div>
      <div class="must-have-toggle card-toggle">
        <div class="toggle-label"><strong>Offer a waitlist</strong><span>${t.offerWaitlist ? "Clients who find you while you're full can join your waitlist" : 'Off — clients can only save you for later'}</span></div>
        <div class="switch ${t.offerWaitlist ? 'on' : ''}" id="t-insights-waitlist-switch"></div>
      </div>
    </div>
  `;
  const activateBtn = document.getElementById('t-activate-btn');
  if (activateBtn) activateBtn.addEventListener('click', openActivateProfile);
  wireGettingStarted();
  const shareProfileBtn = document.getElementById('t-share-profile-btn');
  if (shareProfileBtn) shareProfileBtn.addEventListener('click', openShareMyProfile);
  const insOngoingSwitch = document.getElementById('t-insights-ongoing-switch');
  if (insOngoingSwitch) insOngoingSwitch.addEventListener('click', () => {
    t.acceptingOngoing = !t.acceptingOngoing;
    t.nextAvailableRank = t.acceptingOngoing ? 1 : null;
    t.nextAvailableLabel = t.acceptingOngoing ? 'This week' : 'Not accepting new ongoing clients';
    renderTherapistInsights();
  });
  const insWaitlistSwitch = document.getElementById('t-insights-waitlist-switch');
  if (insWaitlistSwitch) insWaitlistSwitch.addEventListener('click', () => {
    t.offerWaitlist = !t.offerWaitlist;
    renderTherapistInsights();
  });
}

document.querySelectorAll('#therapist-nav .nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showTScreen(btn.dataset.tscreen));
});
document.getElementById('therapist-logout-0').addEventListener('click', logout);
document.getElementById('therapist-logout-1').addEventListener('click', logout);
document.getElementById('therapist-logout-2').addEventListener('click', logout);
document.getElementById('therapist-logout-3').addEventListener('click', logout);
document.getElementById('therapist-logout-4').addEventListener('click', logout);

function updateTNavBadge() {
  const badge = document.getElementById('t-nav-badge');
  const count = matches.filter(m => m.therapist.id === currentTherapistId && m.status === 'pending').length;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

// ===== THERAPIST HOME — combined weekly schedule =====
// Pulls together three sources into one view: on-demand one-time bookings
// (already have a real slot), ongoing matches with a recurring time set
// during accept, and appointments the therapist adds manually for anything
// booked outside Kindred — so this is their real full week, not just what
// happened on the platform.
// The Home tab is an AVAILABILITY calendar, not a scheduling calendar: it
// answers "what spaces do I have open?" for new ongoing clients and for
// one-time on-demand sessions. Filled slots show as Booked; the therapist
// manages their openings here.
function odSlotSort(s) {
  const day = s.day || (s.label || '').split(' ')[0];
  const time = s.time || (s.label || '').split(' ').slice(1).join(' ');
  return DAYS_OF_WEEK.indexOf(day) * 10000 + timeSortKey(time);
}

function renderTherapistHome() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  document.getElementById('t-home-title').innerHTML = `On Demand <button class="od-info-btn" id="od-info-btn" aria-label="What is On-Demand?">ⓘ</button>`;
  const list = document.getElementById('t-home-list');
  if (!onDemandInfoShown) { onDemandInfoShown = true; openOnDemandInfo(); }

  const odBooked = matches.filter(m => m.therapist.id === t.id && m.status === 'ondemand' && m.paymentStatus === 'paid');
  const p = ondemandPricing(t);

  let html = onDemandToggleHtml(t);
  html += `<div class="avail-section-title">⚡ On-demand this week</div>`;
  /* Leads, before any of the setup below. Slot times and a session price are
     wasted effort while nobody can see the profile they hang off -- and this
     screen happily walked a therapist through all of it without mentioning
     that. Only shown while something is actually blocking them. */
  html += blockedBannerHtml(t);
  if (t.onDemandBanned) {
    html += `<p class="portal-note">On-demand access is suspended after a reported no-show. Ongoing matching is unaffected.</p>`;
  } else if (!t.onDemand) {
    html += `<p class="portal-note">On-demand is off. Turn it on above to offer one-time sessions this week.</p>`;
  } else {
    // ----- price (talks to what the client is charged) -----
    html += `<div class="t-form-label">Your On-Demand session price ($)</div>
      <input type="number" class="t-rate-input" id="od-rate-input" value="${t.onDemandRate}">
      <p class="portal-note" style="margin-top:4px;">The client pays <strong>$${p.clientTotal.toFixed(2)}</strong> — your $${p.price.toFixed(2)} plus the Stripe fee $${p.stripeFee.toFixed(2)}. Kindred keeps 5%; you net <strong>$${p.therapistNet.toFixed(2)}</strong>.</p>`;

    // ----- weekly calendar picker (buttons, not free text) -----
    html += `<div class="t-form-label" style="margin-top:16px;">Add openings for this week</div>`;
    html += `<div class="od-day-row">${DAYS_OF_WEEK.map(d => `<button type="button" class="od-day-btn ${odNewSlotDay === d ? 'selected' : ''}" data-od-day="${d}">${d}</button>`).join('')}</div>`;
    html += `<div class="add-slot-row"><input type="time" id="od-time-input" value="10:00"><button id="add-od-btn" ${odNewSlotDay ? '' : 'disabled'}>Add ${odNewSlotDay || 'time'}</button></div>`;

    // ----- this week's openings -----
    if (t.onDemandSlots.length === 0) {
      html += `<p class="portal-note">No openings yet — pick a day above and add a time.</p>`;
    } else {
      const sorted = t.onDemandSlots.map((s, i) => ({ s, i })).sort((a, b) => odSlotSort(a.s) - odSlotSort(b.s));
      html += `<div class="od-slots">` + sorted.map(({ s, i }) => {
        const booked = odBooked.find(m => m.slotLabel === s.label);
        return `<div class="avail-slot ${booked ? 'filled' : 'open'}">
          <div class="avail-when"><span class="avail-day">${s.label}</span></div>
          <span class="avail-status ${booked ? 'booked' : ''}">${booked ? 'Booked' : 'Open'}</span>
          ${booked ? '' : `<button class="appt-remove" data-remove-od="${i}">✕</button>`}
        </div>`;
      }).join('') + `</div>`;
    }
  }

  list.innerHTML = html;

  wireEmptyStateActions(t);
  bindOnDemandToggle(t);
  const odInfoBtn = document.getElementById('od-info-btn');
  if (odInfoBtn) odInfoBtn.addEventListener('click', openOnDemandInfo);
  const odRateInput = document.getElementById('od-rate-input');
  if (odRateInput) odRateInput.addEventListener('change', () => { t.onDemandRate = Number(odRateInput.value) || 0; renderTherapistHome(); });
  document.querySelectorAll('[data-od-day]').forEach(btn => btn.addEventListener('click', () => { odNewSlotDay = btn.dataset.odDay; renderTherapistHome(); }));
  const addOdBtn = document.getElementById('add-od-btn');
  if (addOdBtn) addOdBtn.addEventListener('click', () => {
    if (!odNewSlotDay) { showToast('Pick a day first.'); return; }
    const time = formatTime12h(document.getElementById('od-time-input').value);
    const label = `${odNewSlotDay} ${time}`;
    if (t.onDemandSlots.some(s => s.label === label)) { showToast('That opening is already added.'); return; }
    const rank = t.onDemandSlots.length ? Math.max(...t.onDemandSlots.map(s => s.rank || 0)) + 1 : 1;
    t.onDemandSlots.push({ label, day: odNewSlotDay, time, rank });
    renderTherapistHome();
  });
  list.querySelectorAll('[data-remove-od]').forEach(btn => {
    btn.addEventListener('click', () => { t.onDemandSlots.splice(Number(btn.dataset.removeOd), 1); renderTherapistHome(); });
  });
}

// Card for an accepted/started conversation (shared between Active & Archived).
function convoCardHtml(m) {
  const gi = matches.indexOf(m);
  const archived = !!m.archived;
  return `<div class="request-card resolved">
    <span class="resolved-tag matched">✓ Accepted</span> — now chatting
    ${m.clientName ? `<div class="request-need" style="margin-top:6px;">Client: <strong>${m.clientName}</strong></div>` : ''}
    ${m.scheduledDay ? `<div class="request-need" style="margin-top:6px;">Recurring: <strong>${m.scheduledDay}s at ${m.scheduledTime}</strong></div>` : ''}
    <button class="message-btn-full" data-action="message" style="margin-top:10px;">💬 Message</button>
    ${m.booked
      ? `<div class="booked-flag">✓ Booked as a client — counted in your stats</div>`
      : `<button class="message-btn-full booked-btn" data-book-mi="${gi}" style="margin-top:8px;">📅 I booked this client</button>`}
    <button class="text-btn convo-archive-btn" data-${archived ? 'unarchive' : 'archive'}-match="${gi}">${archived ? '↩ Move back to active' : '🗄 Archive'}</button>
  </div>`;
}
// Card for a conversation the therapist started from the waitlist.
function startedCardHtml(c, idx) {
  const archived = !!c.archived;
  return `<div class="request-card resolved">
    <span class="resolved-tag matched">✓ Conversation</span>
    <div class="request-need" style="margin-top:6px;">Client: <strong>${c.name}</strong></div>
    <button class="message-btn-full" data-action="message" style="margin-top:10px;">💬 Message</button>
    <button class="text-btn convo-archive-btn" data-${archived ? 'unarchive' : 'archive'}-started="${idx}">${archived ? '↩ Move back to active' : '🗄 Archive'}</button>
  </div>`;
}
/* ===== EMPTY SCREENS ARE THE BEST PLACE TO SAY WHAT'S MISSING ================
   "Nothing here yet." is true and useless. It reads the same to a therapist
   who went live an hour ago as to one who has never paid, never added a
   licence, and will never receive anything until they do. These screens are
   where a new therapist spends their first week, and they were the only ones
   saying nothing.

   The single next action on the way to being findable. Same order as the
   checklist, and returns null once they are live -- at which point an empty
   screen genuinely is just empty, and pretending otherwise would be nagging. */
function nextStepToLive(t) {
  const s = listingState(t);
  if (s.visible) return null;
  const gaps = s.gaps;
  if (gaps.length) {
    return { why: `your profile still needs ${gaps.join(' and ')}`,
             label: 'Finish my profile', id: 't-empty-profile' };
  }
  /* No payment step: signing up is free and the first six months are too.
     A lapsed free period is the one money-shaped blocker left. */
  if (listingState(t).lapsed) {
    return { why: 'Kindred is no longer free for your account',
             label: 'Keep my profile active', id: 't-empty-activate' };
  }
  const licences = t.licenses || [];
  const denied = licences.find(l => l.rejectedAt);
  if (!licences.length || denied) {
    return { why: denied ? `your ${denied.state} licence needs correcting` : 'we don’t have a licence to check yet',
             label: denied ? 'Fix my license' : 'Add my license', id: 't-empty-licence' };
  }
  if (!t.identityVerified) {
    return { why: 'your identity isn’t verified yet',
             label: 'Verify my ID', id: 't-empty-identity' };
  }
  // everything done on their side; the licence check is ours to finish
  return { why: 'we’re still checking your licence against your state board',
           label: null, id: null };
}

/* The blocker, once per SCREEN. It is a fact about the account, not about a
   section, so repeating it inside each collapsible said the same sentence
   three times on one page -- the same duplication that had to be removed from
   Settings. Returns '' when nothing is blocking. */
function blockedBannerHtml(t) {
  const next = nextStepToLive(t);
  if (!next) return '';
  return `<div class="empty-coach is-blocked">
    <p class="empty-coach-title">Clients can’t find you yet</p>
    <p class="empty-coach-body">Nothing will arrive here while ${next.why}.</p>
    ${next.label ? `<button class="empty-coach-btn" id="${next.id}">${next.label}</button>`
                 : `<p class="empty-coach-sub">Nothing for you to do &mdash; we’ll email you the moment it clears.</p>`}
  </div>`;
}

/* What a given section would hold. Always the section's own description --
   the banner above already says why it is empty today. */
function therapistEmptyState(t, what, opts) {
  const extra = (opts && opts.whenLive) || '';
  const live = !nextStepToLive(t);
  return `<div class="empty-coach">
    <p class="empty-coach-body">${what}</p>
    ${(extra && live) ? `<p class="empty-coach-sub">${extra}</p>` : ''}
  </div>`;
}

/* Buttons inside an empty state, wired wherever one is rendered. */
function wireEmptyStateActions(t) {
  const go = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  go('t-empty-profile',  () => { profileMode = 'edit'; showTScreen('t-profile'); });
  go('t-empty-activate', () => openActivateProfile());
  go('t-empty-licence',  () => openLicenseNumberField());
  go('t-empty-identity', () => startIdentityVerification(document.getElementById('t-empty-identity')));
  go('t-empty-ideal',    () => { profileMode = 'ideal'; showTScreen('t-profile'); });
}

function inquirySectionHtml(key, title, count, body, emptyHtml) {
  return `<details class="edit-section inquiry-section" data-inquiry-section="${key}" ${inquiriesOpen[key] ? 'open' : ''}>
    <summary><span class="edit-section-title">${title}</span><span class="edit-section-hint">${count}</span><span class="edit-caret">▾</span></summary>
    <div class="edit-section-body">${body || emptyHtml || `<p class="empty-state" style="margin:8px 0;">Nothing here yet.</p>`}</div>
  </details>`;
}

function renderRequests() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  document.getElementById('t-requests-title').textContent = 'Inquiries';
  const list = document.getElementById('requests-list');
  const myRequests = matches.filter(m => m.therapist.id === currentTherapistId && m.status !== 'ondemand');
  const myBookings = matches.filter(m => m.therapist.id === currentTherapistId && m.status === 'ondemand');
  const pendingCount = myRequests.filter(m => m.status === 'pending').length;

  const pendingCardHtml = m => {
    const ideal = idealMatchResult(t);
    return `<div class="request-card${ideal.isIdeal ? ' ideal-match' : ''}">
      ${ideal.isIdeal ? `<div class="ideal-flag" title="Matches the ideal client you described — only you can see this">✦ Ideal match${ideal.reasons.length ? ` · ${ideal.reasons.join(' · ')}` : ''}</div>` : ''}
      <div class="request-need">Looking for support with: <strong>${m.needsSnapshot.length ? m.needsSnapshot.join(', ') : 'general support'}</strong></div>
      ${m.desiredFrequency ? `<div class="request-need">Hoping to meet: <strong>${m.desiredFrequency}</strong></div>` : ''}
      ${m.introMessage ? `<div class="request-intro">&ldquo;${m.introMessage}&rdquo;</div>` : ''}
      <button class="message-btn-full" data-action="message">💬 Message before deciding</button>
      ${m._showScheduleForm ? `
        <div class="t-form-label">Set a recurring time for this client</div>
        <div class="schedule-row">
          <select id="schedule-day">${DAYS_OF_WEEK.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
          <input type="time" id="schedule-time" value="10:00">
        </div>
        <button class="message-btn-full" data-action="confirm-schedule">Confirm Schedule</button>
      ` : `
        <div class="request-actions">
          <button class="decline-btn" data-decision="decline">Decline</button>
          <button class="accept-btn" data-decision="accept">Accept</button>
        </div>
      `}
    </div>`;
  };
  const bookingCardHtml = (m, i) => {
    if (m.paymentStatus === 'authorized') {
      return `<div class="request-card">
        <div class="request-need">On-Demand request — <strong>${m.slotLabel}</strong> · $${m.amountPaid} authorized</div>
        <div class="request-intro">The client's card is on hold — it's only charged if you accept. Accepting commits you to showing up: a reported no-show refunds them in full and suspends your On-Demand access.</div>
        <div class="decision-row">
          <button class="decline-btn" data-od-decline="${i}">Decline</button>
          <button class="accept-btn" data-od-accept="${i}">Accept — process $${m.amountPaid}</button>
        </div>
      </div>`;
    }
    if (m.paymentStatus === 'paid') return `<div class="confirmed-session">One-time session confirmed — ${m.slotLabel} · $${m.amountPaid} paid</div>`;
    if (m.paymentStatus === 'noshow-refunded') return `<div class="confirmed-session cancelled">No-show reported — ${m.slotLabel} · $${m.amountPaid} refunded to the client · your On-Demand access is suspended</div>`;
    return `<div class="confirmed-session cancelled">${m.slotLabel} — ${refundStatusLabel(m.paymentStatus)}</div>`;
  };

  // ----- Active conversations -----
  const pendings   = myRequests.filter(m => m.status === 'pending');
  const activeConvos = myRequests.filter(m => m.status === 'matched' && !m.archived);
  const activeStarted = t.startedConversations.map((c, idx) => ({ c, idx })).filter(x => !x.c.archived);
  const activeBody =
    pendings.slice().reverse().map(pendingCardHtml).join('') +
    activeConvos.slice().reverse().map(convoCardHtml).join('') +
    activeStarted.map(x => startedCardHtml(x.c, x.idx)).join('') +
    myBookings.map(bookingCardHtml).join('');
  const activeCount = pendings.length + activeConvos.length + activeStarted.length + myBookings.length;

  // ----- Waitlist -----
  const waitlistBody = t.waitlist.map((w, idx) => `
    <div class="request-card waitlist-card">
      <div class="waitlist-name">${w.name}</div>
      <button class="message-btn-full" data-start-waitlist="${idx}">Start conversation</button>
    </div>`).join('');

  // ----- Archived -----
  const archivedConvos = myRequests.filter(m => m.status === 'matched' && m.archived);
  const archivedStarted = t.startedConversations.map((c, idx) => ({ c, idx })).filter(x => x.c.archived);
  const archivedBody =
    archivedConvos.slice().reverse().map(convoCardHtml).join('') +
    archivedStarted.map(x => startedCardHtml(x.c, x.idx)).join('');
  const archivedCount = archivedConvos.length + archivedStarted.length;

  let html = '';
  html += blockedBannerHtml(t);          // once, above all three sections
  if (pendingCount) html += `<div class="hello-banner">✨ ${pendingCount === 1 ? 'A tiny hello has arrived!' : `${pendingCount} tiny hellos have arrived!`}</div>`;
  /* Each section says what IT would hold, not a shared shrug. Archived is
     deliberately plain: nothing about an empty archive needs coaching, and a
     call to action there would be noise. */
  const idealSet = ['needs','ageBands','fields','genders','modalities','availability','mustHaves']
    .some(k => Array.isArray((t.idealClient || {})[k]) && t.idealClient[k].length);
  const emptyActive = therapistEmptyState(t,
    'When a client whose needs line up with how you work reaches out, their message lands here.',
    { whenLive: idealSet
        ? 'You’ll get an email as soon as one arrives.'
        : 'Describing your ideal client is the single best thing you can do for who reaches you — <button class="empty-coach-link" id="t-empty-ideal">set it up</button>.' });
  const emptyWaitlist = therapistEmptyState(t,
    'Clients who wanted you before you had space wait here. You can start a conversation with any of them whenever you reopen.',
    { whenLive: 'They’re told you’ll be in touch if a space opens — nothing is promised on your behalf.' });
  const emptyArchived = `<div class="empty-coach">
      <p class="empty-coach-body">Conversations you archive move here. Nothing is deleted, and you can move any of them back.</p>
    </div>`;

  html += inquirySectionHtml('active', 'Active conversations', activeCount ? `${activeCount}` : '0', activeBody, emptyActive);
  html += inquirySectionHtml('waitlist', 'Waitlist', t.waitlist.length ? `${t.waitlist.length} waiting` : '0', waitlistBody, emptyWaitlist);
  html += inquirySectionHtml('archived', 'Archived', archivedCount ? `${archivedCount}` : '0', archivedBody, emptyArchived);

  list.innerHTML = html;
  wireEmptyStateActions(t);

  // remember which sections are open across re-renders
  list.querySelectorAll('details[data-inquiry-section]').forEach(el => el.addEventListener('toggle', () => { inquiriesOpen[el.dataset.inquirySection] = el.open; }));

  list.querySelectorAll('[data-od-accept]').forEach(btn => btn.addEventListener('click', () => acceptOndemandBooking(myBookings[Number(btn.dataset.odAccept)])));
  list.querySelectorAll('[data-od-decline]').forEach(btn => btn.addEventListener('click', () => declineOndemandBooking(myBookings[Number(btn.dataset.odDecline)])));
  list.querySelectorAll('[data-decision="decline"]').forEach(btn => btn.addEventListener('click', () => declineRequest(currentTherapistId)));
  list.querySelectorAll('[data-decision="accept"]').forEach(btn => btn.addEventListener('click', () => {
    const m = matches.find(m => m.therapist.id === currentTherapistId && m.status === 'pending');
    if (m) { m._showScheduleForm = true; renderRequests(); }
  }));
  list.querySelectorAll('[data-action="confirm-schedule"]').forEach(btn => btn.addEventListener('click', () => {
    confirmAcceptWithSchedule(currentTherapistId, document.getElementById('schedule-day').value, document.getElementById('schedule-time').value);
  }));
  list.querySelectorAll('[data-action="message"]').forEach(btn => btn.addEventListener('click', () => openChat(t, 'therapist')));
  list.querySelectorAll('[data-book-mi]').forEach(btn => btn.addEventListener('click', () => {
    const m = matches[Number(btn.dataset.bookMi)];
    if (!m) return;
    m.booked = true;
    showToast('Booked — added to your Clients Booked count.');
    renderRequests();
  }));
  list.querySelectorAll('[data-archive-match]').forEach(btn => btn.addEventListener('click', () => { matches[Number(btn.dataset.archiveMatch)].archived = true; showToast('Conversation archived.'); renderRequests(); }));
  list.querySelectorAll('[data-unarchive-match]').forEach(btn => btn.addEventListener('click', () => { matches[Number(btn.dataset.unarchiveMatch)].archived = false; renderRequests(); }));
  list.querySelectorAll('[data-archive-started]').forEach(btn => btn.addEventListener('click', () => { t.startedConversations[Number(btn.dataset.archiveStarted)].archived = true; showToast('Conversation archived.'); renderRequests(); }));
  list.querySelectorAll('[data-unarchive-started]').forEach(btn => btn.addEventListener('click', () => { t.startedConversations[Number(btn.dataset.unarchiveStarted)].archived = false; renderRequests(); }));
  list.querySelectorAll('[data-start-waitlist]').forEach(btn => btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.startWaitlist);
    const entry = t.waitlist[idx];
    if (!entry) return;
    t.waitlist.splice(idx, 1);
    t.startedConversations.push({ name: entry.name, archived: false });
    inquiriesOpen.active = true;
    showToast(`Started a conversation with ${entry.name}.`);
    renderRequests();
  }));
  updateTNavBadge();
}

let inquiriesOpen = { active: true, waitlist: true, archived: false }; // Inquiries collapsible sections
let idealFieldOtherOpen = false; // ideal-client field "+ Other" dropdown

// full, deduped catalogs for the ideal-client multi-selects (reflect vocab live)
/* How a therapist takes payment. A fixed list, not free text: a typo here
   would silently fail to match a client filtering on it, and "superbill" has
   about six spellings in the wild. */
const PAYMENT_OPTIONS = [
  { key: 'no_insurance',  label: "I don't accept insurance" },
  { key: 'superbills',    label: 'I offer superbills' },
  { key: 'cash_only',     label: 'Cash pay only' },
  { key: 'hsa_fsa',       label: 'HSA / FSA accepted' },
  { key: 'sliding_scale', label: 'Sliding scale available' }
];
const paymentLabel = k => (PAYMENT_OPTIONS.find(p => p.key === k) || {}).label || k;

function specialtyAll() { return [...new Set([...NEED_OPTIONS, ...OTHER_SPECIALTIES])]; }
// Specialties and modalities got the whole catalogue when the dropdowns went
// in; insurance was left on a five-chip grid, so a therapist who takes Optum,
// Medicaid or TRICARE had no way to say so. Same treatment.
function insuranceAll() { return [...new Set([...INSURANCE_OPTIONS, ...OTHER_INSURANCES])]; }
function modalityAll()  { return [...new Set([...MODALITY_OPTIONS, ...MODALITY_QUICK, ...OTHER_MODALITIES])]; }

// A drop-down multi-select for the ideal editor: selected items show as
// removable chips, and a dropdown adds more from the (large) full list.
function idealMultiSelectHtml(t, key, options, placeholder) {
  const sel = t.idealClient[key] || [];
  return `
    <div class="ideal-multi">
      ${sel.length
        ? `<div class="chip-grid">${sel.map(v => `<div class="chip-option selected" data-ideal-remove="${key}" data-val="${v}">${v} ✕</div>`).join('')}</div>`
        : `<p class="portal-note" style="margin:2px 0 6px;">None yet — add from the list.</p>`}
      <div class="other-language-row">
        <select data-ideal-add="${key}">
          <option value="">${placeholder}</option>
          ${options.filter(o => !sel.includes(o)).map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

let profileMode = 'edit'; // 'ideal' | 'view' | 'edit' — the profile tab's three-way toggle

// Collapsible Edit-Profile sections + checkbox dropdowns keep their open/closed
// state across the full re-renders that chip toggles trigger.
let editSectionsOpen  = { first: true, additional: false, getToKnow: false, promptPicker: false };
let editDropdownOpen  = { spec: false, modality: false, 'ideal-needs': false, 'ideal-modalities': false };
let dragBlockIndex = null; // which get-to-know block is being dragged

// A drop-down whose options are checkboxes. Selected values also show as
// removable chips above it. Re-renders on change, but the <details> open state
// is persisted in editDropdownOpen so the panel stays put.
/* One licence, and the state it is in.

   A DENIED licence used to be a cul-de-sac. The row holds the (user_id, state)
   primary key, and the "add a state" dropdown filters out states you already
   have -- so the one state you needed to correct was the one state you could
   not pick. The only way through was to delete the licence first, which reads
   like throwing away the thing being asked about. Denied rows now carry their
   own number + expiry fields and save in place (the POST already upserts).

   Expiry is shown because a licence verified in August is still flagged
   verified in December, and nobody finds out until a client does. */
function licenseRowHtml(l) {
  const st    = l.verifiedAt ? 'ok' : l.rejectedAt ? 'denied' : 'pending';
  const label = l.verifiedAt ? '&#10003; verified' : l.rejectedAt ? '&#10007; denied' : 'pending';
  const esc   = v => String(v == null ? '' : v).replace(/[<>&"]/g, '');
  const days  = licenseDaysLeft(l);
  const expiryNote = l.expiresOn
    ? (days < 0
        ? `<span class="lic-exp is-bad">expired ${fmtLicenseDate(l.expiresOn)}</span>`
        : days <= 60
          ? `<span class="lic-exp is-soon">expires ${fmtLicenseDate(l.expiresOn)}</span>`
          : `<span class="lic-exp">expires ${fmtLicenseDate(l.expiresOn)}</span>`)
    : `<span class="lic-exp is-missing">no expiry date</span>`;

  return `<div class="lic-row">
      <span class="lic-state">${esc(l.state)}</span>
      <span class="lic-num">${esc(l.number)}</span>
      <span class="lic-status ${st}">${label}</span>
      <button type="button" class="lic-remove" data-drop-lic="${esc(l.state)}" aria-label="Remove ${esc(l.state)}">&#10005;</button>
    </div>
    <div class="lic-sub">${expiryNote}</div>
    ${l.rejectedAt && l.rejectedReason ? `<p class="lic-denied-note">${esc(l.rejectedReason)}</p>` : ''}
    ${(l.rejectedAt || !l.expiresOn) ? `
    <div class="lic-fix" data-lic-fix="${esc(l.state)}">
      <p class="lic-fix-lead">${l.rejectedAt
        ? `Correct your ${esc(l.state)} details and we'll check again.`
        : `Add the expiry date printed on your ${esc(l.state)} license.`}</p>
      <div class="lic-add">
        <input type="text" class="t-rate-input" data-lic-num="${esc(l.state)}" placeholder="License number" value="${esc(l.number)}">
      </div>
      <div class="lic-add" style="margin-top:6px;">
        <label class="lic-exp-label">Expires</label>
        <input type="date" class="t-rate-input" data-lic-exp="${esc(l.state)}" value="${esc(l.expiresOn)}">
        <button type="button" data-lic-save="${esc(l.state)}">Save</button>
      </div>
    </div>` : ''}`;
}

/* Returns a message if the date is unusable, or '' if it is fine (including
   blank -- expiry is optional until 0026 has run everywhere and every licence
   has one). Rejecting an already-expired date at entry is the point: a lapsed
   licence cannot be verified, and finding that out now beats finding it out
   after a hand-check. */
function licenseExpiryProblem(v) {
  if (!v) return '';
  const dt = new Date(v + 'T00:00:00Z');
  if (isNaN(dt)) return "That expiry date doesn't look right.";
  if (dt.getTime() < Date.now()) return "That license has already expired — enter the date on your current one.";
  if (dt.getUTCFullYear() > new Date().getUTCFullYear() + 20) return "That expiry date looks too far out — check the year.";
  return '';
}

function fmtLicenseDate(d) {
  const dt = new Date(d + 'T00:00:00Z');
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function licenseDaysLeft(l) {
  if (!l.expiresOn) return Infinity;
  const dt = new Date(l.expiresOn + 'T00:00:00Z');
  if (isNaN(dt)) return Infinity;
  return Math.round((dt - Date.now()) / 86400000);
}

/* Specialties were TWO dropdowns over the same catalogue -- "your top 3" and
   "the full set" -- so a therapist picked Anxiety, Burnout and Trauma, then
   picked the identical three again below. One list instead: choose what you
   work with, star up to three. Starred ones sort to the front so the list
   always reads in the order clients see it. */
function specialtyPickerHtml(t) {
  const top = t.topSpecialties || [];
  const all = t.tags || [];
  // starred first, in the order they were starred; everything else after
  const ordered = [...top.filter(v => all.includes(v)), ...all.filter(v => !top.includes(v))];
  const full = top.length >= MAX_TOP_SPECIALTIES;
  const chips = ordered.map(v => {
    const on = top.includes(v);
    const lock = !on && full;
    return `<div class="spec-chip ${on ? 'is-top' : ''}">
      <button type="button" class="spec-star ${lock ? 'is-locked' : ''}" data-star-spec="${v}"
              aria-pressed="${on}" ${lock ? 'disabled' : ''}
              title="${on ? 'Remove from your top 3' : lock ? `You already have ${MAX_TOP_SPECIALTIES}` : 'Make this a top 3 specialty'}"
              aria-label="${on ? `${v}: remove from top 3` : `${v}: add to top 3`}">${on ? '★' : '☆'}</button>
      <span class="spec-chip-label">${v}</span>
      <button type="button" class="spec-drop" data-drop-spec="${v}" aria-label="Remove ${v}">✕</button>
    </div>`;
  }).join('');
  return `
    <div class="cbx-field">
      ${ordered.length ? `<div class="spec-chips">${chips}</div>` : ''}
      <details class="cbx-dd" data-dd="spec" ${editDropdownOpen['spec'] ? 'open' : ''}>
        <summary><span>${all.length ? `${all.length} selected` : 'Choose the specialties you work with…'}</span><span class="cbx-caret">▾</span></summary>
        <div class="cbx-dd-list">
          ${specialtyAll().map(o => `<label class="cbx-row"><input type="checkbox" data-cbx="spec" value="${o}" ${all.includes(o) ? 'checked' : ''}><span>${o}</span></label>`).join('')}
        </div>
      </details>
      <p class="spec-hint">Tap ☆ to star up to ${MAX_TOP_SPECIALTIES}. Starred specialties lead your profile — clients see two of them plus one that matches what they came for.</p>
    </div>`;
}

function checkboxDropdownHtml(selected, options, key, summaryLabel, max) {
  const capped = max ? selected.length >= max : false;
  const summary = selected.length ? `${selected.length}${max ? `/${max}` : ''} selected` : summaryLabel;
  return `
    <div class="cbx-field">
      ${selected.length ? `<div class="chip-grid cbx-chips">${selected.map(v => `<div class="chip-option selected" data-cbx-chip="${key}" data-val="${v}">${v} ✕</div>`).join('')}</div>` : ''}
      <details class="cbx-dd" data-dd="${key}" ${editDropdownOpen[key] ? 'open' : ''}>
        <summary><span>${summary}</span><span class="cbx-caret">▾</span></summary>
        <div class="cbx-dd-list">
          ${options.map(o => {
            const on = selected.includes(o);
            const dis = !on && capped;
            return `<label class="cbx-row ${dis ? 'cbx-row-disabled' : ''}"><input type="checkbox" data-cbx="${key}" value="${o}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${o}</span></label>`;
          }).join('')}
        </div>
      </details>
    </div>`;
}

function renderTherapistProfileBody() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  /* The eight ideal-client arrays below are read with `.includes(...)` and no
     guards. One partial idealClient -- an older row, a restored draft,
     anything that did not go through normalizeTherapist -- threw mid-template,
     and a thrown render leaves innerHTML unset: the profile tab painted blank
     white. That is what a therapist saw after pressing "Fix my license", so
     the button looked dead when it had worked perfectly.
     Guaranteeing the shape HERE means no producer has to remember to, and
     writing it back means the handlers below mutate the filled object. */
  const ic = Object.assign(emptyIdealClient(), (t && t.idealClient) || {});
  if (t) t.idealClient = ic;
  const container = document.getElementById('t-profile-content');
  // Every editor mutation re-renders through here, so this is the one place
  // that catches all of them. Debounced, and the upsert is idempotent, so the
  // extra writes from plain navigation are harmless.
  persistProfileSoon(t);
  container.innerHTML = `
    <div class="t-form-name">${t.name} <span class="t-form-creds">${credentialsLabel(t)}</span></div>
    <div class="save-state" id="t-save-state"></div>

    <div class="profile-modes" role="tablist">
      <button class="pmode ${profileMode === 'ideal' ? 'active' : ''}" data-pmode="ideal" role="tab">✦ Ideal Client</button>
      <button class="pmode ${profileMode === 'edit' ? 'active' : ''}" data-pmode="edit" role="tab">✎ Edit Profile</button>
      <button class="pmode ${profileMode === 'view' ? 'active' : ''}" data-pmode="view" role="tab">👀 View Profile</button>
    </div>

    <div class="pm-view">${profileCardHtml(t, { preview: true, inline: true })}</div>

    <div class="pm-ideal"><div class="ideal-section">
      <div class="ideal-section-head">
        <h3>✦ Your ideal client</h3>
        <span class="ideal-private">Private — only you see this</span>
      </div>
      <p class="ideal-section-sub">Describe who you're the strongest fit for. When a client lines up, they're flagged <strong>✦ Ideal match</strong> on your requests. This never limits who can find you — everything below this section is your "I also work with" profile, and that's what clients see.</p>

      <div class="t-form-label">Ages <span class="ideal-hint">life stages — clients enter their exact age, we match it here</span></div>
      <div class="chip-grid">${IDEAL_AGE_BANDS.map(a => `<div class="chip-option ${ic.ageBands.includes(a.label) ? 'selected' : ''}" data-ideal="ageBands" data-val="${a.label}">${a.label} <span class="chip-sub">${a.sub}</span></div>`).join('')}</div>

      <div class="t-form-label">Gender</div>
      <div class="chip-grid">${IDEAL_GENDER_OPTIONS.map(g => `<div class="chip-option ${ic.genders.includes(g) ? 'selected' : ''}" data-ideal="genders" data-val="${g}">${g}</div>`).join('')}</div>

      <div class="t-form-label">Field of work</div>
      <div class="chip-grid">
        ${FIELD_PRIMARY.map(f => `<div class="chip-option ${ic.fields.includes(f) ? 'selected' : ''}" data-ideal="fields" data-val="${f}">${f}</div>`).join('')}
        ${ic.fields.filter(f => !FIELD_PRIMARY.includes(f)).map(f => `<div class="chip-option selected" data-ideal="fields" data-val="${f}">${f}</div>`).join('')}
        <div class="chip-option ${idealFieldOtherOpen ? 'selected' : ''}" id="ideal-field-other-btn">${idealFieldOtherOpen ? 'Done' : '+ Other'}</div>
      </div>
      ${idealFieldOtherOpen ? `
      <div class="other-language-row">
        <select id="ideal-field-select"><option value="">Choose…</option>${FIELD_MORE.filter(f => !ic.fields.includes(f)).map(f => `<option value="${f}">${f}</option>`).join('')}</select>
      </div>
      <input type="text" class="t-rate-input" id="ideal-field-typed" placeholder="…or type your own, press Enter">` : ''}

      <div class="t-form-label">What they want to work on</div>
      ${checkboxDropdownHtml(ic.needs, specialtyAll(), 'ideal-needs', 'Choose what they want to work on…')}

      <div class="t-form-label">Type of Therapy</div>
      ${checkboxDropdownHtml(ic.modalities, modalityAll(), 'ideal-modalities', 'Choose the therapy types…')}

      <div class="t-form-label">Payment <span class="ideal-hard">practical — must line up</span></div>
      <div class="chip-grid">${PAYMENT_TYPE_OPTIONS.map(p => `<div class="chip-option ${ic.payment === p ? 'selected' : ''}" data-ideal-pay="${p}">${p}</div>`).join('')}</div>

      <div class="t-form-label">When you'd see them <span class="ideal-hard">practical — must line up</span></div>
      <div class="chip-grid">${AVAILABILITY_OPTIONS.map(a => `<div class="chip-option ${ic.availability.includes(a) ? 'selected' : ''}" data-ideal="availability" data-val="${a}">${a}</div>`).join('')}</div>

      <div class="t-form-label">Must-haves <span class="ideal-hint">pick up to ${MAX_MUST_HAVES} — these count double, but still never filter anyone out</span></div>
      <div class="chip-grid">${IDEAL_DIMENSIONS.map(d => {
        const on = ic.mustHaves.includes(d.key);
        const full = ic.mustHaves.length >= MAX_MUST_HAVES && !on;
        return `<div class="chip-option ${on ? 'selected' : ''}${full ? ' chip-disabled' : ''}" data-ideal-must="${d.key}">${d.label}</div>`;
      }).join('')}</div>
    </div></div>

    <div class="pm-edit">
    <div class="edit-public-bar">🌐 Public — this is what clients see</div>

    <!-- ===== SECTION 1 · FIRST GLANCE ===== -->
    <details class="edit-section" data-edit-section="first" ${editSectionsOpen.first ? 'open' : ''}>
      <summary><span class="edit-section-title">First Glance</span><span class="edit-section-hint">the card clients meet you on</span><span class="edit-caret">▾</span></summary>
      <div class="edit-section-body">

        <div class="t-form-label">Name</div>
        <input type="text" class="t-rate-input" id="t-name-input" placeholder="Your name as clients see it" value="${t.name || ''}">
        <!-- Offered, never applied on its own. See nameIssue(). -->
        ${(() => {
          const issue = nameIssue(t.name);
          if (!issue) return '';
          const esc = v => String(v).replace(/[<>&"]/g, '');
          return `<div class="name-check">
            <p class="name-check-lead">${esc(issue.why)} Clients will see it exactly as written.</p>
            <div class="name-check-actions">
              <button type="button" class="name-check-fix" data-name-fix="${esc(issue.suggestion)}">Use “${esc(issue.suggestion)}”</button>
              <button type="button" class="name-check-keep" id="t-name-keep">Keep what I typed</button>
            </div>
          </div>`;
        })()}
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>List under a practice or company name</strong><span>Shows instead of your personal name to clients</span></div>
          <div class="switch ${t.useCompanyName ? 'on' : ''}" id="t-use-company-switch"></div>
        </div>
        <div id="t-company-name-field" style="${t.useCompanyName ? '' : 'display:none;'}">
          <div class="t-form-label">Company / practice name</div>
          <input type="text" class="t-rate-input" id="t-company-name-input" placeholder="e.g. Bluebird Counseling" value="${t.companyName || ''}">
        </div>

        <div class="t-form-label">Credentials (up to 3)</div>
        <input type="text" class="t-rate-input" id="t-cred-0-input" placeholder="e.g. LPC" value="${t.credentials[0] || ''}">
        <input type="text" class="t-rate-input" id="t-cred-1-input" placeholder="e.g. PhD" value="${t.credentials[1] || ''}">
        <input type="text" class="t-rate-input" id="t-cred-2-input" placeholder="e.g. Certified Gottman Therapist" value="${t.credentials[2] || ''}">

        <div class="t-form-label">Location</div>
        <input type="text" class="t-rate-input" id="t-city-input" placeholder="City — e.g. Austin" value="${t.location.city}">
        <select id="t-state-input">
          <option value="">Select a state</option>
          ${US_STATES.map(s => `<option value="${s}" ${t.location.state === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <div class="intake-sub" style="margin-top:6px;">Clients looking for in-person sessions only see therapists located in their city/state.</div>

        <div class="t-form-label">Session format</div>
        <div class="chip-grid">
          <div class="chip-option ${t.formats.includes('video') ? 'selected' : ''}" data-toggle-format="video">Online</div>
          <div class="chip-option ${t.formats.includes('in-person') ? 'selected' : ''}" data-toggle-format="in-person">In-person</div>
        </div>

        <div class="t-form-label">Session cost (per session, $)</div>
        <div class="rate-row">
          <span class="rate-currency">$</span>
          <input type="number" class="rate-number" id="t-rate-input" min="20" max="600" step="1" value="${t.rateMin}">
        </div>
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>Accepts sliding scale</strong><span>Shown to clients who need flexible pricing</span></div>
          <div class="switch ${t.acceptsSlidingScale ? 'on' : ''}" id="t-sliding-switch"></div>
        </div>
        <div class="t-form-label">Insurance accepted</div>
        ${checkboxDropdownHtml(t.insuranceList, insuranceAll(), 'insurance', 'Choose every carrier you accept…')}
        <div class="t-form-label">Payment options</div>
        <div class="chip-grid">${PAYMENT_OPTIONS.map(p => `<div class="chip-option ${(t.paymentOptions || []).includes(p.key) ? 'selected' : ''}" data-toggle-payment="${p.key}">${p.label}</div>`).join('')}</div>

        <div class="t-form-label">Website</div>
        <input type="text" class="t-rate-input" id="t-website-input" placeholder="e.g. yourpractice.com" value="${t.website || ''}">

        <div class="t-form-label">Pronouns (optional)</div>
        <input type="text" class="t-rate-input" id="t-pronouns-input" placeholder="e.g. she/her" value="${t.pronouns || ''}">
        <div class="must-have-toggle">
          <div class="toggle-label"><strong>Show pronouns on my swipe card</strong><span>Always visible on your full profile either way</span></div>
          <div class="switch ${t.showPronouns ? 'on' : ''}" id="t-show-pronouns-switch"></div>
        </div>

        <div class="t-form-label">In one sentence, who do you work best with? <span class="ideal-hint">this is the first sentence the client sees</span></div>
        <input type="text" class="t-rate-input" id="t-bestfor-input" placeholder="e.g. I work best with new parents navigating postpartum anxiety" value="${t.bestFor || ''}">

        <div class="t-form-label">I have experience working with&hellip; <span class="ideal-hint">star up to 3 — those lead your profile</span></div>
        ${specialtyPickerHtml(t)}
      </div>
    </details>

    <!-- ===== SECTION 2 · ADDITIONAL DETAILS ===== -->
    <details class="edit-section" data-edit-section="getToKnow" ${editSectionsOpen.getToKnow ? 'open' : ''}>
      <summary><span class="edit-section-title">Get to know you</span><span class="edit-section-hint">your story, in words &amp; photos</span><span class="edit-caret">▾</span></summary>
      <div class="edit-section-body">

        ${(() => {
          const blocks = getToKnowBlocks(t);
          const promptCount = blockPromptCount(t);

          // collapsible prompt picker, up top
          const picker = `
            <details class="edit-section edit-subsection" data-edit-section="promptPicker" ${editSectionsOpen.promptPicker ? 'open' : ''}>
              <summary><span class="edit-section-title">Pick up to ${MAX_GET_TO_KNOW_PROMPTS} prompts</span><span class="edit-section-hint">${promptCount}/${MAX_GET_TO_KNOW_PROMPTS} chosen</span><span class="edit-caret">▾</span></summary>
              <div class="edit-section-body">
                <div class="chip-grid">
                  ${GET_TO_KNOW_PROMPTS.map(q => {
                    const selected = blocks.some(b => b.type === 'prompt' && b.question === q);
                    const disabled = !selected && promptCount >= MAX_GET_TO_KNOW_PROMPTS;
                    return `<div class="chip-option ${selected ? 'selected' : ''} ${disabled ? 'chip-disabled' : ''}" data-toggle-block-prompt="${q}">${q}</div>`;
                  }).join('')}
                </div>
              </div>
            </details>`;

          // lead photo stays fixed (it's the swipe-card image, not feed content)
          /* Marked required when absent. It reads as one optional media slot
             among several otherwise, which is how a profile reached "live" with
             a coloured rectangle where the face goes. */
          const media = `
            <div class="media-row${t.photo ? '' : ' is-required'}">
              <div class="media-thumb">${t.photo ? `<img src="${t.photo}">` : '<span>—</span>'}</div>
              <div class="media-row-text"><strong>Lead photo${t.photo ? '' : ' <span class="req-pill">required</span>'}</strong><span>${t.photo
                ? 'Your swipe-card image — the first thing clients see'
                : "Your profile can't go live without one — it's the first thing a client looks at"}</span></div>
              <label class="media-upload-btn">${t.photo ? 'Change' : 'Add'}<input type="file" accept="image/*" data-media-upload="photo" hidden></label>
            </div>`;

          const hint = `<p class="intake-sub" style="margin-top:14px;">Drag any block by the ⠿ handle to arrange your feed — a line shows where it'll land. We recommend alternating a photo and a blurb.</p>`;

          // the draggable feed itself — prompts, photos & the video in one list
          const cards = blocks.map((b, i) => {
            const handle = `<span class="block-drag" aria-hidden="true">⠿</span>`;
            const remove = `<button type="button" class="block-remove" data-remove-block="${i}" aria-label="Remove">✕</button>`;
            if (b.type === 'photo') {
              return `<div class="feed-block feed-block-photo" draggable="true" data-block-index="${i}">
                <div class="feed-block-head">${handle}<span class="feed-block-tag">📷 Photo</span>${remove}</div>
                <div class="feed-block-photo-body"><img src="${b.src}"></div>
              </div>`;
            }
            if (b.type === 'video') {
              return `<div class="feed-block feed-block-video" draggable="true" data-block-index="${i}">
                <div class="feed-block-head">${handle}<span class="feed-block-tag">🎬 Quick video</span>${remove}</div>
                <div class="feed-block-video-body">
                  ${b.src ? `<video src="${b.src}" controls preload="metadata" playsinline></video>` : '<div class="video-empty">A 15–30s hello — clients hear your voice first</div>'}
                  <label class="media-upload-btn">${b.src ? 'Replace' : 'Add'}<input type="file" accept="video/*" data-replace-block-video="${i}" hidden></label>
                </div>
              </div>`;
            }
            return `<div class="feed-block feed-block-prompt" draggable="true" data-block-index="${i}">
              <div class="feed-block-head">${handle}<span class="feed-block-tag feed-block-question">${b.question}</span>${remove}</div>
              <textarea class="intake-textarea" data-block-answer="${i}" rows="3" placeholder="Finish the thought in your own voice…">${b.answer || ''}</textarea>
            </div>`;
          }).join('');

          const addPhoto = blockPhotoCount(t) < MAX_PHOTOS
            ? `<label class="media-add-row"><span class="media-thumb"><span>＋</span></span><span class="media-row-text"><strong>Add a photo</strong><span>Your office, life outside work, and one more that's you. Up to ${MAX_PHOTOS}.</span></span><input type="file" accept="image/*" data-add-block-photo hidden></label>`
            : `<p class="portal-note">Photo limit reached (${MAX_PHOTOS}). Remove one to add another.</p>`;
          const addVideo = blockHasVideo(t)
            ? ''
            : `<label class="media-add-row"><span class="media-thumb"><span>🎬</span></span><span class="media-row-text"><strong>Add a quick video</strong><span>A 15–30s hello — it becomes a draggable block too.</span></span><input type="file" accept="video/*" data-add-block-video hidden></label>`;

          return picker + media + hint + `<div class="feed-blocks">${cards}</div>` + addPhoto + addVideo;
        })()}
      </div>
    </details>

    <!-- ===== SECTION 3 · GET TO KNOW YOU ===== -->
    <details class="edit-section" data-edit-section="additional" ${editSectionsOpen.additional ? 'open' : ''}>
      <summary><span class="edit-section-title">Additional Details</span><span class="edit-section-hint">licensure, identity, therapy types</span><span class="edit-caret">▾</span></summary>
      <div class="edit-section-body">
        <div class="must-have-toggle" style="margin-top:2px;">
          <div class="toggle-label"><strong>Accepting ongoing clients</strong><span>Off keeps you in Discover with a "save for later" banner</span></div>
          <div class="switch ${t.acceptingOngoing ? 'on' : ''}" id="t-ongoing-switch"></div>
        </div>

          <div class="t-form-label" id="t-lic-anchor">Your licenses <span class="ideal-hint">one per state &mdash; each is checked separately</span></div>
          ${(t.licenses && t.licenses.length)
            ? t.licenses.map(l => licenseRowHtml(l)).join('')
            : `<p class="portal-note" style="margin:2px 0 8px;">No licenses yet. Add each state you're licensed in &mdash; you can only be matched with clients in a state we've verified.</p>`}
          <div class="t-form-label" style="margin-top:14px;">Add a state</div>
          <div class="lic-add">
            <select id="t-lic-state">
              <option value="">State&hellip;</option>
              ${US_STATES.filter(s => !(t.licenses || []).some(l => l.state === s)).map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <input type="text" class="t-rate-input" id="t-lic-number" placeholder="License number">
          </div>
          <div class="lic-add" style="margin-top:6px;">
            <label class="lic-exp-label" for="t-lic-expires">Expires</label>
            <input type="date" class="t-rate-input" id="t-lic-expires">
            <button type="button" id="t-lic-add">Add</button>
          </div>
          <p class="portal-note">We check each license against that state's board by hand. A state only becomes available for matching once its license is verified.</p>

        <div class="t-form-label">Gender Identity</div>
        <div class="chip-grid">
          ${GENDER_IDENTITY_OPTIONS.map(g => `
          <div class="chip-option ${normalizeGender(t.identity.gender) === g.value ? 'selected' : ''}" data-set-gender="${g.value}">${g.label}</div>`).join('')}
        </div>

        <div class="must-have-toggle">
          <div class="toggle-label"><strong>LGBTQ+ affirming</strong><span>Shown to clients who require this</span></div>
          <div class="switch ${t.identity.lgbtqAffirming ? 'on' : ''}" id="t-lgbtq-switch"></div>
        </div>

        <div class="t-form-label">Languages you speak</div>
        ${languageChipsHtml(t.languages, profileShowOtherLanguage, 'tp')}

        <div class="t-form-label" style="margin-top:16px;">Types of Therapy</div>
        ${checkboxDropdownHtml(t.modalities, modalityAll(), 'modality', 'Choose the therapy types you offer…')}
      </div>
    </details>
    </div>
  `;
  container.dataset.mode = profileMode;
  container.querySelectorAll('[data-pmode]').forEach(b => b.addEventListener('click', () => {
    profileMode = b.dataset.pmode;
    renderTherapistProfile();
    document.getElementById('t-profile-content').scrollTop = 0;
  }));
  attachTherapistProfileHandlers(t);
}

function attachTherapistProfileHandlers(t) {
  const tPronounsInput = document.getElementById('t-pronouns-input');
  if (tPronounsInput) tPronounsInput.addEventListener('input', () => { t.pronouns = tPronounsInput.value; });
  const tShowPronounsSwitch = document.getElementById('t-show-pronouns-switch');
  if (tShowPronounsSwitch) tShowPronounsSwitch.addEventListener('click', () => { t.showPronouns = !t.showPronouns; renderTherapistProfile(); });
  const tUseCompanySwitch = document.getElementById('t-use-company-switch');
  if (tUseCompanySwitch) tUseCompanySwitch.addEventListener('click', () => { t.useCompanyName = !t.useCompanyName; renderTherapistProfile(); });
  const tCompanyNameInput = document.getElementById('t-company-name-input');
  if (tCompanyNameInput) tCompanyNameInput.addEventListener('input', () => { t.companyName = tCompanyNameInput.value; });
  [0, 1, 2].forEach(i => {
    const credInput = document.getElementById(`t-cred-${i}-input`);
    if (credInput) credInput.addEventListener('input', () => {
      t.credentials[i] = credInput.value;
    });
  });
  const tNameInput = document.getElementById('t-name-input');
  if (tNameInput) {
    /* Typing must not re-render -- that would steal the caret mid-word -- so
       the suggestion appears on blur, once they have stopped. */
    tNameInput.addEventListener('input', () => { t.name = tNameInput.value; });
    tNameInput.addEventListener('blur', () => {
      const tidy = tidyNameWhitespace(tNameInput.value);
      const changed = tidy !== t.name;
      t.name = tidy;                       // whitespace only: safe to just do
      if (changed || nameIssue(tidy)) renderTherapistProfile();
    });
  }
  document.querySelectorAll('[data-name-fix]').forEach(btn => btn.addEventListener('click', () => {
    t.name = btn.dataset.nameFix;
    showToast('Name updated to “' + t.name + '”');
    renderTherapistProfile();
  }));
  const nameKeep = document.getElementById('t-name-keep');
  if (nameKeep) nameKeep.addEventListener('click', () => {
    /* Their name, their call. Remembered against this exact spelling, so
       changing it later asks again and keeping it never asks twice. */
    rememberNameAccepted(t.name);
    renderTherapistProfile();
  });
  const tWebsiteInput = document.getElementById('t-website-input');
  if (tWebsiteInput) tWebsiteInput.addEventListener('input', () => { t.website = tWebsiteInput.value.trim().replace(/^https?:\/\//, ''); });
  const tSlidingSwitch = document.getElementById('t-sliding-switch');
  if (tSlidingSwitch) tSlidingSwitch.addEventListener('click', () => { t.acceptsSlidingScale = !t.acceptsSlidingScale; renderTherapistProfile(); });
  // remember which collapsible sections / dropdowns are open across re-renders
  document.querySelectorAll('details[data-edit-section]').forEach(el => el.addEventListener('toggle', () => { editSectionsOpen[el.dataset.editSection] = el.open; }));
  document.querySelectorAll('details[data-dd]').forEach(el => el.addEventListener('toggle', () => { editDropdownOpen[el.dataset.dd] = el.open; }));
  // checkbox dropdowns — one component, several targets (public specialties &
  // types of therapy, plus the private ideal-client needs & modalities)
  /* star / unstar, and drop a specialty entirely. Unstarring never removes it
     from the working set -- those are two different statements. */
  document.querySelectorAll('[data-star-spec]').forEach(el => el.addEventListener('click', () => {
    if (!Array.isArray(t.topSpecialties)) t.topSpecialties = [];
    const v = el.dataset.starSpec, i = t.topSpecialties.indexOf(v);
    if (i !== -1) t.topSpecialties.splice(i, 1);
    else if (t.topSpecialties.length < MAX_TOP_SPECIALTIES) t.topSpecialties.push(v);
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-drop-spec]').forEach(el => el.addEventListener('click', () => {
    const v = el.dataset.dropSpec;
    const i = t.tags.indexOf(v);
    if (i !== -1) t.tags.splice(i, 1);
    // a starred specialty they no longer work with cannot stay starred
    const j = (t.topSpecialties || []).indexOf(v);
    if (j !== -1) t.topSpecialties.splice(j, 1);
    renderTherapistProfile();
  }));

  const cbxArr = k => ({
    'spec': t.tags,
    'modality': t.modalities,
    'insurance': t.insuranceList,
    'ideal-needs': t.idealClient.needs,
    'ideal-modalities': t.idealClient.modalities,
  })[k] || null;
  document.querySelectorAll('input[data-cbx]').forEach(el => el.addEventListener('change', () => {
    const arr = cbxArr(el.dataset.cbx); if (!arr) return;
    const v = el.value, i = arr.indexOf(v);
    if (i === -1) arr.push(v);
    else {
      arr.splice(i, 1);
      if (el.dataset.cbx === 'spec') { const j = (t.topSpecialties || []).indexOf(v); if (j !== -1) t.topSpecialties.splice(j, 1); }
    }
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-cbx-chip]').forEach(el => el.addEventListener('click', () => {
    const arr = cbxArr(el.dataset.cbxChip); if (!arr) return;
    const v = el.dataset.val, i = arr.indexOf(v);
    if (i !== -1) arr.splice(i, 1);
    if (el.dataset.cbxChip === 'spec') { const j = (t.topSpecialties || []).indexOf(v); if (j !== -1) t.topSpecialties.splice(j, 1); }
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-toggle-modality]').forEach(el => el.addEventListener('click', () => {
    const m = el.dataset.toggleModality;
    const i = t.modalities.indexOf(m);
    if (i === -1) t.modalities.push(m); else t.modalities.splice(i, 1);
    renderTherapistProfile();
  }));
  // ----- ideal-client spec (private) -----
  document.querySelectorAll('[data-ideal]').forEach(el => el.addEventListener('click', () => {
    const list = t.idealClient[el.dataset.ideal];
    const v = el.dataset.val;
    const i = list.indexOf(v);
    if (i === -1) list.push(v); else list.splice(i, 1);
    renderTherapistProfile();
  }));
  // ideal multi-select dropdowns (needs / type of therapy)
  document.querySelectorAll('[data-ideal-add]').forEach(el => el.addEventListener('change', () => {
    if (!el.value) return;
    const list = t.idealClient[el.dataset.idealAdd];
    if (!list.includes(el.value)) list.push(el.value);
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-ideal-remove]').forEach(el => el.addEventListener('click', () => {
    const list = t.idealClient[el.dataset.idealRemove];
    const i = list.indexOf(el.dataset.val);
    if (i !== -1) list.splice(i, 1);
    renderTherapistProfile();
  }));
  // ideal field "+ Other"
  const ifOtherBtn = document.getElementById('ideal-field-other-btn');
  if (ifOtherBtn) ifOtherBtn.addEventListener('click', () => { idealFieldOtherOpen = !idealFieldOtherOpen; renderTherapistProfile(); });
  const ifSel = document.getElementById('ideal-field-select');
  if (ifSel) ifSel.addEventListener('change', () => { if (ifSel.value && !t.idealClient.fields.includes(ifSel.value)) { t.idealClient.fields.push(ifSel.value); idealFieldOtherOpen = false; renderTherapistProfile(); } });
  const ifTyped = document.getElementById('ideal-field-typed');
  if (ifTyped) ifTyped.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = ifTyped.value.trim(); if (v && !t.idealClient.fields.includes(v)) { t.idealClient.fields.push(v); idealFieldOtherOpen = false; renderTherapistProfile(); } }
  });
  document.querySelectorAll('[data-ideal-pay]').forEach(el => el.addEventListener('click', () => {
    t.idealClient.payment = el.dataset.idealPay;
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-ideal-must]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.idealMust;
    const mh = t.idealClient.mustHaves;
    const i = mh.indexOf(k);
    if (i !== -1) mh.splice(i, 1);
    else if (mh.length < MAX_MUST_HAVES) mh.push(k);
    renderTherapistProfile();
  }));
  const tBestForInput = document.getElementById('t-bestfor-input');
  if (tBestForInput) tBestForInput.addEventListener('input', () => { t.bestFor = tBestForInput.value; });
  document.querySelectorAll('[data-media-upload]').forEach(el => el.addEventListener('change', () => {
    const file = el.files[0];
    if (!file) return;
    const slot = el.dataset.mediaUpload;
    if (slot === 'video') {
      t.media.video = URL.createObjectURL(file); // object URL keeps big videos out of data URLs
      renderTherapistProfile();
    } else { // lead photo
      readPhoto(file).then(src => { if (src) { t.photo = src; renderTherapistProfile(); } });
    }
  }));
  // ===== get-to-know draggable blocks (prompts + photos) =====
  document.querySelectorAll('[data-toggle-block-prompt]').forEach(el => el.addEventListener('click', () => {
    const q = el.dataset.toggleBlockPrompt;
    const blocks = getToKnowBlocks(t);
    const i = blocks.findIndex(b => b.type === 'prompt' && b.question === q);
    if (i !== -1) blocks.splice(i, 1);
    else if (blockPromptCount(t) < MAX_GET_TO_KNOW_PROMPTS) blocks.push({ type: 'prompt', question: q, answer: '' });
    renderTherapistProfile();
  }));
  document.querySelectorAll('textarea[data-block-answer]').forEach(el => el.addEventListener('input', () => {
    getToKnowBlocks(t)[Number(el.dataset.blockAnswer)].answer = el.value;
  }));
  document.querySelectorAll('[data-remove-block]').forEach(el => el.addEventListener('click', () => {
    const blocks = getToKnowBlocks(t);
    const [removed] = blocks.splice(Number(el.dataset.removeBlock), 1);
    if (removed && removed.type === 'video') t.media.video = null; // keep the store in sync
    renderTherapistProfile();
  }));
  const addBlockPhoto = document.querySelector('[data-add-block-photo]');
  if (addBlockPhoto) addBlockPhoto.addEventListener('change', () => {
    const file = addBlockPhoto.files[0];
    if (!file) return;
    if (blockPhotoCount(t) >= MAX_PHOTOS) return;
    readPhoto(file).then(src => {
      if (!src) return;
      getToKnowBlocks(t).push({ type: 'photo', src });
      renderTherapistProfile();
    });
  });
  const addBlockVideo = document.querySelector('[data-add-block-video]');
  if (addBlockVideo) addBlockVideo.addEventListener('change', () => {
    const file = addBlockVideo.files[0];
    if (!file || blockHasVideo(t)) return;
    const src = URL.createObjectURL(file);      // object URL keeps big videos out of data URLs
    t.media.video = src;
    getToKnowBlocks(t).push({ type: 'video', src });
    renderTherapistProfile();
  });
  document.querySelectorAll('[data-replace-block-video]').forEach(el => el.addEventListener('change', () => {
    const file = el.files[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const blocks = getToKnowBlocks(t);
    const b = blocks[Number(el.dataset.replaceBlockVideo)];
    if (b) b.src = src;
    t.media.video = src;
    renderTherapistProfile();
  }));
  // ----- drag & drop with a live drop indicator (container-level = robust) -----
  const feedContainer = document.querySelector('.feed-blocks');
  if (feedContainer) {
    const clearIndicators = () => feedContainer.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    feedContainer.querySelectorAll('[data-block-index]').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragBlockIndex = Number(el.dataset.blockIndex);
        el.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragBlockIndex)); } catch (_) {} }
      });
      el.addEventListener('dragend', () => { dragBlockIndex = null; el.classList.remove('dragging'); clearIndicators(); });
    });
    feedContainer.addEventListener('dragover', e => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      clearIndicators();
      const others = [...feedContainer.querySelectorAll('[data-block-index]:not(.dragging)')];
      let marked = false;
      for (const b of others) {
        const rect = b.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { b.classList.add('drop-before'); marked = true; break; }
      }
      if (!marked && others.length) others[others.length - 1].classList.add('drop-after');
    });
    feedContainer.addEventListener('drop', e => {
      e.preventDefault();
      if (dragBlockIndex === null) { clearIndicators(); return; }
      const blocks = getToKnowBlocks(t);
      const beforeEl = feedContainer.querySelector('.drop-before');
      const afterEl = feedContainer.querySelector('.drop-after');
      let to;
      if (beforeEl) to = Number(beforeEl.dataset.blockIndex);
      else if (afterEl) to = Number(afterEl.dataset.blockIndex) + 1;
      else to = blocks.length;
      const from = dragBlockIndex;
      const [moved] = blocks.splice(from, 1);
      if (from < to) to--;                       // account for the removed item
      blocks.splice(to, 0, moved);
      dragBlockIndex = null;
      renderTherapistProfile();
    });
  }
  document.querySelectorAll('[data-set-gender]').forEach(el => el.addEventListener('click', () => {
    t.identity.gender = el.dataset.setGender;
    renderTherapistProfile();
  }));
  document.getElementById('t-lgbtq-switch').addEventListener('click', () => { t.identity.lgbtqAffirming = !t.identity.lgbtqAffirming; renderTherapistProfile(); });
  /* Licences are rows in therapist_licenses now, each with its own state,
     number and verification. Adding or removing one writes straight through --
     the DB derives license_states from the VERIFIED ones, so a new state is
     never matchable until it has been checked. */
  const licAddBtn = document.getElementById('t-lic-add');
  if (licAddBtn) licAddBtn.addEventListener('click', async () => {
    const st  = (document.getElementById('t-lic-state') || {}).value;
    const num = (document.getElementById('t-lic-number') || {}).value || '';
    const exp = (document.getElementById('t-lic-expires') || {}).value || '';
    if (!st) { showToast('Pick the state that issued the license.'); return; }
    if (!num.trim()) { showToast('Enter the license number.'); return; }
    const bad = licenseExpiryProblem(exp);
    if (bad) { showToast(bad); return; }
    licAddBtn.disabled = true;
    const ok = await saveLicense(st, num, exp);
    licAddBtn.disabled = false;
    if (!ok) { showToast("Couldn't save that license. Try again."); return; }
    t.licenses = await loadLicenses();
    showToast(st + ' added — pending verification');
    renderTherapistProfile();
  });

  /* Saving a correction to a licence that already exists: same upsert, keyed on
     the state, so a denied row is fixed where it sits. */
  document.querySelectorAll('[data-lic-save]').forEach(btn => btn.addEventListener('click', async () => {
    const st  = btn.dataset.licSave;
    const num = (document.querySelector(`[data-lic-num="${st}"]`) || {}).value || '';
    const exp = (document.querySelector(`[data-lic-exp="${st}"]`) || {}).value || '';
    if (!num.trim()) { showToast('Enter the license number.'); return; }
    const bad = licenseExpiryProblem(exp);
    if (bad) { showToast(bad); return; }
    btn.disabled = true;
    const ok = await saveLicense(st, num, exp);
    btn.disabled = false;
    if (!ok) { showToast("Couldn't save that license. Try again."); return; }
    t.licenses = await loadLicenses();
    showToast(st + ' updated — back in the queue for checking');
    renderTherapistProfile();
  }));
  document.querySelectorAll('[data-drop-lic]').forEach(el => el.addEventListener('click', async () => {
    const st = el.dataset.dropLic;
    if (!confirm('Remove your ' + st + ' license? You will stop being matched with clients there.')) return;
    await deleteLicense(st);
    t.licenses = await loadLicenses();
    renderTherapistProfile();
  }));
  document.querySelectorAll('#tp-languages-grid [data-language]').forEach(el => el.addEventListener('click', () => {
    const l = el.dataset.language;
    const i = t.languages.indexOf(l);
    if (i === -1) t.languages.push(l); else t.languages.splice(i, 1);
    renderTherapistProfile();
  }));
  document.querySelectorAll('#tp-languages-grid [data-remove-custom-language]').forEach(el => el.addEventListener('click', () => {
    t.languages = t.languages.filter(l => l !== el.dataset.removeCustomLanguage);
    renderTherapistProfile();
  }));
  const tpOtherBtn = document.getElementById('tp-other-btn');
  if (tpOtherBtn) tpOtherBtn.addEventListener('click', () => { profileShowOtherLanguage = true; renderTherapistProfile(); });
  const tpOtherAddBtn = document.getElementById('tp-other-add-btn');
  if (tpOtherAddBtn) tpOtherAddBtn.addEventListener('click', () => {
    const val = document.getElementById('tp-other-select').value;
    if (val && !t.languages.includes(val)) t.languages.push(val);
    renderTherapistProfile();
  });
  document.querySelectorAll('[data-toggle-format]').forEach(el => el.addEventListener('click', () => {
    const f = el.dataset.toggleFormat;
    const i = t.formats.indexOf(f);
    if (i === -1) t.formats.push(f); else t.formats.splice(i, 1);
    renderTherapistProfile();
  }));
  const tCityInput = document.getElementById('t-city-input');
  if (tCityInput) tCityInput.addEventListener('input', () => { t.location.city = tCityInput.value; });
  const tStateInput = document.getElementById('t-state-input');
  if (tStateInput) tStateInput.addEventListener('change', () => { t.location.state = tStateInput.value; });
  const tSelfPayNoteInput = document.getElementById('t-selfpaynote-input');
  if (tSelfPayNoteInput) tSelfPayNoteInput.addEventListener('input', () => { t.selfPayNote = tSelfPayNoteInput.value; });
  /* Slider and number drive the same value: 5-dollar steps make a $20-$600 drag
     usable, the number field takes any exact figure. A $10 step could not reach
     $165, which plenty of people charge. */
  /* Just a number -- a slider was imprecise at every useful figure. */
  const tRateNum = document.getElementById('t-rate-input');
  if (tRateNum) tRateNum.addEventListener('input', () => {
    t.rateMin = Number(tRateNum.value) || 0;
    persistProfileSoon(t);
  });
  document.querySelectorAll('[data-toggle-payment]').forEach(el => el.addEventListener('click', () => {
    if (!Array.isArray(t.paymentOptions)) t.paymentOptions = [];
    const k = el.dataset.togglePayment;
    const at = t.paymentOptions.indexOf(k);
    if (at === -1) t.paymentOptions.push(k); else t.paymentOptions.splice(at, 1);
    renderTherapistProfile();
  }));
  document.getElementById('t-ongoing-switch').addEventListener('click', () => {
    t.acceptingOngoing = !t.acceptingOngoing;
    t.nextAvailableRank = t.acceptingOngoing ? 1 : null;
    t.nextAvailableLabel = t.acceptingOngoing ? 'This week' : 'Not accepting new ongoing clients';
    renderTherapistProfile();
  });
}

// ===== ON-DEMAND CONTROLS =====
// These live on the On Demand tab (not Profile): turning it on, and the open
// slots for this week. Kept as their own html/bind pair so the tab owns them.
// The On Demand tab owns the on/off switch. Slot management already lives on
// that screen, so this is just the toggle that gates it.
function onDemandToggleHtml(t) {
  if (t.onDemandBanned) return `
    <div class="must-have-toggle" style="opacity:0.75;">
      <div class="toggle-label"><strong>On-Demand suspended</strong><span>A confirmed session was reported as a no-show. On-Demand access doesn't come back — ongoing matching is unaffected.</span></div>
    </div>`;
  return `
    <div class="must-have-toggle">
      <div class="toggle-label"><strong>Offering On-Demand this week</strong><span>${t.onDemand ? 'Clients can book a one-time session in the times below' : 'Turn on to take one-time sessions this week'}</span></div>
      <div class="switch ${t.onDemand ? 'on' : ''}" id="t-ondemand-switch"></div>
    </div>`;
}

function bindOnDemandToggle(t) {
  const odSwitch = document.getElementById('t-ondemand-switch');
  if (!odSwitch) return;
  odSwitch.addEventListener('click', () => {
    if (!t.onDemand) {
      // turning ON always requires agreeing to the terms afresh
      openTherapistOnDemandAgreement(() => { t.agreedToOnDemandPolicy = true; t.onDemand = true; renderTherapistHome(); });
    } else {
      // turning OFF clears the agreement, so re-enabling re-prompts the terms
      t.onDemand = false;
      t.agreedToOnDemandPolicy = false;
      renderTherapistHome();
    }
  });
}

// First-time (and reference) explainer for what On-Demand therapy is.
function openOnDemandInfo() {
  document.getElementById('confirm-sheet').innerHTML = `
    <div class="sheet-close"></div>
    <h2>⚡ What is On-Demand?</h2>
    <p class="modality-info-text">On-Demand lets clients book a single, one-time session with you this week — separate from ongoing therapy. A few things to know:</p>
    <ul class="policy-list">
      <li><strong>Not for crises.</strong> It's not crisis care — anyone in crisis should call or text 988 or their local emergency line.</li>
      <li><strong>You set your On-Demand session fee.</strong> Kindred never prices your time — you choose what a one-time session costs, and you can change it whenever you like.</li>
      <li><strong>Cash-pay only.</strong> No insurance is billed for On-Demand sessions.</li>
      <li><strong>Clients pay up front.</strong> The client's card is authorized when they request a slot and charged the moment you accept — you never chase payment.</li>
      <li><strong>You meet outside the app.</strong> Kindred handles the request and payment; you schedule and hold the actual session on your own platform.</li>
      <li><strong>5% processing fee.</strong> Kindred keeps 5% of the session cost to run On-Demand; the client also covers the Stripe processing fee.</li>
    </ul>
    <button class="primary-btn" style="margin-top:12px;background:var(--coral);color:white;" id="od-info-ok-btn">Got it</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  document.getElementById('od-info-ok-btn').addEventListener('click', close);
  const sc = document.querySelector('#confirm-sheet .sheet-close');
  if (sc) sc.addEventListener('click', close);
}

document.getElementById('btn-like').addEventListener('click', () => {
  const top = cardStack.lastElementChild;
  if (top && top._forceSwipe) top._forceSwipe('like');
});
document.getElementById('btn-pass').addEventListener('click', () => {
  const top = cardStack.lastElementChild;
  if (top && top._forceSwipe) top._forceSwipe('pass');
});
document.getElementById('btn-info').addEventListener('click', () => {
  const t = deck[deckIndex];
  if (t) openDetail(t);
});

// ===== PROFILE =====
function careForSummary() {
  if (!intake.careFor) return '';
  return { myself: 'For myself', child: `For a child${intake.childAge ? ` (age ${intake.childAge})` : ''}`, couples: 'For couples', family: 'For family' }[intake.careFor];
}
function needsSummary() {
  const base = intake.needs.length ? intake.needs.join(', ') : (intake.notSure ? 'Still figuring it out' : 'Not specified');
  const cf = careForSummary();
  return cf ? `${cf} · ${base}` : base;
}
function formatSummary() {
  const wantsInPerson = intake.formats.includes('in-person');
  const where = intake.state ? (wantsInPerson && intake.city.trim() ? ` · ${intake.city.trim()}, ${intake.state}` : ` · ${intake.state}`) : '';
  let label;
  if (!intake.formats.length) label = 'Either works';
  else if (intake.formats.length === 2) label = 'Online or in-person';
  else label = intake.formats[0] === 'video' ? 'Online preferred' : 'In-person preferred';
  return label + where;
}
function availabilitySummary() {
  return intake.availability.length ? intake.availability.join(', ') : 'Not specified';
}
function guidanceSummary() {
  return { gentle: 'Mostly listens and reflects back', direct: 'Direct — tells me like it is', empathy: 'More empathy and understanding', challenge: 'To be challenged and pushed' }[intake.stylePref] || 'Open to any style';
}
function insuranceSummary() {
  if (intake.hasInsurance === 'no') {
    return intake.noInsurancePref === 'sliding-scale' ? 'No insurance — needs a sliding scale' : 'No insurance — therapist fit comes first';
  }
  return intake.insurance === 'any' ? 'Not specified yet' : intake.insurance;
}
function budgetSummary() {
  if (intake.budgetRange === 'Any budget') return 'Any budget';
  if (intake.budgetRange === 'Sliding scale') return 'Sliding scale';
  return `${intake.budgetRange}/session`;
}
function identitySummary() {
  const parts = [];
  if (intake.genderPref !== 'no-preference') parts.push(`${intake.genderPref}${intake.genderRequired ? ' (must-have)' : ' (preferred)'}`);
  if (intake.ethnicityPref !== 'no-preference') parts.push(intake.ethnicityPref);
  if (intake.lgbtqRequired) parts.push('LGBTQ+ affirming required');
  if (intake.languagePref !== 'any') parts.push(`Speaks ${intake.languagePref}${intake.languageRequired ? ' (must-have)' : ' (preferred)'}`);
  if (intake.affinities.length) parts.push(...intake.affinities);
  if (intake.faith.length) parts.push(...intake.faith);
  return parts.length ? parts.join(', ') : 'Open to all specified';
}
function modalitySummary() {
  if (intake.modality === 'open') return 'Open to any approach';
  return `${intake.modality}${intake.modalityRequired ? ' (must-have)' : ' (preferred)'}`;
}

let youMode = 'preferences'; // 'preferences' | 'share' | 'account' — the You tab's three-way toggle
function renderProfileScreen() {
  let screen = document.getElementById('screen-profile');
  if (!screen) {
    screen = document.createElement('section');
    screen.className = 'screen';
    screen.id = 'screen-profile';
    document.querySelector('.phone').insertBefore(screen, document.querySelector('.bottom-nav'));
  }
  const savedList = EXPLORE_RESOURCES.filter(r => savedResources.includes(r.id));
  const matchedMatches = matches.filter(m => m.status === 'matched');
  const wantsInPerson = intake.formats.includes('in-person');
  const prefsHtml = `
      <div class="t-form-label" style="margin-top:8px;">What you're working on</div>
      <div class="chip-grid">${NEED_OPTIONS.map(n => `<div class="chip-option ${intake.needs.includes(n) ? 'selected' : ''}" data-you-need="${n}">${n}</div>`).join('')}</div>

      <div class="t-form-label">Session format</div>
      <div class="chip-grid">
        <div class="chip-option ${intake.formats.includes('video') ? 'selected' : ''}" data-you-format="video">Online</div>
        <div class="chip-option ${intake.formats.includes('in-person') ? 'selected' : ''}" data-you-format="in-person">In-person</div>
      </div>

      <div class="t-form-label">Your state <span class="req-star" title="Required">★</span></div>
      <select id="you-state">
        <option value="">Select a state</option>
        ${US_STATES.map(s => `<option value="${s}" ${intake.state === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      ${wantsInPerson ? `<div class="t-form-label">Your city <span class="req-star">★</span></div>
      <input type="text" class="t-rate-input" id="you-city" placeholder="e.g. Austin" value="${intake.city || ''}">` : ''}

      <div class="t-form-label">Therapist gender</div>
      <div class="chip-grid">
        <div class="chip-option ${intake.genderPref === 'no-preference' ? 'selected' : ''}" data-you-gender="no-preference">Open to all</div>
        <div class="chip-option ${intake.genderPref === 'female' ? 'selected' : ''}" data-you-gender="female">Female</div>
        <div class="chip-option ${intake.genderPref === 'male' ? 'selected' : ''}" data-you-gender="male">Male</div>
        <div class="chip-option ${intake.genderPref === 'nonbinary' ? 'selected' : ''}" data-you-gender="nonbinary">Nonbinary</div>
      </div>

      <div class="t-form-label">Language</div>
      <div class="chip-grid">
        <div class="chip-option ${intake.languagePref === 'any' ? 'selected' : ''}" data-you-language="any">Open to all</div>
        ${LANGUAGE_QUICK_OPTIONS.map(l => `<div class="chip-option ${intake.languagePref === l ? 'selected' : ''}" data-you-language="${l}">${l}</div>`).join('')}
      </div>

      <div class="t-form-label">Budget</div>
      <div class="chip-grid">${BUDGET_RANGES.map(b => `<div class="chip-option ${intake.budgetRange === b.label ? 'selected' : ''}" data-you-budget="${b.label}">${b.label}</div>`).join('')}</div>

      <button class="primary-btn" id="save-prefs-btn" style="margin-top:14px;background:var(--coral);color:white;">Save preferences</button>
      <button class="edit-prefs-btn" id="edit-prefs-btn" style="color:var(--ink-soft);">Retake the full questionnaire</button>`;

  const shareHtml = `
      <p class="portal-note" style="margin-top:8px;">Give a matched therapist a picture of what you're working with — your answers and saved resources. You choose per therapist, and can turn it off anytime.</p>
      <button class="edit-prefs-btn" id="preview-shared-btn" style="margin:2px 0 4px;background:white;border:1.5px solid var(--coral);color:var(--coral-dark);">👀 Preview what your therapist sees</button>
      ${matchedMatches.length ? matchedMatches.map(m => `
        <div class="must-have-toggle" style="margin-top:8px;">
          <div class="toggle-label"><strong>${displayName(m.therapist)}</strong><span>${m.profileShared ? 'Can see your profile' : 'Cannot see your profile'}</span></div>
          <div class="switch ${m.profileShared ? 'on' : ''}" data-share-toggle="${m.therapist.id}"></div>
        </div>`).join('') : `<p class="portal-note">Once you match with a therapist, you can share your profile with them here.</p>`}
      <p class="portal-note">Saved resources: ${savedList.length ? savedList.map(r => `${r.icon} ${r.title}`).join(' · ') : 'nothing saved yet — browse the Kindred tab.'}</p>`;

  const accountHtml = `
      <button class="edit-prefs-btn" id="client-logout-btn" style="margin-top:8px;color:var(--ink-soft);">Log Out</button>
      <button class="edit-prefs-btn" id="delete-account-btn" style="color:#a8443a;">Delete My Account</button>`;

  screen.innerHTML = `
    <header class="top-bar"><div class="logo">You</div></header>
    <div class="profile-content">
      <div class="profile-modes" role="tablist">
        <button class="pmode ${youMode === 'preferences' ? 'active' : ''}" data-youmode="preferences" role="tab">⚙ Preferences</button>
        <button class="pmode ${youMode === 'share' ? 'active' : ''}" data-youmode="share" role="tab">↗ Share</button>
        <button class="pmode ${youMode === 'account' ? 'active' : ''}" data-youmode="account" role="tab">👤 Account</button>
      </div>
      ${youMode === 'preferences' ? prefsHtml : youMode === 'share' ? shareHtml : accountHtml}
    </div>
  `;

  screen.querySelectorAll('[data-youmode]').forEach(b => b.addEventListener('click', () => {
    youMode = b.dataset.youmode;
    renderProfileScreen();
    document.getElementById('screen-profile').scrollTop = 0;
  }));

  // ----- inline preference editors (mutate intake, re-render) -----
  screen.querySelectorAll('[data-you-need]').forEach(el => el.addEventListener('click', () => {
    const n = el.dataset.youNeed, i = intake.needs.indexOf(n);
    if (i === -1) intake.needs.push(n); else intake.needs.splice(i, 1);
    intake.notSure = false; renderProfileScreen();
  }));
  screen.querySelectorAll('[data-you-format]').forEach(el => el.addEventListener('click', () => {
    const f = el.dataset.youFormat, i = intake.formats.indexOf(f);
    if (i === -1) intake.formats.push(f); else intake.formats.splice(i, 1);
    renderProfileScreen();
  }));
  const youState = document.getElementById('you-state');
  if (youState) youState.addEventListener('change', () => { intake.state = youState.value; });
  const youCity = document.getElementById('you-city');
  if (youCity) youCity.addEventListener('input', () => { intake.city = youCity.value; });
  screen.querySelectorAll('[data-you-gender]').forEach(el => el.addEventListener('click', () => {
    intake.genderPref = el.dataset.youGender;
    if (intake.genderPref === 'no-preference') intake.genderRequired = false;
    renderProfileScreen();
  }));
  screen.querySelectorAll('[data-you-language]').forEach(el => el.addEventListener('click', () => {
    intake.languagePref = el.dataset.youLanguage;
    if (intake.languagePref === 'any') intake.languageRequired = false;
    renderProfileScreen();
  }));
  screen.querySelectorAll('[data-you-budget]').forEach(el => el.addEventListener('click', () => {
    intake.budgetRange = el.dataset.youBudget; renderProfileScreen();
  }));
  const savePrefsBtn = document.getElementById('save-prefs-btn');
  if (savePrefsBtn) savePrefsBtn.addEventListener('click', () => {
    if (!intake.state) { showToast('Pick your state so we can match you with licensed therapists.'); return; }
    if (intake.formats.includes('in-person') && !(intake.city || '').trim()) { showToast('Add your city for in-person matches.'); return; }
    clientStore.persistIntake(intake);   // gated by the flag
    computeDeck(); renderStack(); renderMatches();
    showToast('Preferences saved — your matches are updated.');
  });

  const editPrefsBtn = document.getElementById('edit-prefs-btn');
  if (editPrefsBtn) editPrefsBtn.addEventListener('click', startIntake);
  const clientLogoutBtn = document.getElementById('client-logout-btn');
  if (clientLogoutBtn) clientLogoutBtn.addEventListener('click', logout);
  const deleteAccountBtn = document.getElementById('delete-account-btn');
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', openDeleteAccountSheet);
  const previewSharedBtn = document.getElementById('preview-shared-btn');
  if (previewSharedBtn) previewSharedBtn.addEventListener('click', openSharedProfilePreview);
  screen.querySelectorAll('[data-share-toggle]').forEach(el => el.addEventListener('click', () => {
    const m = matches.find(m => m.therapist.id === el.dataset.shareToggle && m.status === 'matched');
    if (!m) return;
    m.profileShared = !m.profileShared;
    showToast(m.profileShared ? `Profile shared with ${displayName(m.therapist)}.` : `Profile no longer shared with ${displayName(m.therapist)}.`);
    renderProfileScreen();
  }));
}

// Restore this device's client state (intake, shortlist, matches, chats) before
// anything renders. enterMatchingExperience() then sees intake.completed and
// takes a returning client straight to their matches instead of re-running the
// whole questionnaire.
loadClientState();
pruneOrphanMatches();

showScreen('account-type');

// Demo shortcut — a button on the first screen (and ?demo=client) drops you into
// a filled-in client account so every zone can be previewed with content.
const previewClientDemoBtn = document.getElementById('preview-client-demo-btn');
if (previewClientDemoBtn && !PRODUCTION_BUILD) previewClientDemoBtn.addEventListener('click', seedClientDemo);
if (!PRODUCTION_BUILD && /[?&]demo=client\b/.test(location.search)) seedClientDemo();

// ===== POST-PAYMENT DEEP LINK =====
// welcome.html sends a therapist straight here after they pay, as
//     kindredtherapymatch.com/app/?email=...#therapist-signup
//
// HISTORICAL: the site and the app used to be different origins, so a session
// could not travel and a therapist signed in twice. They now share an origin
// (/ and /app/) and therefore share localStorage, so the session carries and
// this path is a fallback rather than the normal case. This makes that the smallest possible
// step: skip "what brings you to Kindred?", prefill the email they paid with,
// and put the cursor in the password field.
//
// Nothing else is needed: the login handler already routes an account that has
// no profile row into startTherapistSignup(). Someone who has just paid has
// exactly that shape.
/* Swaps the login screen between "Signing you in…" and the actual form. Reset
   in openLogin() too, so any later visit to this screen always shows the form
   rather than inheriting a restore that has long since finished. */
function setLoginRestoring(on) {
  const note = document.getElementById('login-restoring');
  const form = document.getElementById('login-form');
  if (note) note.hidden = !on;
  if (form) form.hidden = !!on;
  /* "Therapist Login" over "Signing you in…" tells someone they are about to
     be asked for a password when they are not. Put it back when the form
     returns: the fallback path reveals the form WITHOUT going through
     openLogin(), so leaving the title alone here stranded a login form under
     a heading that just said "Kindred". */
  const title = document.getElementById('login-title');
  if (title) {
    title.textContent = on ? 'Kindred'
      : accountType === 'client' ? 'Client Login' : 'Therapist Login';
  }
}

function applyLandingParams() {
  const email = new URLSearchParams(location.search).get('email');
  const wantsSignup = /therapist-signup/.test(location.hash);
  /* Separate from #therapist-signup because the two want opposite emphasis:
     a returning therapist pressing "Therapist sign in" should not be shown a
     Create button as the primary action. Both skip the account-type screen --
     they already said which they were, on the website. */
  if (/therapist-signin/.test(location.hash) && !wantsSignup) {
    accountType = 'therapist';
    openLogin();
    /* A session on this device means restoreSession() is already in flight and
       will land them in their portal in a moment. welcome.html sends a
       therapist who has just paid to this exact hash, so showing them a login
       form -- with their own session sitting in storage -- and replacing it
       half a second later is a flash of the one screen they had earned the
       right not to see. Hold the form back; showLoginForm() below puts it up
       if the restore does not work out. */
    if (authReady() && loadAuthSession()) setLoginRestoring(true);
    return;
  }

  // #match -- someone came from a "Match with a therapist" button on the site.
  // They have already told us what they want by clicking it, so asking "what
  // brings you to Kindred?" and then showing a login screen is two walls in
  // front of a questionnaire that needs no account at all.
  //
  // start-here.js has been building these links for a while (with feeling/mood/
  // impact appended) and nothing consumed the hash, so every one of those
  // handoffs landed on the account-type screen instead of the questionnaire.
  //
  // A returning client with finished answers goes to their matches rather than
  // through the questions again -- same rule enterMatchingExperience() uses.
  if (/(^|[#&])match\b/.test(location.hash)) {
    accountType = 'client';
    if (intake.completed) { finishIntake(); checkForNewMatches(); }
    else startIntake();
    return;
  }

  if (!wantsSignup && !email) return;

  if (wantsSignup) {
    accountType = 'therapist';
    openLogin();
    /* #therapist-signup with NO email is the front door: the landing page
       sends brand-new therapists straight here to build a profile before
       paying anything.

       This used to flip the buttons -- swap the order, repaint "Create my
       account" as the filled primary, demote Log In to "I already have an
       account" -- on the theory that a stranger should not be asked to sign
       in. What it actually produced was a screen that rearranged itself
       depending on how you arrived, so the same two choices sat in different
       places with different names and different weights. The pair is now
       fixed everywhere: Log In on top, New here? Create an Account below.
       The CONTEXT LINE is what says which one you probably want -- that is
       text, and text is free to change. */
    if (!email) {
      const title = document.getElementById('login-title');
      if (title) title.textContent = 'Create your account';
      const ctx = document.getElementById('login-context');
      if (ctx) {
        ctx.innerHTML = '<strong>Build your profile free.</strong> No card, nothing to pay &mdash; you only activate once it&rsquo;s ready and you&rsquo;ve seen how you look to clients.<br><br>New to Kindred? <strong>Create an Account</strong> below.';
        ctx.hidden = false;
      }
    }
  }
  if (email) {
    const f = document.getElementById('login-email');
    if (f) f.value = email;
    const pw = document.getElementById('login-password');
    if (pw) setTimeout(() => pw.focus(), 60);

    /* TWO paths reach this screen after paying, needing opposite things:
         A. activate.html -- account and password created BEFORE checkout, so
            they log in.
         B. a Stripe link used directly -- no account exists yet, so they set
            a password here for the first time.
       The client cannot tell them apart: Supabase will not reveal whether an
       address has an account, and rightly so. So keep both routes and name
       them, rather than guessing and stranding half the arrivals.

       What both must NOT do is change the email. It is what ties the payment
       to the account -- the webhook matched on it -- so a different address
       here orphans the money into the manual-review log. Hence the field is
       prefilled and the copy says why it matters. */
    const title = document.getElementById('login-title');
    if (title) title.textContent = 'Welcome to Kindred';
    const ctx = document.getElementById('login-context');
    if (ctx) {
      ctx.innerHTML = '<strong>Your membership is active.</strong> Keep the email below exactly as it is \u2014 it\u2019s what links your payment to your profile.<br><br>'
        /* Names the buttons EXACTLY as they are labelled below. They no longer
           rename themselves per arrival, so the copy can point at them. */
        + 'Already chose a password? <strong>Log In.</strong> Haven\u2019t yet? <strong>Create an Account</strong> and pick one now.';
      ctx.hidden = false;
    }
    /* This used to rename the button to "Create my password", because "New
       here?" reads as a wrong turn to someone who has just paid -- true, but
       not worth a third name for the same button. The context line above
       already tells both arrivals which one is theirs, and a button that
       keeps its name is easier to be told about than one that doesn't. */
    const create = document.getElementById('login-create-btn');
    if (create) create.hidden = false;
  }
}

/* ===== STAY SIGNED IN =====
   The session was written to localStorage and never read back at startup, so
   every page refresh dropped a signed-in therapist at the account-type screen
   with working credentials sitting unused. Restore it, refreshing the token if
   it has aged out, and go straight to their portal.

   Deliberately therapist-only: client state is local-only until the BAA, so
   there is no client session to restore. */
async function restoreSession() {
  if (!authReady()) return false;
  if (/[?&]email=/.test(location.search) || /therapist-signup/.test(location.hash)) return false; // explicit sign-in
  if (/(^|[#&])match\b/.test(location.hash)) return false;   // client deep link -- do not bounce them into a therapist portal
  const s = await ensureFreshSession();
  if (!s || !s.user) return false;
  try {
    const row = await loadTherapistRow();
    if (!row || !row.name || !String(row.name).trim()) return false;  // stub or none: let them sign in
    const t = normalizeTherapist(dbRowToTherapist(row));
    t.licenses = await loadLicenses();     // per-state, with their own verification
    upsertTherapistInMemory(t);
    currentTherapistId = t.id;
    accountType = 'therapist';
    showTherapistView();
    return true;
  } catch (e) {
    return false;   // never trap someone on a blank screen because a fetch failed
  }
}
window.addEventListener('load', async () => {
  const returning = /[?&]identity=done/.test(location.search);
  if (returning) history.replaceState(null, '', location.pathname);  // don't re-fire on refresh
  const signedIn = await restoreSession();
  /* The restore is done either way now. If it failed -- expired token, deleted
     account, a profile that was never built -- the held-back form is the only
     way forward, so put it up rather than leaving "Signing you in…" on screen
     forever. */
  if (!signedIn) setLoginRestoring(false);
  if (returning) openIdentityReturn(signedIn);
});

/* Deep links decide which screen a visitor lands on, so this must not depend
   on catching a single event. If `load` has already fired by the time this
   line runs -- which a service worker taking over, a bfcache restore, or a
   slow-then-cached script can all cause -- the listener is attached to an
   event that will never come again, and the visitor is dumped on "what brings
   you to Kindred?" holding a link that said exactly what they were.
   Observed once and never reproduced, which is the worst kind of bug to leave
   in: run it now if the document is already done, otherwise on load. */
if (document.readyState === 'complete') applyLandingParams();
else window.addEventListener('load', applyLandingParams);

/* "Notify me when there's a match" used to show a toast and collect nothing --
   a promise with no way to keep it. This takes the one detail needed to keep
   it, and nothing else.

   Deliberately does NOT ask what they are looking for: the intake already knows
   that, and an email stored next to "seeking help with trauma" is health data.
   Kept apart, an address is just an address. Client data stays on the device
   until the BAA is signed, so this is held locally for now. */
const NOTIFY_KEY = 'kindred-notify-me';
function loadNotifyMe() {
  try { return JSON.parse(localStorage.getItem(NOTIFY_KEY) || 'null'); } catch (e) { return null; }
}
function openNotifyMe() {
  const saved = loadNotifyMe() || { email: '' };
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Join the waitlist</h2>
    <div class="intake-sub">We're verifying our founding therapists now — every licence checked by hand. Leave one way to reach you and you'll hear from us first, the moment they're live.</div>

    <div class="t-form-label">Email</div>
    <input type="email" class="t-rate-input" id="notify-email" placeholder="you@example.com" value="${saved.email || ''}">

    <p class="portal-note" style="margin-top:10px;">We only use this to tell you therapists have arrived. We never record why you're waiting, and this is never attached to your answers — those stay on your device.</p>
    <button class="primary-btn" id="notify-save">Join the waitlist</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  const sc = sheet.querySelector('.sheet-close');
  if (sc) sc.addEventListener('click', close);

  /* Email only. SMS meant collecting a phone number, which is a stronger
     identifier than an address, needs its own consent to text, and would have
     been a second channel to build before either could be used. The columns
     stay in client_notify -- dropping them would lose nothing and cost a
     migration -- they are simply never written. */
  document.getElementById('notify-save').addEventListener('click', () => {
    const email = (document.getElementById('notify-email').value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Enter an email we can reach you at.'); return; }
    try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ email, at: Date.now() })); } catch (e) {}
    /* Insert-only for anon, and the row holds contact details and nothing else
       -- no intake answers, no state, no reason. That separation is what makes
       it storable before the BAA. Fire-and-forget: a network failure must not
       lose what they typed, which is why it is kept locally too. */
    if (dbReady()) {
      fetch(`${KINDRED_DB.url}/rest/v1/client_notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: KINDRED_DB.key,
          Authorization: `Bearer ${KINDRED_DB.key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ email, contact_pref: 'email' })
      }).catch(() => {});
    }
    close();
    showToast("You're on the waitlist — we'll email you when therapists arrive.");
  });
}


// ===== SHARED-THERAPIST DEEP LINK =====
// A link someone was sent (…#therapist=t3) opens straight to that therapist's
// profile. If they land on the login screen first the hash stays in the URL, so
// it still opens once they're in — nothing is lost.
function openSharedTherapistFromHash() {
  const m = location.hash.match(/therapist=([\w-]+)/);
  if (!m || accountType !== 'client') return;
  const t = THERAPISTS.find(x => x.id === m[1]);
  if (t) openDetail(t);
}
window.addEventListener('hashchange', openSharedTherapistFromHash);
window.addEventListener('load', openSharedTherapistFromHash);

// ===== THERAPIST SETTINGS =====
// Account-level preferences, kept deliberately separate from the Profile tab
// (which is about how clients see you). Nothing here affects matching.
let therapistSettings = {
  notifyNewInquiry: true,
  notifyMessages: true,
  notifyWeeklySummary: true,
  showInSearch: true,
  hideFromCurrentClients: false
};

function renderTherapistSettings() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  const s = therapistSettings;
  /* Empty string once the checklist is complete AND dismissed -- which is what
     the block below tests, so the listing state is stated exactly once. */
  const listingCard = verificationBannerHtml(t);
  const row = (key, title, sub) => `
    <div class="must-have-toggle">
      <div class="toggle-label"><strong>${title}</strong><span>${sub}</span></div>
      <div class="switch ${s[key] ? 'on' : ''}" data-setting="${key}"></div>
    </div>`;

  document.getElementById('t-settings-content').innerHTML = `
    <div class="t-form-name">${t.name}</div>
    <p class="portal-note" style="margin-top:4px;">Signed in as ${t.name}${(t.licenses && t.licenses.length) ? ` · licensed in ${t.licenses.map(l => l.state).join(', ')}` : ''}</p>

    <div class="settings-group-title">Notifications</div>
    ${row('notifyNewInquiry', 'New inquiries', 'When a client reaches out to you')}
    ${row('notifyMessages', 'Messages', 'Replies in an existing conversation')}
    ${row('notifyWeeklySummary', 'Weekly summary', 'Your profile views, hearts, and inquiries')}
    <!-- This row used to read from therapistSettings, an in-memory object that
         is never persisted -- so it looked like a marketing preference, stored
         nothing, and reset on every reload. It is now the real consent flag,
         which is also what makes the opt-in withdrawable. -->
    <div class="must-have-toggle">
      <div class="toggle-label">
        <strong>Kindred emails</strong>
        <span>What's working for other therapists, new features, practice-building. Roughly monthly, and you can turn this off any time. Your account, billing and licence emails are separate and always send.</span>
      </div>
      <div class="switch ${t.marketingOptIn ? 'on' : ''}" id="t-settings-marketing"></div>
    </div>

    <div class="settings-group-title">Privacy</div>
    ${row('showInSearch', 'Appear in matching', 'Turning this off hides you from new matches without deleting anything')}
    <p class="portal-note">Your ideal-client settings are always private and never shown to clients.</p>

    <div class="settings-group-title">Your listing</div>
    ${listingCard}
    <!-- Was t.listed, i.e. "has paid". Nobody pays to sign up now, so the
         branch is whether they have an account at all - which they do, if
         they are reading this. Kept as a guard for a half-built row. -->
    ${t.name
      /* Same sentence the Home banner shows, from the same function. This used
         to assert "Your profile is live" off `t.listed` alone and print a
         hardcoded $29.99 beside it -- so a founding member awaiting licence
         verification was told, on one screen, both that clients couldn't see
         them and that their profile was live at a price they weren't paying.
         No rate is quoted now: nothing in the row records which tier they
         locked in, and a confident wrong number is worse than a pointer to
         the receipt that has the right one. */
      /* Only state it here if the card above ISN'T -- it carries the same
         sentence from the same function, and a therapist who has dismissed
         the completed checklist would otherwise have no statement of their
         listing state anywhere in Settings. */
      ? `${listingCard ? '' : `<p class="portal-note" style="margin-top:0;">${listingLead(t)}</p>`}
         ${(() => { const ls = listingState(t);
           if (ls.subscribed) return `<p class="portal-note" style="margin-top:0;">Your rate and next charge date are on the Stripe receipt emailed to you.</p>`;
           if (ls.lapsed) return `<p class="portal-note" style="margin-top:0;">Kindred was free for you until ${fmtFreeUntil(t)}.</p>
             <button class="edit-prefs-btn" id="t-settings-activate-btn" style="color:var(--coral-dark);">Keep my profile active</button>`;
           if (ls.daysLeft !== Infinity) return `<p class="portal-note" style="margin-top:0;">Free until <strong>${fmtFreeUntil(t)}</strong> &mdash; ${ls.daysLeft} day${ls.daysLeft === 1 ? '' : 's'} left. No card on file, nothing to cancel.</p>
             ${ls.endingSoon ? `<button class="edit-prefs-btn" id="t-settings-activate-btn" style="color:var(--coral-dark);">Keep my profile active</button>` : ''}`;
           /* Clock not started: they have never been findable, so the six
              months have not begun. Saying "free until —" with no date would
              read as a bug. */
           return `<p class="portal-note" style="margin-top:0;">Kindred is free for therapists until ${FREE_UNTIL_LABEL}. No card, nothing to cancel.</p>`;
         })()}`
      : `<p class="portal-note" style="margin-top:0;">Your profile isn't live yet.</p>`}

    <div class="settings-group-title">Account</div>
    <button class="edit-prefs-btn" id="t-settings-profile-btn">Edit my profile</button>
    <button class="edit-prefs-btn" id="t-settings-logout-btn" style="color:var(--ink-soft);">Log Out</button>
    <button class="edit-prefs-btn" id="t-settings-delete-btn" style="color:#a8443a;">Delete My Account</button>
  `;

  document.querySelectorAll('#t-settings-content [data-setting]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.setting;
      therapistSettings[k] = !therapistSettings[k];
      renderTherapistSettings();
    });
  });
  /* Consent is not a device preference, so unlike the rows above this one is
     written to the profile and saved. Withdrawing has to stick, or the opt-in
     was never real. */
  const mkt = document.getElementById('t-settings-marketing');
  if (mkt) mkt.addEventListener('click', () => {
    t.marketingOptIn = !t.marketingOptIn;
    persistProfileSoon(t);
    renderTherapistSettings();
  });
  const settingsActivateBtn = document.getElementById('t-settings-activate-btn');
  if (settingsActivateBtn) settingsActivateBtn.addEventListener('click', openActivateProfile);
  document.getElementById('t-settings-profile-btn').addEventListener('click', () => showTScreen('t-profile'));
  document.getElementById('t-settings-logout-btn').addEventListener('click', logout);
  document.getElementById('t-settings-delete-btn').addEventListener('click', openTherapistDeleteSheet);
  wireGettingStarted();
}

// Same principle as the client's delete flow: lead with what they'd lose, keep
// the exit available, and require a second deliberate confirmation.
function openTherapistDeleteSheet() {
  const t = THERAPISTS.find(t => t.id === currentTherapistId);
  const sheet = document.getElementById('confirm-sheet');
  sheet.innerHTML = `
    <div class="sheet-close"></div>
    <h2>Delete your account?</h2>
    <div class="intake-sub">You don't have to delete to step back from new clients.</div>
    <div class="keep-card">
      <p><strong>Pausing keeps your profile, your conversations, and your reviews.</strong> Turn off "Appear in matching" in Settings and you stop receiving new inquiries — nothing else changes.</p>
      <p class="keep-card-sub">Deleting removes your profile, your ${t.stats.profileViews} profile views, saved conversations, and match history permanently.</p>
    </div>
    <button class="primary-btn" style="background:var(--coral);color:white;" id="t-keep-btn">Keep my account</button>
    <button class="edit-prefs-btn" id="t-pause-btn">Pause new matches instead</button>
    <button class="edit-prefs-btn" id="t-delete-final" style="color:#a8443a;">Delete my account</button>
  `;
  document.getElementById('confirm-modal').classList.remove('hidden');
  const close = () => document.getElementById('confirm-modal').classList.add('hidden');
  document.getElementById('t-keep-btn').addEventListener('click', close);
  document.getElementById('t-pause-btn').addEventListener('click', () => {
    therapistSettings.showInSearch = false;
    close();
    showToast("You're paused — no new inquiries until you turn it back on.");
    renderTherapistSettings();
  });
  document.getElementById('t-delete-final').addEventListener('click', () => {
    close();
    showToast('Your account has been deleted.');
    logout();
  });
}

// ===== THERAPIST SEARCH =====
// Deliberately separate from matching: this is for someone who already knows
// what (or who) they're looking for — a name a friend gave them, or a modality
// like "EMDR". Results are the full roster, not filtered to their intake, so a
// client can look someone up specifically or find a therapist to pass along.
let searchState = { q: '', state: '', gender: '', format: '' };

function searchableText(t) {
  return [
    t.name, displayName(t), t.companyName,
    (t.credentials || []).join(' '),
    (t.tags || []).join(' '),
    (t.modalities || []).join(' '),
    (t.languages || []).join(' '),
    t.bestFor,
    t.location ? `${t.location.city} ${t.location.state}` : ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function searchResults() {
  const q = searchState.q.trim().toLowerCase();
  return THERAPISTS.filter(t => {
    if (q && !searchableText(t).includes(q)) return false;
    if (searchState.state && (t.location || {}).state !== searchState.state) return false;
    if (searchState.gender && genderBucket((t.identity || {}).gender) !== searchState.gender) return false;
    if (searchState.format && !(t.formats || []).includes(searchState.format)) return false;
    return true;
  });
}

function renderSearch() {
  const filters = document.getElementById('search-filters');
  const results = document.getElementById('search-results');

  const states = [...new Set(THERAPISTS.map(t => (t.location || {}).state).filter(Boolean))].sort();
  const chip = (group, val, label) => {
    const on = searchState[group] === val;
    return `<div class="chip-option ${on ? 'selected' : ''}" data-sfilter="${group}" data-sval="${val}">${label}</div>`;
  };

  filters.innerHTML = `
    <div class="search-filter-label">Location</div>
    <div class="chip-grid">
      ${chip('state', '', 'Anywhere')}
      ${states.map(s => chip('state', s, s)).join('')}
    </div>
    <div class="search-filter-label">Therapist gender</div>
    <div class="chip-grid">
      ${chip('gender', '', 'Any')}
      ${chip('gender', 'female', 'Female')}
      ${chip('gender', 'male', 'Male')}
      ${chip('gender', 'nonbinary', 'Non-binary')}
    </div>
    <div class="search-filter-label">Session format</div>
    <div class="chip-grid">
      ${chip('format', '', 'Either')}
      ${chip('format', 'video', 'Online')}
      ${chip('format', 'in-person', 'In person')}
    </div>`;

  if (dbReady()) {
    // server mode: full-text search in Postgres over the live roster
    const seq = ++searchFetchSeq;
    results.innerHTML = '<p class="empty-state">Searching…</p>';
    /* p_gender is deliberately NOT sent. The SQL compares the stored value
       exactly, so asking it for 'female' would drop every therapist who
       answered "Woman" or "Transgender Woman" — the filter would look like it
       worked and silently return fewer people. Gender is bucketed here instead,
       on the rows that come back, which needs no migration to be correct. */
    dbRpc('search_therapists', {
      p_query: searchState.q.trim() || null,
      p_state: searchState.state || null,
      p_gender: null,
      p_format: searchState.format || null
    })
      .then(rows => {
        if (seq !== searchFetchSeq) return;
        const list = rows.map(dbRowToTherapist)
          .filter(t => !searchState.gender || genderBucket((t.identity || {}).gender) === searchState.gender);
        renderSearchRows(list);
      })
      .catch(() => { if (seq === searchFetchSeq) renderSearchRows(searchResults()); });
  } else {
    renderSearchRows(searchResults());
  }

  filtersBindings();
}

let searchFetchSeq = 0;

function renderSearchRows(found) {
  const results = document.getElementById('search-results');
  const activeFilters = ['state', 'gender', 'format'].filter(k => searchState[k]).length;
  results.innerHTML = found.length
    ? `<div class="search-count">${found.length} therapist${found.length === 1 ? '' : 's'}${searchState.q ? ` for “${searchState.q}”` : ''}</div>` +
      found.map(t => `
        <div class="search-row" data-search-open="${t.id}">
          <div class="search-avatar" style="background:${t.gradient}">${t.photo ? `<img src="${t.photo}" alt="">` : t.initials}</div>
          <div class="search-row-body">
            <div class="search-row-name">${displayName(t)} <span class="creds">${credentialsLabel(t)}</span></div>
            <div class="search-row-meta">${[(t.location || {}).state, (t.formats || []).includes('in-person') ? 'In person' : null, (t.formats || []).includes('video') ? 'Online' : null].filter(Boolean).join(' · ')}</div>
            <div class="search-row-tags">${(t.tags || []).slice(0, 3).join(' · ')}</div>
          </div>
        </div>`).join('')
    : `<p class="empty-state">No therapists match${searchState.q ? ` “${searchState.q}”` : ''}${activeFilters ? ' with those filters' : ''}. Try a broader term — a specialty like “anxiety”, or a modality like “EMDR”.</p>`;

  results.querySelectorAll('[data-search-open]').forEach(el => el.addEventListener('click', () => {
    const t = (window._lastSearchRows || []).find(x => x.id === el.dataset.searchOpen)
      || THERAPISTS.find(x => x.id === el.dataset.searchOpen);
    if (t) openDetail(t); // their profile — which carries the Share button
  }));
  window._lastSearchRows = found;
}

function filtersBindings() {
  document.querySelectorAll('#search-filters [data-sfilter]').forEach(el => el.addEventListener('click', () => {
    searchState[el.dataset.sfilter] = el.dataset.sval;
    renderSearch();
  }));
}

document.getElementById('open-search-btn').addEventListener('click', () => {
  showScreen('search');
  renderSearch();
  document.getElementById('search-input').focus();
});
document.getElementById('close-search-btn').addEventListener('click', () => showScreen('discover'));
document.getElementById('search-input').addEventListener('input', (e) => {
  searchState.q = e.target.value;
  renderSearch();
});
