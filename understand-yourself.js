/* ===================== Kindred — Understand Yourself discovery hub ===================== */

/* ---------- mobile nav ---------- */
const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

/* ===================== DATA ===================== */

/* Topic library — key: {label, tagline, questions?} */
const TOPICS = {
  anxiety:            { label: 'Anxiety', tagline: 'When worry starts taking up too much room.',
    questions: ['Why am I anxious when nothing is wrong?', "What's the difference between stress and anxiety?", 'Why does anxiety feel physical?', 'Can anxiety make me feel angry?', 'When is it worth getting help?'] },
  depression:         { label: 'Depression', tagline: "When low isn't lifting." },
  panic:              { label: 'Panic', tagline: 'Sudden waves of fear that feel physical.' },
  emotionalregulation:{ label: 'Emotional regulation', tagline: 'Strengthening your ability to respond, not just react.' },
  anger:              { label: 'Anger', tagline: 'When your fuse feels shorter than it used to.' },
  selfesteem:         { label: 'Self-esteem', tagline: 'The way you talk to yourself matters.' },
  bodyimage:          { label: 'Body image', tagline: 'Making peace with the mirror.' },
  adhd:               { label: 'ADHD', tagline: 'More than being distracted.',
    questions: ['Why can I focus for hours on some things and not others?', 'Why does everything feel harder to start?', 'Is emotional overwhelm part of ADHD?', 'What does ADHD look like in adults?', 'Could I have missed it as a child?'] },
  ocd:                { label: 'OCD', tagline: 'When unwanted thoughts or repetitive behaviors start taking over.',
    questions: ['Are intrusive thoughts normal?', 'What is a compulsion?', 'Is OCD always about cleanliness?', 'Why do I keep needing reassurance?', 'What is "Pure O"?'] },
  overthinking:       { label: 'Overthinking', tagline: 'Why your brain keeps circling.' },
  intrusivethoughts:  { label: 'Intrusive thoughts', tagline: 'Unwanted thoughts are more common than you think.' },
  perfectionism:      { label: 'Perfectionism', tagline: 'When "good enough" never feels good enough.' },
  rumination:         { label: 'Rumination', tagline: 'Stuck on replay.' },
  trauma:             { label: 'Trauma', tagline: 'When the past stays present.' },
  ptsd:               { label: 'PTSD', tagline: 'When your nervous system stays on guard.' },
  burnout:            { label: 'Burnout', tagline: "Running on empty isn't a character flaw." },
  grief:              { label: 'Grief', tagline: 'Carrying a loss, at your own pace.' },
  stress:             { label: 'Chronic stress', tagline: 'When the pressure never quite lets up.' },
  lifetransitions:    { label: 'Life transitions', tagline: 'Change is a lot — even the good kind.' },
  attachment:         { label: 'Attachment', tagline: 'The patterns underneath your relationships.' },
  peoplepleasing:     { label: 'People pleasing', tagline: "Why it's so hard to say no — and how to start." },
  codependency:       { label: 'Codependency', tagline: "When someone else's feelings run your life." },
  boundaries:         { label: 'Boundaries', tagline: 'Where you end and others begin.' },
  abandonment:        { label: 'Fear of abandonment', tagline: 'Fear of being left — and what it protects.' },
  relationshipanxiety:{ label: 'Relationship anxiety', tagline: 'Doubt that shows up in love.' },
  substance:          { label: 'Substance use & mental health', tagline: 'When coping starts costing.' },
  sleep:              { label: 'Sleep & mental health', tagline: 'It goes both ways.' },
  eating:             { label: 'Eating & mental health', tagline: 'Food, feelings, and the space between.' },
  exercise:           { label: 'Exercise & mental health', tagline: 'Movement as medicine — without the pressure.' },
  chronicillness:     { label: 'Chronic illness & mental health', tagline: 'When body and mind both carry a lot.' },
  loneliness:         { label: 'Loneliness', tagline: 'Feeling alone, even around people.' },
  socialanxiety:      { label: 'Social anxiety', tagline: 'More than shyness.' }
};

const TOPIC_CATS = [
  { name: 'Mood & Emotions', keys: ['anxiety', 'depression', 'panic', 'emotionalregulation', 'anger', 'selfesteem', 'bodyimage'] },
  { name: 'Attention & Thought Patterns', keys: ['adhd', 'ocd', 'overthinking', 'intrusivethoughts', 'perfectionism', 'rumination'] },
  { name: 'Stress & Experiences', keys: ['trauma', 'ptsd', 'burnout', 'grief', 'stress', 'lifetransitions'] },
  { name: 'Relationships & Patterns', keys: ['attachment', 'peoplepleasing', 'codependency', 'boundaries', 'abandonment', 'relationshipanxiety'] },
  { name: 'Habits, Body & Well-Being', keys: ['substance', 'sleep', 'eating', 'exercise', 'chronicillness', 'loneliness', 'socialanxiety'] }
];

