# What has to go server-side to link a client to a therapist

**Written 2026-08-09.** Purpose: size the BAA trigger precisely, so the
decision is about a known set of fields rather than a vague sense that
"client data" is coming. Take this to counsel — a field-level inventory turns
a discovery conversation into a yes/no one.

Not legal advice. The covered-entity / business-associate determination is
fact-specific.

---

## 1. Where client data lives today

**Everything is on the device.** `localStorage["kindred-client-state"]`, written
by `saveClientState()` in `app/app.js`:

| Key | Contents |
|---|---|
| `intake` | the whole questionnaire — see §2 |
| `intakeStep` | where they stopped |
| `shortlistIds` | therapists swiped right on |
| `matches[]` | status, `needsSnapshot`, `introMessage`, `desiredFrequency`, `profileShared`, `scheduledDay/Time`, `portal{goals,homework,resources}`, `paymentStatus`, `amountPaid`, `slotLabel` |
| `therapists{}` | cached public profiles — business data, not client data |
| `chatLog{}` | `therapistId → [{from, text}]` — the messages |
| `savedResources` | article ids saved from Explore |

**The only client data server-side today** is `client_notify`:
`email`, `phone`, `contact_pref`, `created_at`. Contact details with **no
health information attached** — no needs, no therapist, no free text. That
separation is the reason the current build is clean, and it is the thing not
to break casually.

---

## 2. The intake, field by field

Sensitivity is "once stored server-side and attached to an identifiable
person". Nothing here is PHI while it sits in the browser.

### Health information — the part that makes this HIPAA rather than privacy

| Field | Why it counts |
|---|---|
| `needs[]` | Anxiety, Trauma, Grief… — condition-level, diagnosis-adjacent |
| `notSure`, `quizStage` | reveal the symptom-led path was taken |
| `knowsNeeds` | new to therapy vs. experienced |
| `prevExperience[]`, `prevNotes` | prior treatment history, free text |
| `careFor`, `childAge` | care sought for a child = a second data subject, a minor |
| `modality` | CBT / EMDR — treatment preference |
| `stylePref` | how they want to be treated |
| `availability[]` | when they can attend appointments |

### Identifiers — not health data alone, but they make the above identifiable

`age` (exact, not a band) · `selfGender` · `city`, `state` · `field`
(occupation) · `insurance`, `hasInsurance` · `budgetRange` · plus `email` /
`phone` already in `client_notify`

### Preferences about the therapist — the least sensitive

`genderPref` · `ethnicityPref` · `lgbtqRequired` · `affinities[]` · `faith[]`
· `languagePref` · `formats[]` · `mustBeAccepting`

`affinities` and `faith` are worth a second look: they are stated as
preferences about a therapist, but in practice a client picks them because
they describe *themselves*. Treat as sensitive.

---

## 3. What linking actually requires

Linking = a therapist, on their own device, sees an inquiry and can reply.

### Tier 1 — unavoidable, and unambiguously PHI

| Data | Why it cannot stay local |
|---|---|
| **The association**: `client_id ↔ therapist_id ↔ status` | Two devices must agree a relationship exists |
| **Messages** (`chatLog`) | The product is two people talking |
| **`introMessage`** | Free text written to a provider about why they need help |
| **A display name** | The therapist has to know who they are talking to |

**The association alone is PHI**, and this is the finding that constrains
everything else. "This identifiable person is seeking care from this named
psychotherapist" is health information on its own — before a single message.
The therapist is a public listing, so their side is never secret.

### Tier 2 — PHI, technically optional, but the product leans on them

`needsSnapshot[]` (what the inquiry is about) · `desiredFrequency` ·
`scheduledDay/Time` — **appointment information with a provider is PHI** ·
`portal{goals, homework, resources}` — clinical by definition ·
`paymentStatus`, `amountPaid`, `slotLabel` — a payment tied to a named
psychotherapist

### Tier 3 — only if the client opts to share

