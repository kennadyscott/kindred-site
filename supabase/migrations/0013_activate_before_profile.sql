-- ============================================================================
-- 0013 -- Don't lose a payment made before the profile exists
--
-- THE PROBLEM
-- The website now creates the Kindred account BEFORE payment (account-first
-- signup), so the normal order is:
--
--     create account  ->  pay  ->  build profile
--
-- stripe_activate_listing() (0008) does an UPDATE on therapists. Until the
-- therapist builds a profile there is no row to update, so it returned
-- 'no_therapist_row' and gave up. The money was taken, the subscription was
-- never recorded anywhere in our database, and when they later built their
-- profile it stayed unpublished -- paying and invisible, with nothing to
-- reconcile it automatically.
--
-- Before account-first that was a rare edge case. Now it is the default path.
--
-- THE FIX
-- Upsert instead of update. If no row exists, create a stub carrying the
-- Stripe ids and published = true, so the profile is already paid-for by the
-- time they fill it in.
--
-- A stub row is safe to publish because publishing is not the same as being
-- visible: therapists_public and match_therapists (0010) both additionally
-- require license_verified AND identity_verified, which default false. An
-- empty stub therefore cannot appear to a client -- it just records that the
-- membership is paid.
-- ============================================================================

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
  v_created boolean := false;
begin
  if p_email is null or p_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;

  select id into v_user_id
    from auth.users
   where lower(email) = lower(p_email)
   limit 1;

  if v_user_id is null then
    -- They paid with an email that matches no Kindred account. Still worth a
    -- loud log rather than a silent drop -- reconcile by hand.
    return jsonb_build_object('ok', false, 'reason', 'no_user_for_email', 'email', p_email);
  end if;

  v_active := p_status in ('active', 'trialing');

  -- The verification columns are guarded (0011): announce the write.
  perform set_config('kindred.verify_ok', 'on', true);

  update therapists
     set published              = v_active,
         stripe_customer_id     = coalesce(p_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
         subscription_status    = p_status
   where user_id = v_user_id;

  if not found then
    -- Paid before building a profile. Record the membership now so it is not
    -- lost; the profile fills in around it later.
    insert into therapists (user_id, published, stripe_customer_id,
                            stripe_subscription_id, subscription_status)
    values (v_user_id, v_active, p_customer_id, p_subscription_id, p_status)
    on conflict (user_id) do update
      set published              = excluded.published,
          stripe_customer_id     = coalesce(excluded.stripe_customer_id, therapists.stripe_customer_id),
          stripe_subscription_id = coalesce(excluded.stripe_subscription_id, therapists.stripe_subscription_id),
          subscription_status    = excluded.subscription_status;
    v_created := true;
  end if;

  return jsonb_build_object('ok', true, 'user_id', v_user_id,
                            'published', v_active, 'created_stub', v_created);
end;
$$;

revoke all on function stripe_activate_listing(text, text, text, text) from public, anon, authenticated;