/* Feelings — first 12 visible, rest behind "Show all feelings" */
const FEELINGS = [
  { key: 'anxious', label: 'Anxious', blurb: "My mind won't slow down.", tint: '#ECE5F1',
    icon: '<path d="M8 16c4-4 8-4 12 0s8 4 12 0 6-3 8-1M8 24c4-4 8-4 12 0s8 4 12 0 6-3 8-1M8 32c4-4 8-4 12 0s8 4 12 0 6-3 8-1"/>',
    notice: ['Racing thoughts at night', "A body that won't settle", 'What-ifs that multiply', "Reassurance that doesn't stick"],
    topics: ['anxiety', 'stress', 'panic', 'ocd'],
    facets: [
      { label: "My mind won't stop", desc: 'Racing thoughts, replaying conversations, imagining worst-case scenarios', special: 'mindracing' },
      { label: 'My body feels on edge', desc: 'Tight chest, tension, restlessness, feeling keyed up', topics: ['anxiety', 'panic', 'stress', 'trauma'] },
      { label: "I'm worried about something specific", desc: 'Work, relationships, health, money, the future', topics: ['anxiety', 'stress', 'lifetransitions'] },
      { label: 'I avoid things because they make me anxious', desc: 'Social situations, driving, calls, appointments, unfamiliar places', topics: ['socialanxiety', 'anxiety', 'panic'] },
      { label: 'I suddenly feel panicked', desc: 'Intense waves of fear or physical symptoms', topics: ['panic', 'anxiety'] },
      { label: "I can't explain it", desc: 'I just feel anxious — even when nothing seems wrong', topics: ['anxiety', 'stress', 'depression'] },
      { label: 'Honestly, several of these', desc: '', topics: ['anxiety', 'stress', 'panic', 'ocd'] }
    ] },
  { key: 'overwhelmed', label: 'Overwhelmed', blurb: 'Everything feels like too much.', tint: '#F4E3DB',
    icon: '<path d="M10 26c3-9 8-14 14-13s9 6 7 11-8 7-12 4 0-10 6-10 10 4 9 9-6 8-11 7"/>',
    notice: ['Small tasks pile up until they feel impossible', "You don't know where to start, so you don't", "You snap at people you don't mean to", 'Your brain feels foggy by mid-afternoon'],
    topics: ['stress', 'burnout', 'anxiety', 'adhd'] },
  { key: 'burnedout', label: 'Burned out', blurb: 'I have nothing left to give.', tint: '#F3E4C9',
    icon: '<rect x="8" y="14" width="26" height="14" rx="4"/><path d="M34 18h4v6h-4"/><rect x="12" y="18.5" width="6" height="5" rx="1.5" fill="currentColor" stroke="none" opacity=".8"/>',
    notice: ['You dread things you used to handle easily', "Rest doesn't recharge you anymore", 'You feel detached from work you once cared about', 'Even small asks feel like too much'],
    topics: ['burnout', 'stress', 'depression', 'boundaries'] },
  { key: 'low', label: 'Low', blurb: "I don't feel like myself.", tint: '#E3E8EF',
    icon: '<path d="M12 24a7 7 0 1 1 2-13.8A9 9 0 0 1 31 13a6 6 0 0 1-1 11.9z"/><path d="M14 30v4M20 30v5M26 30v4"/>',
    notice: ['Things you enjoyed feel gray', 'Getting out of bed takes negotiating', 'You cancel plans, then feel worse', 'You keep waiting to feel like yourself again'],
    topics: ['depression', 'grief', 'sleep', 'loneliness'] },
  { key: 'numb', label: 'Numb', blurb: 'I know I should feel something. I don’t.', tint: '#E9E6EE',
    icon: '<path d="M12 34V16a8 8 0 0 1 16 0v18l-4-3-4 3-4-3z"/><circle cx="17" cy="17" r="1" fill="currentColor"/><circle cx="23" cy="17" r="1" fill="currentColor"/>',
    notice: ['Days pass without leaving much of a mark', "Good news doesn't land", 'You watch yourself go through the motions', "People ask how you are and you honestly don't know"],
    topics: ['depression', 'trauma', 'burnout', 'stress'] },
  { key: 'lonely', label: 'Lonely', blurb: 'I feel alone — even around people.', tint: '#E6EAE2',
    icon: '<circle cx="20" cy="14" r="5"/><path d="M10 34c1-7 5-10 10-10s9 3 10 10"/>',
    notice: ["You're surrounded by people and still feel unseen", 'Reaching out feels harder than it should', 'You wonder if anyone really knows you', 'Connection feels like something other people have'],
    topics: ['loneliness', 'depression', 'attachment', 'socialanxiety'] },
  { key: 'angry', label: 'Angry', blurb: 'Everything is getting under my skin.', tint: '#F0DBD9',
    icon: '<path d="M22 6 12 24h8l-2 12 12-18h-8z"/>',
    notice: ['Little things set you off faster than before', 'You replay arguments long after they end', 'Your patience runs out by evening', 'You feel guilty after snapping — then it happens again'],
    topics: ['anger', 'stress', 'depression', 'boundaries'] },
  { key: 'stuck', label: 'Stuck', blurb: 'I keep going in circles.', tint: '#E3E8E1',
    icon: '<circle cx="21" cy="21" r="4"/><circle cx="21" cy="21" r="10"/><circle cx="21" cy="21" r="15"/>',
    notice: ["You know what you 'should' do and can't start", 'The same problems keep circling back', 'You feel behind everyone around you', 'Every option feels wrong, so you choose none'],
    topics: ['rumination', 'depression', 'adhd', 'lifetransitions'] },
  { key: 'exhausted', label: 'Exhausted', blurb: "Rest doesn't seem to fix it.", tint: '#E6E4EC',
    icon: '<path d="M30 26a12 12 0 0 1-15.3-15.3A12 12 0 1 0 30 26z"/><path d="M28 8h6l-6 6h6"/>',
    notice: ['You wake up tired no matter how long you sleep', "Coffee doesn't touch it", 'Your body feels heavy by the afternoon', 'Rest feels like one more thing to fail at'],
    topics: ['burnout', 'sleep', 'depression', 'stress'] },
  { key: 'insecure', label: 'Insecure', blurb: 'I keep questioning myself.', tint: '#F6EBD8',
    icon: '<rect x="12" y="8" width="18" height="26" rx="9"/><path d="M17 15q4 -3 8 0M17 21q4 3 8 0" opacity=".7"/>',
    notice: ['You re-read messages before sending them', 'Compliments bounce off; criticism sticks', 'You compare yourself constantly', 'You need reassurance, then doubt it'],
    topics: ['selfesteem', 'perfectionism', 'socialanxiety', 'attachment'] },
  { key: 'disconnected', label: 'Disconnected', blurb: 'I feel far away from everyone.', tint: '#E3E8EF',
    icon: '<path d="M14 20h-4M32 20h-4"/><path d="M18 12v16M24 12v16"/><path d="M18 16h6M18 24h6" opacity=".6"/>',
    notice: ["Conversations feel like they're happening behind glass", "You feel like you're performing yourself", "Places that felt like home don't anymore", "You can't remember the last time you felt fully present"],
    topics: ['trauma', 'depression', 'loneliness', 'attachment'] },
  { key: 'grieving', label: 'Grieving', blurb: "I'm carrying a loss.", tint: '#ECE5F1',
    icon: '<path d="M21 8c6 8 10 13 10 18a10 10 0 0 1-20 0c0-5 4-10 10-18z"/>',
    notice: ['Waves of it arrive without warning', "You feel pressure to be 'over it' by now", 'Some days are fine, which somehow feels wrong too', 'Reminders are everywhere'],
    topics: ['grief', 'depression', 'lifetransitions'] },
  /* --- behind "Show all feelings" --- */
  { key: 'stuckinhead', label: 'Stuck in my head', blurb: "I can't stop thinking.", tint: '#ECE5F1', extra: true,
    icon: '<circle cx="21" cy="18" r="10"/><path d="M17 17c1.5-3 6-3 7 0s-2.5 4-3 7"/><path d="M21 34v-4"/>',
    notice: ['You replay conversations word by word', 'You rehearse things that may never happen', 'Falling asleep takes an hour of mental noise', 'You think about thinking too much'],
    topics: ['rumination', 'anxiety', 'ocd', 'adhd'] },
  { key: 'onedge', label: 'On edge', blurb: "I feel like I'm always bracing for something.", tint: '#F3E4C9', extra: true,
    icon: '<path d="M8 26l6-8 5 5 6-10 5 6 6-9"/>',
    notice: ['You startle easily', 'Your shoulders live somewhere near your ears', 'You scan rooms without meaning to', 'Relaxing feels unsafe, somehow'],
    topics: ['anxiety', 'trauma', 'stress', 'sleep'] },
  { key: 'hurt', label: 'Hurt', blurb: "Something happened and I can't move past it.", tint: '#F0DBD9', extra: true,
    icon: '<path d="M21 34C13 28 8 23.5 8 18.3 8 14.5 11 12 14.5 12c2.6 0 5 1.3 6.5 3.4C22.5 13.3 24.9 12 27.5 12 31 12 34 14.5 34 18.3c0 5.2-5 9.7-13 15.7z"/><path d="m21 15-3 5 5 3-3 5"/>',
    notice: ['It replays at random moments', 'You swing between anger and sadness', 'You wonder if it was your fault', 'Trusting again feels risky'],
    topics: ['trauma', 'grief', 'rumination', 'attachment'] },
  { key: 'lost', label: 'Lost', blurb: "I don't know what I'm doing with my life.", tint: '#E6EAE2', extra: true,
    icon: '<circle cx="21" cy="21" r="14"/><path d="m26 16-3.5 6.5L16 26l3.5-6.5z"/>',
    notice: ['Other people seem to have a map you never got', 'Decisions feel enormous', "You've outgrown things you used to want", 'You keep asking "is this it?"'],
    topics: ['lifetransitions', 'depression', 'selfesteem'] },
  { key: 'ashamed', label: 'Ashamed', blurb: "I can't stop being hard on myself.", tint: '#E9E6EE', extra: true,
    icon: '<circle cx="21" cy="15" r="6"/><path d="M11 34c1-7 5-10 10-10s9 3 10 10"/><path d="M15 12l12 8" opacity=".6"/>',
    notice: ["Your inner voice is harsher than you'd ever be to a friend", "You hide struggles until they're unmanageable", 'Mistakes replay for days', 'You feel like a burden for having needs'],
    topics: ['selfesteem', 'perfectionism', 'depression', 'trauma'] },
  { key: 'shutdown', label: 'Shut down', blurb: 'I disappear when things get hard.', tint: '#E3E8EF', extra: true,
    icon: '<rect x="9" y="10" width="11" height="7" rx="1.5"/><rect x="22" y="10" width="11" height="7" rx="1.5"/><rect x="15" y="19" width="11" height="7" rx="1.5"/><rect x="9" y="28" width="11" height="7" rx="1.5"/><rect x="22" y="28" width="11" height="7" rx="1.5"/>',
    notice: ["You go quiet mid-conflict and can't find words", 'You need hours to recover from hard conversations', 'People read your silence as not caring', "Walls go up before you notice you're building them"],
    topics: ['trauma', 'depression', 'attachment', 'boundaries'] },
  { key: 'outofcontrol', label: 'Out of control', blurb: 'My emotions feel bigger than me.', tint: '#F4E3DB', extra: true,
    icon: '<path d="M10 12h24M13 18h18M16 24h12M19 30h6"/>',
    notice: ['Emotions arrive at full volume', 'You say things you regret mid-flood', 'Small setbacks trigger big reactions', 'Calming down takes longer than it used to'],
    topics: ['emotionalregulation', 'trauma', 'adhd', 'stress'] }
];

