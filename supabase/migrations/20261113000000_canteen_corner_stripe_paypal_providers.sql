-- ==============================================================================
-- CANTEEN CORNER — STRIPE & PAYPAL PROVIDER ADOPTION MIGRATION
-- Migration: 20261113000000_canteen_corner_stripe_paypal_providers.sql
-- Description: Updates public.deposits check constraints and RLS policies
--              to permit 'STRIPE' and 'PAYPAL' payment providers alongside
--              legacy 'TOUCHPAY' records.
--              Updates public.prevent_direct_balance_tampering trigger function
--              to authorize public.process_confirmed_electronic_deposit.
--              Introduces generalized electronic deposit confirmation RPC:
--              public.process_confirmed_electronic_deposit
--              Provides backward-compatibility wrapper for legacy TouchPay RPC.
--              Applies explicit least-privilege grants to service_role.
-- ==============================================================================

BEGIN;

-- 1. Update check constraint on deposits to allow STRIPE, PAYPAL, and legacy TOUCHPAY
ALTER TABLE public.deposits DROP CONSTRAINT IF EXISTS deposits_provider_check;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_provider_check
  CHECK (provider IN ('STRIPE', 'PAYPAL', 'TOUCHPAY'));

-- 2. Update default provider
ALTER TABLE public.deposits ALTER COLUMN provider SET DEFAULT 'STRIPE';

-- 3. Update family deposit insert policy
DROP POLICY IF EXISTS "deposits_insert_family" ON public.deposits;
CREATE POLICY "deposits_insert_family" ON public.deposits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_family_authorized_for_offender(offender_id)
    AND provider IN ('STRIPE', 'PAYPAL', 'TOUCHPAY')
  );

-- 4. Update Offender Balance Protection Trigger Function
--    Permits process_confirmed_electronic_deposit as an authorized execution context
--    alongside place_inmate_order and legacy process_confirmed_touchpay_deposit.
CREATE OR REPLACE FUNCTION public.prevent_direct_balance_tampering()
RETURNS TRIGGER AS $$
DECLARE
  v_stack TEXT;
  v_auth_token TEXT;
  v_bal_delta NUMERIC(10, 2);
  v_spent_delta NUMERIC(10, 2);
  v_is_order_deduction BOOLEAN := false;
  v_is_deposit_credit BOOLEAN := false;
  v_is_weekly_reset BOOLEAN := false;
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance OR NEW.current_weekly_spent IS DISTINCT FROM OLD.current_weekly_spent THEN
    -- Layer 2: Direct client execution is unconditionally rejected
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Direct balance or spending modification is strictly prohibited for client roles (42501).';
    END IF;

    -- Layer 4: Mathematical Delta Invariant Verification
    v_bal_delta := NEW.balance - OLD.balance;
    v_spent_delta := NEW.current_weekly_spent - OLD.current_weekly_spent;

    -- Valid Delta Invariant 1: Commissary order deduction (balance decreases, spend increases by exact same amount)
    IF v_bal_delta < 0.00 AND v_spent_delta = -v_bal_delta AND NEW.current_weekly_spent <= NEW.weekly_limit THEN
      v_is_order_deduction := true;
    -- Valid Delta Invariant 2: Electronic deposit credit (balance increases, spend untouched)
    ELSIF v_bal_delta > 0.00 AND v_spent_delta = 0.00 THEN
      v_is_deposit_credit := true;
    -- Valid Delta Invariant 3: Weekly spending reset (balance untouched, spend zeroed)
    ELSIF v_bal_delta = 0.00 AND NEW.current_weekly_spent = 0.00 AND OLD.current_weekly_spent > 0.00 THEN
      v_is_weekly_reset := true;
    END IF;

    -- If deltas do not match any recognized financial operation invariant, reject immediately
    IF NOT (v_is_order_deduction OR v_is_deposit_credit OR v_is_weekly_reset) THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Balance/spend delta does not conform to an authorized financial transaction invariant.';
    END IF;

    -- Layer 3: Single-Use Dynamic Transaction Token Verification
    v_auth_token := current_setting('canteen_internal.active_tx_auth', true);
    IF v_auth_token IS NOT NULL AND v_auth_token <> '' AND v_auth_token <> 'true' THEN
      -- Token is immediately cleared upon consumption so it cannot be reused
      PERFORM set_config('canteen_internal.active_tx_auth', '', true);
    ELSE
      -- Permit direct DBA/migration console execution ONLY if executing as postgres without auth JWT session
      IF session_user = 'postgres' AND current_user = 'postgres' AND auth.role() IS NULL THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'SECURITY VIOLATION: Financial columns can only be modified via verified transactional functions (place_inmate_order, process_confirmed_electronic_deposit, process_confirmed_touchpay_deposit). Static GUC bypass rejected.';
      END IF;
    END IF;

    -- Layer 5: Verify execution context via call diagnostics
    GET DIAGNOSTICS v_stack = PG_CONTEXT;
    IF NOT (v_stack ILIKE '%place_inmate_order%'
            OR v_stack ILIKE '%process_confirmed_touchpay_deposit%'
            OR v_stack ILIKE '%process_confirmed_electronic_deposit%'
            OR (session_user = 'postgres' AND current_user = 'postgres' AND auth.role() IS NULL)) THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Execution context is not an authorized financial transaction function.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_offender_balance ON public.offenders;