The `profileShared` toggle sends the whole §2 intake summary. Already
consent-gated and off by default, which is right.

### Tier 4 — can stay local forever

`shortlistIds` · `deck` · `savedResources` · `intakeStep` ·
`crisisAcknowledged` · cached therapist profiles

---

## 4. Does an opaque-token design avoid the BAA?

**No.** Worth writing down because it is the obvious next idea.

1. **Metadata is the leak.** Even with perfect end-to-end encryption, the
   server still stores *who is talking to which therapist*. That association
   is the PHI. Encrypting the message bodies does not encrypt the fact of the
   relationship.
2. **Encrypted-without-the-key is still a business associate.** OCR's cloud
   computing guidance is explicit: a cloud provider storing encrypted PHI it
   cannot read is a BA and needs a BAA. The "conduit" exception covers
   transmission, not storage.
3. **E2EE across two web clients is a large build** — key management, device
   loss, therapists on multiple devices — and it buys defence-in-depth, not a
   compliance exit.

Verdict: **worth doing eventually for blast radius, useless as a way to skip
the BAA.**

---

## 5. The one design that genuinely avoids it

**Introduce and hand off, instead of hosting the relationship.**

- Client chooses a therapist
- Kindred passes the client's contact detail to that therapist **once**
- Every subsequent conversation happens in the therapist's own systems, which
  are already their compliance problem
- Kindred stores: the introduction happened, and when. No messages, no
  clinical content, no ongoing relationship record

This is how most therapist directories work, and it is why. It plausibly puts
Kindred outside business-associate status for the client side.

**The cost is the product.** In-app messaging, the shared client profile, the
portal, On-Demand booking, and "a tiny hello has arrived" all live on the
hosted relationship. This is a positioning decision, not a technical one:
directory-with-good-matching versus platform-where-therapy-starts.

---

## 6. Options, with what each actually costs

| | What you build | Cost | Keeps |
|---|---|---|---|
| **A. Wait** | nothing — ship therapist-side + waitlist | £0 | everything, deferred |
| **B. Supabase HIPAA** | nothing — flip the tier, sign the BAA | ~$600/mo | everything |
| **C. Move the DB** | Postgres on AWS/GCP under their BAA (no extra charge), rebuild auth + PostgREST | ops time + hosting | everything |
| **D. Introduce & hand off** | replace messaging with a one-time introduction | ~£0 | matching; loses the platform |

**A is free and you are already in it.** Nothing on the therapist side —
profiles, licences, billing, the review queue — touches client PHI. The
waitlist (`client_notify`) is contact details with no health data attached.
The meter only starts when Tier 1 ships.

---

## 7. Questions for counsel

1. Given §3 Tier 1, is Kindred a **business associate** of the therapists, a
   **covered entity** in its own right, or neither?
2. Does it change if every therapist is cash-pay and none bills insurance
   electronically? (Some listed therapists accept insurance, so likely moot —
   but worth knowing.)
3. Does the **§5 hand-off model** put us outside BA status, or does storing
   "an introduction occurred" still count?
4. **Texas HB 300** defines covered entity far more broadly than HIPAA —
   anyone who assembles, collects, stores or transmits PHI. Does it reach us
   under any of these options, including §5?
5. **Washington My Health My Data** has a private right of action. Do we need
   to geo-gate WA clients at launch, or comply?
6. Minors: `careFor: 'child'` + `childAge` means a second data subject.
   Parental consent requirements?

---

## 8. Recommendation

Take **option A** through the mid-September client date: therapist-side and
waitlist only, no Tier 1. It costs nothing and it is already built.

Use that runway for one hour with a healthcare privacy attorney on the
questions in §7 — cheaper than a single month of the add-on, and the answer
to Q1 and Q3 decides whether the long-run answer is B, C or D.

**Do not** let Tier 1 ship "just to test with a friend". The gate is the first
real record, not launch day.