/* Editorial questions row */
const QUESTIONS = [
  { q: 'Why am I irritated by everyone lately?', target: ['topic', 'anger'], tint: '#F0DBD9' },
  { q: 'Why do I feel lonely when I have people who love me?', target: ['topic', 'loneliness'], tint: '#E6EAE2' },
  { q: "Why can't I relax when nothing is wrong?", target: ['topic', 'anxiety'], tint: '#ECE5F1' },
  { q: 'Am I burned out or depressed?', target: ['compare', 'burnout-depression'], tint: '#F3E4C9' },
  { q: 'Why do I shut down during conflict?', target: ['compare', 'space-shutdown'], tint: '#E3E8EF' },
  { q: 'Why am I so tired even after sleeping?', target: ['topic', 'sleep'], tint: '#E6E4EC' },
  { q: 'Why do I keep replaying conversations?', target: ['topic', 'rumination'], tint: '#ECE5F1' },
  { q: 'Why do I need everyone to like me?', target: ['topic', 'peoplepleasing'], tint: '#F4E3DB' },
  { q: "Why don't I feel excited about anything anymore?", target: ['topic', 'depression'], tint: '#E3E8EF' },
  { q: 'Why do small things feel so overwhelming?', target: ['topic', 'stress'], tint: '#F3E4C9' }
];