CREATE TRIGGER trg_protect_offender_balance
  BEFORE UPDATE ON public.offenders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_balance_tampering();

-- 5. Provider-Independent Electronic Deposit Confirmation RPC
DROP FUNCTION IF EXISTS public.process_confirmed_electronic_deposit(TEXT, TEXT, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.process_confirmed_electronic_deposit(
  p_provider_ref TEXT,
  p_idempotency_key TEXT,
  p_verified_amount NUMERIC(10, 2),
  p_currency TEXT DEFAULT 'USD',
  p_provider TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_deposit RECORD;
  v_offender RECORD;
  v_max_deposit NUMERIC(10, 2);
  v_auth_token TEXT;
  v_provider TEXT;
BEGIN
  -- Strict caller gate: only service_role or database direct superuser session
  IF auth.role() IS DISTINCT FROM 'service_role' AND (session_user IS DISTINCT FROM 'postgres' OR auth.role() IS NOT NULL) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: process_confirmed_electronic_deposit is restricted to trusted backend service_role.';
  END IF;

  IF p_provider_ref IS NULL OR TRIM(p_provider_ref) = '' THEN
    RAISE EXCEPTION 'Provider reference is required.';
  END IF;

  IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF p_verified_amount IS NULL OR p_verified_amount <= 0.00 THEN
    RAISE EXCEPTION 'Verified deposit amount must be positive.';
  END IF;

  IF p_currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'Unsupported currency (%). Only USD is accepted.', p_currency;
  END IF;

  -- Cross-Idempotency Protection: Verify idempotency key is not bound to a different provider reference
  IF EXISTS (
    SELECT 1 FROM public.deposits
    WHERE idempotency_key = p_idempotency_key AND provider_ref != p_provider_ref
  ) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Idempotency key "%" is already bound to a different provider reference.', p_idempotency_key;
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits
  WHERE provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit with provider reference "%" not found.', p_provider_ref;
  END IF;

  IF v_deposit.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'Idempotency key mismatch for provider reference "%".', p_provider_ref;
  END IF;

  -- Determine payment provider
  v_provider := UPPER(COALESCE(p_provider, v_deposit.provider, 'STRIPE'));
  IF v_provider NOT IN ('STRIPE', 'PAYPAL', 'TOUCHPAY') THEN
    RAISE EXCEPTION 'Invalid payment provider: %', v_provider;
  END IF;

  -- Exact Replay Idempotency
  IF v_deposit.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', true,
      'status', 'SUCCEEDED',
      'message', 'Deposit was already confirmed and credited previously.'
    );
  END IF;

  IF v_deposit.status != 'PENDING' THEN
    RAISE EXCEPTION 'Deposit "%" cannot be processed because current status is "%".',
      p_provider_ref, v_deposit.status;
  END IF;

  -- Amount Mismatch Fraud Detection
  IF v_deposit.amount != p_verified_amount THEN
    UPDATE public.deposits
    SET status = 'FAILED'
    WHERE id = v_deposit.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      v_provider || '_AMOUNT_MISMATCH_FRAUD',
      v_provider || '_GATEWAY',
      'SYSTEM',
      v_deposit.facility_id,
      'DEPOSIT',
      p_provider_ref,
      jsonb_build_object(
        'recorded_amount', v_deposit.amount,
        'verified_amount', p_verified_amount,
        'status', 'FAILED',
        'reason', 'Amount mismatch between recorded intent and verified gateway payload'
      )
    );

    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', false,
      'status', 'FAILED',
      'error', 'AMOUNT_MISMATCH',
      'message', 'Security Alert: Deposit amount mismatch. Deposit marked FAILED and no funds were credited.',
      'recordedAmount', v_deposit.amount,
      'verifiedAmount', p_verified_amount
    );
  END IF;

  -- Facility deposit limit verification
  SELECT max_deposit_amount INTO v_max_deposit
  FROM public.facilities
  WHERE id = v_deposit.facility_id;

  IF v_deposit.amount > v_max_deposit THEN
    UPDATE public.deposits
    SET status = 'FAILED'
    WHERE id = v_deposit.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'DEPOSIT_EXCEEDS_FACILITY_LIMIT',
      v_provider || '_GATEWAY',
      'SYSTEM',
      v_deposit.facility_id,
      'DEPOSIT',
      p_provider_ref,
      jsonb_build_object('amount', v_deposit.amount, 'facility_max', v_max_deposit)
    );

    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', false,
      'status', 'FAILED',
      'error', 'EXCEEDS_FACILITY_LIMIT',
      'message', format('Deposit amount ($%s) exceeds facility limit ($%s).', v_deposit.amount, v_max_deposit)
    );
  END IF;

  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_deposit.offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated offender "%" not found.', v_deposit.offender_id;
  END IF;

  -- Dynamic Transaction Authorization Token
  v_auth_token := encode(digest(v_deposit.offender_id || ':' || v_deposit.amount::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex');
  PERFORM set_config('canteen_internal.active_tx_auth', v_auth_token, true);

  UPDATE public.offenders
  SET balance = balance + v_deposit.amount,
      updated_at = now()
  WHERE id = v_deposit.offender_id;

  UPDATE public.deposits
  SET status = 'SUCCEEDED',
      completed_at = now()
  WHERE id = v_deposit.id;

  INSERT INTO public.ledger_entries (
    facility_id,
    offender_id,
    type,
    debit,
    credit,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    description
  ) VALUES (
    v_deposit.facility_id,
    v_deposit.offender_id,
    'DEPOSIT',
    0.00,
    v_deposit.amount,
    v_offender.balance,
    v_offender.balance + v_deposit.amount,
    'DEPOSIT',
    v_deposit.provider_ref,
    v_provider || ' trust fund deposit ' || v_deposit.provider_ref
  );

  INSERT INTO public.notifications (
    offender_id,
    type,
    title,
    message
  ) VALUES (
    v_deposit.offender_id,
    'DEPOSIT_RECEIVED',
    'Deposit Received',
    'A deposit of $' || v_deposit.amount || ' has been credited to your trust balance via ' || v_provider || '.'
  );

  INSERT INTO public.audit_logs (
    action,
    actor_id,
    actor_role,
    facility_id,
    resource_type,
    resource_id,
    metadata
  ) VALUES (
    v_provider || '_DEPOSIT_CONFIRMED',
    v_provider || '_GATEWAY',
    'SYSTEM',
    v_deposit.facility_id,
    'DEPOSIT',
    v_deposit.provider_ref,
    jsonb_build_object(
      'amount', v_deposit.amount,
      'currency', p_currency,
      'idempotency_key', p_idempotency_key,
      'new_balance', v_offender.balance + v_deposit.amount
    )
  );

  RETURN jsonb_build_object(
    'processed', true,
    'alreadyProcessed', false,
    'status', 'SUCCEEDED',
    'newBalance', v_offender.balance + v_deposit.amount,
    'message', 'Trust funds successfully credited to inmate account.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Backward Compatibility Wrapper for process_confirmed_touchpay_deposit
DROP FUNCTION IF EXISTS public.process_confirmed_touchpay_deposit(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.process_confirmed_touchpay_deposit(
  p_provider_ref TEXT,
  p_idempotency_key TEXT,
  p_verified_amount NUMERIC(10, 2),
  p_currency TEXT DEFAULT 'USD'
)
RETURNS JSONB AS $$
BEGIN
  RETURN public.process_confirmed_electronic_deposit(
    p_provider_ref,
    p_idempotency_key,
    p_verified_amount,
    p_currency,
    'TOUCHPAY'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Explicit Least-Privilege Execution Grants
-- Revoke all execute privileges from untrusted roles
REVOKE EXECUTE ON FUNCTION public.process_confirmed_electronic_deposit(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_direct_balance_tampering() FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to authorized service_role
GRANT EXECUTE ON FUNCTION public.process_confirmed_electronic_deposit(TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_direct_balance_tampering() TO postgres, service_role;

COMMIT;
