-- ============================================================================
-- 0008 — Stripe billing link-up + automatic listing activation
--
-- WHY THIS EXISTS
-- Therapists pay on the website (Stripe web checkout, never in-app so Apple
-- takes no cut). Something has to turn that payment into a live listing, or
-- someone has to do it by hand for every therapist. This adds:
--   1. the columns that tie a therapist row to their Stripe customer/subscription
--   2. two SECURITY DEFINER functions the webhook calls to flip `published`
--
-- SECURITY
-- Both functions are explicitly REVOKED from anon/authenticated. They can only
-- be called with the service_role key, which lives in the Edge Function's env
-- and never touches a browser. Without that revoke, any signed-in user could
-- publish their own listing without paying.
-- ============================================================================

alter table therapists add column if not exists stripe_customer_id     text;
alter table therapists add column if not exists stripe_subscription_id text;
alter table therapists add column if not exists subscription_status    text;

create index if not exists therapists_stripe_customer_idx
  on therapists (stripe_customer_id) where stripe_customer_id is not null;

-- ---------------------------------------------------------------------------
-- Called on checkout.session.completed, where we know the therapist's EMAIL
-- (we pass it through as client_reference_id / customer_details.email).
-- Resolves that to their auth user, then activates their listing.
-- ---------------------------------------------------------------------------
create or replace function stripe_activate_listing(
  p_email           text,
  p_customer_id     text default null,
  p_subscription_id text default null,
  p_status          text default 'active'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_active  boolean;
begin
  if p_email is null or p_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;

  select id into v_user_id
    from auth.users
   where lower(email) = lower(p_email)
   limit 1;

  if v_user_id is null then
    -- They paid but we can't match an account (e.g. they checked out with a
    -- different email). Surfaced so the webhook can log it for manual follow-up.
    return jsonb_build_object('ok', false, 'reason', 'no_user_for_email', 'email', p_email);
  end if;

  v_active := p_status in ('active', 'trialing');

  update therapists
     set published              = v_active,
         accepting              = case when v_active then true else accepting end,
         stripe_customer_id     = coalesce(p_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
         subscription_status    = p_status
   where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_row', 'user_id', v_user_id);
  end if;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'published', v_active);
end;
$$;

-- ---------------------------------------------------------------------------
-- Called on subscription lifecycle events (updated / deleted / payment failed),
-- where Stripe gives us the CUSTOMER id rather than an email. Keeps the listing
-- in sync: lapsed or cancelled subscriptions unlist the profile without
-- deleting anything.
-- ---------------------------------------------------------------------------
create or replace function stripe_sync_subscription(
  p_customer_id     text,
  p_subscription_id text default null,
  p_status          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if p_customer_id is null or p_customer_id = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_customer_id');
  end if;

  v_active := p_status in ('active', 'trialing');

  update therapists
     set published              = v_active,
         stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
         subscription_status    = p_status
   where stripe_customer_id = p_customer_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_therapist_for_customer', 'customer', p_customer_id);
  end if;

  return jsonb_build_object('ok', true, 'published', v_active, 'status', p_status);
end;
$$;

-- Service-role only. A signed-in therapist must NOT be able to publish
-- themselves without paying.
revoke all on function stripe_activate_listing(text, text, text, text) from public, anon, authenticated;
revoke all on function stripe_sync_subscription(text, text, text)      from public, anon, authenticated;