/* Pattern finder chips → suggested topics */
const PATTERNS = [
  { label: "I'm sleeping differently", topics: ['sleep', 'depression', 'anxiety'] },
  { label: "I'm avoiding people", topics: ['socialanxiety', 'depression', 'burnout'] },
  { label: "I can't concentrate", topics: ['adhd', 'anxiety', 'sleep', 'stress'] },
  { label: "I'm crying more", topics: ['depression', 'grief', 'emotionalregulation'] },
  { label: "I'm more irritable", topics: ['stress', 'anger', 'sleep', 'depression'] },
  { label: "I don't enjoy things", topics: ['depression', 'burnout'] },
  { label: "I'm overthinking everything", topics: ['rumination', 'anxiety', 'ocd'] },
  { label: 'I feel restless', topics: ['anxiety', 'adhd', 'stress'] },
  { label: 'I keep checking things', topics: ['ocd', 'anxiety'] },
  { label: "I'm drinking more", topics: ['substance', 'stress', 'depression'] },
  { label: 'I feel disconnected', topics: ['trauma', 'depression', 'loneliness'] },
  { label: "I'm having physical symptoms", topics: ['anxiety', 'stress', 'panic'] },
  { label: 'My appetite changed', topics: ['eating', 'depression', 'stress'] },
  { label: "I'm struggling at work", topics: ['burnout', 'adhd', 'stress'] },
  { label: 'My relationships feel harder', topics: ['boundaries', 'attachment', 'stress'] }
];

