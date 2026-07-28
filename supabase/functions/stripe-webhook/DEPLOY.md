# Deploying the Stripe webhook

Turns a completed checkout into a live listing automatically. Four steps.

---

## 1. Run migration `0008_stripe_billing.sql`

Supabase Dashboard → **SQL Editor** → New query → paste `0008_stripe_billing.sql` → **Run**.

Adds `stripe_customer_id` / `stripe_subscription_id` / `subscription_status` to
`therapists`, plus the two functions the webhook calls. Both are revoked from
`anon`/`authenticated` so only the service role can publish a listing.

---

## 2. Deploy the function

**Dashboard (no CLI needed):**
Supabase Dashboard → **Edge Functions** → **Deploy a new function** →
name it exactly `stripe-webhook` → paste the contents of `index.ts` → Deploy.

> ### ⚠️ TURN OFF "VERIFY JWT"
> Supabase Edge Functions require a Supabase auth token by default. **Stripe
> does not send one**, so with this on, every webhook fails with `401` and
> nothing ever activates.
>
> Turn **Verify JWT** OFF for this function (a toggle in the function's
> settings, or `--no-verify-jwt` on the CLI).
>
> This is safe: the function verifies Stripe's own cryptographic signature
> before trusting anything, which is the correct auth for a webhook.

**CLI alternative:**
```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

Your function URL will be:
```
https://izukppxgoerqtustfbnk.supabase.co/functions/v1/stripe-webhook
```

---

## 3. Create the webhook endpoint in Stripe

Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**

- **Endpoint URL:** the function URL above
- **Events to send** — select exactly these four:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Then copy the **Signing secret** (starts with `whsec_`).

---

## 4. Set the two secrets

Supabase Dashboard → **Edge Functions → stripe-webhook → Secrets**
(or **Project Settings → Edge Functions → Secrets**):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | your Stripe **secret** key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_…` signing secret from step 3 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not add them by hand.

> Both of these are real secrets. They belong **only** here, in the function's
> environment. Never put them in the app, the website, or a repo.

---

## Testing it

1. Stripe Dashboard → your webhook endpoint → **Send test webhook** →
   `checkout.session.completed`. You should get a `200`.
2. For a true end-to-end test, buy your own listing with a real card, confirm
   the profile flips to published, then refund yourself in Stripe.
3. Logs live at Supabase → Edge Functions → `stripe-webhook` → **Logs**.

### What the logs mean
- `listing activated` — worked.
- `ACTIVATION NEEDS MANUAL REVIEW` — they paid, but the email they used at
  checkout doesn't match any Kindred account. Nothing is lost; match it by hand
  and check the email they used. (Rare, since checkout is opened with their
  account email prefilled.)

---

## What happens automatically after this

| Event | Result |
|---|---|
| Checkout completed | Profile goes **live** in client matching |
| Subscription cancelled | Profile **unlists** (nothing deleted) |
| Payment fails | Profile **unlists** until they fix billing |
| Payment recovers | Profile **relists** |