/* Comparisons */
const COMPARES = {
  'anxiety-stress': { a: 'Stress', b: 'Anxiety',
    aPts: ['Usually tied to a real, current demand', 'Eases when the pressure passes', 'Can even be motivating in small doses'],
    bPts: ["Sticks around even when nothing's wrong", 'Future-focused what-ifs that multiply', 'Starts to shape what you avoid'] },
  'burnout-depression': { a: 'Burnout', b: 'Depression',
    aPts: ['Tied to sustained overload — often work or caregiving', 'Improves with real rest and distance', 'Cynicism and detachment aimed at the source'],
    bPts: ['Colors every area of life, not just the draining one', "Rest alone doesn't lift it", 'Loss of interest in things you loved'] },
  'adhd-anxiety': { a: 'ADHD', b: 'Anxiety',
    aPts: ["Distraction happens even when you're calm", 'A lifelong pattern, across many settings', 'Interest can drive hours of deep focus'],
    bPts: ['Worry is what steals the focus', 'Concentration returns when worry settles', 'The mind is busy with fears, not everything at once'] },
  'ocd-overthinking': { a: 'OCD', b: 'Overthinking',
    aPts: ['Thoughts feel intrusive and unwanted', 'Rituals or checking to relieve the distress', 'Relief is brief — the loop returns'],
    bPts: ['Thoughts feel like "you," just too many of them', 'No rituals — replaying and rehearsing instead', 'Eases with distraction or resolution'] },
  'grief-depression': { a: 'Grief', b: 'Depression',
    aPts: ['Comes in waves, often triggered by reminders', 'Memories can still bring warmth alongside pain', 'Self-esteem usually stays intact'],
    bPts: ['More constant, less tied to reminders', 'Warmth is hard to access anywhere', 'Often comes with harsh self-judgment'] },
  'panic-anxietyattack': { a: 'Panic attack', b: 'Anxiety attack',
    aPts: ['Sudden — peaks within minutes', 'Intense physical surge: heart, breath, dizziness', 'Can arrive out of nowhere'],
    bPts: ['Builds gradually alongside a stressor', 'Worry-heavy, with tension that climbs', 'Usually tied to something identifiable'] },
  'shyness-socialanxiety': { a: 'Shyness', b: 'Social anxiety',
    aPts: ['Warm-up time, then you settle in', 'Discomfort fades with familiarity', "Doesn't stop you from what matters"],
    bPts: ["Fear of judgment that doesn't fade", 'Replaying interactions for days', 'Avoiding events, calls, or people entirely'] },
  'standards-perfectionism': { a: 'High standards', b: 'Perfectionism',
    aPts: ['Goals stretch you and feel satisfying to meet', 'Mistakes are information', 'You can call something finished'],
    bPts: ['Goals move the moment you reach them', 'Mistakes feel like verdicts on who you are', 'Nothing ever feels done enough to share'] },
  'peoplepleasing-kindness': { a: 'Kindness', b: 'People pleasing',
    aPts: ['Given freely, from choice', 'You can say no without spiraling', 'Generosity that includes yourself'],
    bPts: ['Driven by fear of disappointing', '"No" feels dangerous', 'Resentment quietly builds'] },
  'space-shutdown': { a: 'Needing space', b: 'Shutting down',
    aPts: ['You name it — "I need an hour" — and come back', 'Time alone genuinely restores you', 'Connection resumes afterward'],
    bPts: ['You disappear without words', 'Distance protects you but isolates you', 'Conversations stay unfinished'] }
};
const COMPARE_ORDER = ['anxiety-stress', 'burnout-depression', 'adhd-anxiety', 'ocd-overthinking', 'grief-depression', 'panic-anxietyattack', 'shyness-socialanxiety', 'standards-perfectionism', 'peoplepleasing-kindness', 'space-shutdown'];
const COMPARE_TINTS = ['#E6E4EC', '#F3E4C9', '#ECE5F1', '#E3E8E1', '#E3E8EF', '#F4E3DB', '#E6EAE2', '#F6EBD8', '#F0DBD9', '#E9E6EE'];

/* Go deeper featured topics */
const DEEPER = [
  { title: 'Overthinking', blurb: 'Why your brain keeps circling — and what may be underneath it.', topic: 'rumination', tint: '#ECE5F1',
    art: '<circle cx="60" cy="42" r="24" fill="none" stroke="#8E77A0" stroke-width="3"/><path d="M50 40c3-7 14-7 16 0s-6 9-7 16" fill="none" stroke="#8E77A0" stroke-width="3" stroke-linecap="round"/>' },
  { title: 'Feeling disconnected', blurb: "When you're there, but somehow don't feel present.", topic: 'trauma', tint: '#E3E8EF',
    art: '<circle cx="45" cy="45" r="16" fill="none" stroke="#7B8A9E" stroke-width="3"/><circle cx="75" cy="45" r="16" fill="none" stroke="#7B8A9E" stroke-width="3" stroke-dasharray="6 5"/>' },
  { title: 'Always exhausted', blurb: 'Understanding the connection among stress, sleep, mood, and mental load.', topic: 'sleep', tint: '#E6E4EC',
    art: '<path d="M74 58a22 22 0 0 1-28-28 22 22 0 1 0 28 28z" fill="none" stroke="#6E6295" stroke-width="3" stroke-linejoin="round"/>' },
  { title: 'People pleasing', blurb: "Why it's so hard to say no — and how to start.", topic: 'peoplepleasing', tint: '#F4E3DB',
    art: '<circle cx="48" cy="38" r="10" fill="none" stroke="#BE765F" stroke-width="3"/><path d="M32 66c2-12 8-17 16-17" fill="none" stroke="#BE765F" stroke-width="3" stroke-linecap="round"/><path d="M66 44l14-6M66 52l16 0M66 60l14 6" stroke="#BE765F" stroke-width="3" stroke-linecap="round"/>' },
  { title: 'Emotional regulation', blurb: 'Strengthening your ability to respond, not just react.', topic: 'emotionalregulation', tint: '#E6EAE2',
    art: '<path d="M30 60q15-30 30-15t30-15" fill="none" stroke="#687A65" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="45" r="4" fill="#687A65"/>' }
];

/* Support threshold signals */
const SIGNALS = [
  { label: 'Keeps coming back', icon: '<path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 20v-5h5"/>', tint: '#ECE5F1' },
  { label: 'Feels difficult to manage alone', icon: '<path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.1C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.7-3.5 6.9-8.5 10.9z"/>', tint: '#F0DBD9' },
  { label: 'Affects work, school, or daily life', icon: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>', tint: '#F3E4C9' },
  { label: 'Causes significant distress', icon: '<path d="M6 18c2-7 5-11 9-10s6 5 4 8-6 5-8 2 0-7 4-7"/>', tint: '#E6E4EC' },
  { label: 'Leads you to avoid parts of your life', icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-5 3.5-7.5 7-7.5"/><path d="M15 14l6 6M21 14l-6 6"/>', tint: '#E3E8EF' },
  { label: 'Makes you feel unsafe', icon: '<path d="M12 3 5 6v5c0 4.4 3 8.4 7 9.5 4-1.1 7-5.1 7-9.5V6z"/>', tint: '#E6EAE2' }
];

/* ===================== RENDER ===================== */

const feelGrid = document.getElementById('uy-feelings');
feelGrid.innerHTML = FEELINGS.map(f => `
  <button class="uy-feeling ${f.extra ? 'uy-extra' : ''}" data-feeling="${f.key}" style="--chip:${f.tint}" ${f.extra ? 'hidden' : ''}>
    <span class="uy-feeling-icon"><svg viewBox="0 0 42 42" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${f.icon}</svg></span>
    <strong>${f.label}</strong>
    <span class="uy-feeling-blurb">${f.blurb}</span>
  </button>`).join('');

document.getElementById('uy-topiccats').innerHTML = TOPIC_CATS.map(cat => `
  <div class="uy-cat">
    <h3>${cat.name}</h3>
    <div class="uy-cat-topics">
      ${cat.keys.map(k => `<button class="uy-topicchip" data-topic="${k}"><strong>${TOPICS[k].label}</strong><span>${TOPICS[k].tagline}</span></button>`).join('')}
    </div>
  </div>`).join('');

document.getElementById('uy-qrow').innerHTML = QUESTIONS.map((q, i) => `
  <button class="uy-qcard" data-q="${i}" style="--chip:${q.tint}">
    <span class="uy-qmark" aria-hidden="true">?</span>
    <span>${q.q}</span>
  </button>`).join('');

document.getElementById('uy-pchips').innerHTML = PATTERNS.map((p, i) => `
  <label class="flow-chip"><input type="checkbox" data-pattern="${i}"><span>${p.label} +</span></label>`).join('');

document.getElementById('uy-comparegrid').innerHTML = COMPARE_ORDER.map((k, i) => {
  const c = COMPARES[k];
  return `<button class="uy-comparecard" data-compare="${k}" style="--chip:${COMPARE_TINTS[i]}">
    <span class="uy-vs"><strong>${c.a}</strong><em>vs.</em><strong>${c.b}</strong></span>
    <span class="path-cta">Compare <span aria-hidden="true">→</span></span>
  </button>`;
}).join('');

document.getElementById('uy-deepergrid').innerHTML = DEEPER.map(d => `
  <button class="uy-deepercard" data-topic="${d.topic}">
    <span class="uy-deeperart" style="--chip:${d.tint}"><svg viewBox="0 0 120 90" aria-hidden="true">${d.art}</svg></span>
    <h3>${d.title}</h3>
    <p>${d.blurb}</p>
    <span class="path-cta">Explore <span aria-hidden="true">→</span></span>
  </button>`).join('');

document.getElementById('uy-signals').innerHTML = SIGNALS.map(s => `
  <div class="uy-signal">
    <span class="uy-signal-icon" style="--chip:${s.tint}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span>
    <p>${s.label}</p>
  </div>`).join('');

/* ===================== TABS ===================== */

const tabs = document.querySelectorAll('.uy-tab');
const panels = { feel: document.getElementById('uy-tab-feel'), wonder: document.getElementById('uy-tab-wonder') };

function setTab(name) {
  tabs.forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  panels.feel.hidden = name !== 'feel';
  panels.wonder.hidden = name !== 'wonder';
}
tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

document.querySelectorAll('[data-tab-jump]').forEach(b => b.addEventListener('click', () => {
  setTab(b.dataset.tabJump);
  document.getElementById('uy-explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

document.getElementById('uy-showall').addEventListener('click', e => {
  const hiddenOnes = feelGrid.querySelectorAll('.uy-extra[hidden]');
  if (hiddenOnes.length) {
    hiddenOnes.forEach(el => el.hidden = false);
    e.currentTarget.textContent = 'Show fewer feelings';
  } else {
    feelGrid.querySelectorAll('.uy-extra').forEach(el => el.hidden = true);
    e.currentTarget.textContent = 'Show all feelings';
  }
});

/* ===================== DETAIL PANEL ===================== */

const detailWrap = document.getElementById('uy-detailwrap');
const detailScreen = document.getElementById('uy-detail-screen');
const detailHistory = [];

function openDetail(html, push = true) {
  if (push && detailScreen.innerHTML) detailHistory.push(detailScreen.innerHTML);
  detailWrap.hidden = false;
  detailScreen.classList.remove('flow-in');
  void detailScreen.offsetWidth;
  detailScreen.innerHTML = html;
  detailScreen.classList.add('flow-in');
  bindDetail();
  detailWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeDetail() {
  detailWrap.hidden = true;
  detailScreen.innerHTML = '';
  detailHistory.length = 0;
}
document.getElementById('uy-back').addEventListener('click', () => {
  const prev = detailHistory.pop();
  if (prev) { detailScreen.innerHTML = prev; bindDetail(); }
  else closeDetail();
});
document.getElementById('uy-close').addEventListener('click', closeDetail);

const topicCardHtml = (k, desc) => `
  <button class="next-step" data-topic="${k}">
    <h3>${TOPICS[k].label}</h3>
    <p>${desc || TOPICS[k].tagline}</p>
    <span class="path-cta">Explore <span aria-hidden="true">→</span></span>
  </button>`;

const notSureHtml = `
  <div class="uy-notsure">
    <p><strong>Not sure which sounds like you?</strong> That's okay. Overlap is common — a feeling is a starting point, not a diagnosis.</p>
    <a class="btn btn-dark btn-sm" href="start-here.html">Take a Kindred Check-In</a>
  </div>`;

/* --- panel builders --- */

function feelingPanel(f) {
  if (f.facets) {
    return `
      <p class="flow-kicker">${f.label}</p>
      <h2 class="flow-title">${f.label} can feel like a lot of different things.</h2>
      <p class="flow-hint">Which feels most like you?</p>
      <div class="flow-options">
        ${f.facets.map((fc, i) => `
          <button class="flow-option uy-facet" data-facet="${i}" data-feeling="${f.key}">
            <strong>${fc.label}</strong>${fc.desc ? `<span class="uy-facet-desc">${fc.desc}</span>` : ''}
          </button>`).join('')}
      </div>`;
  }
  return feelingResult(f);
}

function feelingResult(f, kicker) {
  return `
    <p class="flow-kicker">${kicker || f.label}</p>
    <h2 class="flow-title">When you're feeling ${f.label.toLowerCase()}</h2>
    <p class="flow-hint">You might notice:</p>
    <ul class="therapy-truths">${f.notice.map(n => `<li>${n}</li>`).join('')}</ul>
    <div class="uy-showsup">
      <h3>This can show up in more than one way.</h3>
      <div class="flow-nextsteps">${f.topics.map(t => topicCardHtml(t)).join('')}</div>
    </div>
    ${notSureHtml}`;
}

function mindRacingPanel() {
  const topics = [
    ['anxiety', 'Persistent fear or worry that may be difficult to control.'],
    ['stress', 'Your mind responding to real or perceived demands.'],
    ['perfectionism', 'Feeling pressure to anticipate mistakes or get everything right.'],
    ['ocd', 'When intrusive thoughts and repetitive responses become difficult to control.'],
    ['trauma', 'When your nervous system stays alert to possible danger.'],
    ['adhd', 'When attention regulation and mental load contribute to overload.']
  ];
  return `
    <p class="flow-kicker">Anxious — my mind won't stop</p>
    <h2 class="flow-title">When your mind won't stop</h2>
    <p class="uy-editorial">Replaying. Predicting. Planning. Preparing. Sometimes your brain works overtime because it is trying to protect you — even when all that thinking leaves you exhausted.</p>
    <p class="flow-hint">You might notice:</p>
    <ul class="therapy-truths">
      <li>Replaying conversations</li><li>Imagining worst-case scenarios</li><li>Difficulty making decisions</li>
      <li>Trouble falling asleep</li><li>Constant "what if?" thoughts</li><li>Needing reassurance</li><li>Feeling mentally exhausted</li>
    </ul>
    <div class="uy-showsup">
      <h3>This can show up in more than one way.</h3>
      <div class="flow-nextsteps">${topics.map(([k, d]) => topicCardHtml(k, d)).join('')}</div>
    </div>
    ${notSureHtml}`;
}

function topicPanel(k) {
  const t = TOPICS[k];
  const qs = t.questions ? `
    <p class="flow-hint">You might be wondering:</p>
    <ul class="therapy-truths">${t.questions.map(q => `<li>${q}</li>`).join('')}</ul>` : `
    <p class="flow-hint">Clear, human answers — what it is, what it can feel like, and what helps — reviewed for clinical accuracy.</p>`;
  return `
    <p class="flow-kicker">Understanding</p>
    <h2 class="flow-title">${t.label}</h2>
    <p class="uy-editorial">${t.tagline}</p>
    ${qs}
    <div class="hero-ctas">
      <a class="btn btn-dark" href="#">Understand ${t.label.toLowerCase().replace(/ & mental health/, '')}</a>
      <a class="btn btn-outline" href="start-here.html">Take a check-in</a>
    </div>
    <p class="flow-fine">A feeling or a pattern is a starting point, not a diagnosis. Only a qualified professional can diagnose.</p>`;
}

function comparePanel(k) {
  const c = COMPARES[k];
  return `
    <p class="flow-kicker">It can be hard to tell the difference</p>
    <h2 class="flow-title">${c.a} or ${c.b}?</h2>
    <div class="uy-comparecols">
      <div class="uy-comparecol">
        <h3>${c.a}</h3>
        <ul class="therapy-truths">${c.aPts.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
      <div class="uy-comparecol">
        <h3>${c.b}</h3>
        <ul class="therapy-truths">${c.bPts.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
    </div>
    <p class="flow-safety-note">Overlap is common — many people experience both at once, and these patterns share real ground. Only a qualified professional can diagnose. If this resonates, a <a href="start-here.html"><strong>Kindred Check-In</strong></a> or a conversation with a therapist is a good next step.</p>`;
}

function patternResult(selected) {
  const counts = {};
  selected.forEach(p => p.topics.forEach(t => counts[t] = (counts[t] || 0) + 1));
  const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 5);
  return `
    <p class="flow-kicker">Making sense of it</p>
    <h2 class="flow-title">Here are some topics that may be worth exploring.</h2>
    <div class="flow-recap">${selected.map(p => `<span>${p.label}</span>`).join('')}</div>
    <p class="flow-hint">Patterns like these can relate to more than one thing — that's normal, and it isn't a verdict.</p>
    <div class="flow-nextsteps">${ranked.map(t => topicCardHtml(t)).join('')}</div>
    ${notSureHtml}
    <p class="flow-fine">This isn't an assessment or a diagnosis — just a map of where to read next.</p>`;
}

/* --- detail event delegation --- */

function bindDetail() {
  detailScreen.querySelectorAll('.uy-facet').forEach(b => b.addEventListener('click', () => {
    const f = FEELINGS.find(x => x.key === b.dataset.feeling);
    const fc = f.facets[Number(b.dataset.facet)];
    if (fc.special === 'mindracing') window.location.href = 'mind-wont-stop.html';
    else openDetail(feelingResult({ ...f, topics: fc.topics }, `${f.label} — ${fc.label.toLowerCase()}`));
  }));
  detailScreen.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => openDetail(topicPanel(b.dataset.topic))));
}

/* ===================== PAGE EVENTS ===================== */

feelGrid.addEventListener('click', e => {
  const card = e.target.closest('[data-feeling]');
  if (card) openDetail(feelingPanel(FEELINGS.find(f => f.key === card.dataset.feeling)), false);
});

document.getElementById('uy-topiccats').addEventListener('click', e => {
  const chip = e.target.closest('[data-topic]');
  if (chip) openDetail(topicPanel(chip.dataset.topic), false);
});

document.getElementById('uy-qrow').addEventListener('click', e => {
  const card = e.target.closest('[data-q]');
  if (!card) return;
  const [kind, key] = QUESTIONS[Number(card.dataset.q)].target;
  openDetail(kind === 'topic' ? topicPanel(key) : comparePanel(key), false);
});

document.getElementById('uy-comparegrid').addEventListener('click', e => {
  const card = e.target.closest('[data-compare]');
  if (card) openDetail(comparePanel(card.dataset.compare), false);
});

document.getElementById('uy-deepergrid').addEventListener('click', e => {
  const card = e.target.closest('[data-topic]');
  if (card) openDetail(topicPanel(card.dataset.topic), false);
});

document.getElementById('uy-pattern-go').addEventListener('click', () => {
  const selected = [...document.querySelectorAll('input[data-pattern]:checked')]
    .map(i => PATTERNS[Number(i.dataset.pattern)]);
  if (!selected.length) {
    document.getElementById('uy-pchips').classList.add('uy-shake');
    setTimeout(() => document.getElementById('uy-pchips').classList.remove('uy-shake'), 500);
    return;
  }
  openDetail(patternResult(selected), false);
});

document.getElementById('uy-qarrow').addEventListener('click', () => {
  const row = document.getElementById('uy-qrow');
  const nearEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 20;
  row.scrollTo({ left: nearEnd ? 0 : row.scrollLeft + 360, behavior: 'smooth' });
});

/* ---------- deep links: #topic=KEY / #compare=KEY (used by exploration result pages) ---------- */
(() => {
  const t = location.hash.match(/topic=([a-z]+)/);
  const c = location.hash.match(/compare=([a-z-]+)/);
  if (t && TOPICS[t[1]]) { setTab('wonder'); openDetail(topicPanel(t[1]), false); }
  else if (c && COMPARES[c[1]]) openDetail(comparePanel(c[1]), false);
})();
