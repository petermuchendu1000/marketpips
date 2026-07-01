-- ============================================================
-- Migration 006 — Module 7: Payments (withdrawals)
-- Atomic, idempotent reserve → complete/fail lifecycle for payouts.
--
-- Problem this fixes (the old withdraw route did the balance check, the
-- reserve, the withdrawal insert and the wallet debit as SEPARATE anon-client
-- calls, then marked the withdrawal `completed` synchronously):
--   1. TOCTOU race — two concurrent withdrawals both read the same
--      available_balance, both pass the check, and BOTH reserve → overdraw.
--   2. Stale-snapshot writes — completion recomputed the balance from a value
--      read before the reserve, so a concurrent deposit/bet could be clobbered.
--   3. No refund path — if the provider disbursement failed the funds stayed
--      reserved forever (stuck money, no way back to available).
--   4. Synchronous completion — B2C/disbursement results are ASYNC (they arrive
--      on a result webhook), so marking `completed` inline was simply wrong.
--
-- Three SECURITY DEFINER RPCs, mirroring the M5 place_bet / M6 credit_deposit
-- pattern (row locks + status short-circuit + one transaction):
--
--   request_withdrawal()  — locks the wallet FOR UPDATE, so the balance check
--     and the reserve are atomic (no overdraw). Moves `amount` from
--     available_balance → reserved_balance, inserts the withdrawal (status
--     'processing', or 'pending' when it needs admin review) + the pending
--     transaction with before/after balances, and links them. Raises P0006 on
--     insufficient funds so the route can return a clean 400.
--
--   complete_withdrawal() — idempotent. First caller releases the reserve
--     (reserved_balance -= amount) and tallies total_withdrawn; available was
--     already debited at reserve time so the payout leaves the wallet exactly
--     once. Flips withdrawal + transaction to 'completed' and notifies the
--     user. Second caller (duplicate result webhook) is a no-op. Refuses to
--     complete a withdrawal that was already failed/refunded (P0013).
--
--   fail_withdrawal() — idempotent refund. Moves the reserved funds back to
--     available_balance, flips withdrawal + transaction to 'failed', notifies
--     the user. Never refunds an already-completed payout and never
--     double-refunds an already-failed one.
--
-- NOTE: withdrawals.net_amount and transactions.net_amount are GENERATED
-- columns (amount - fee_amount) — they are intentionally NOT in the INSERTs.
--
-- Idempotent migration: CREATE OR REPLACE. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_amount_usd numeric,
  p_exchange_rate numeric,
  p_fee_amount numeric,
  p_provider payment_provider,
  p_phone text,
  p_requires_review boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet        public.wallets%ROWTYPE;
  v_withdrawal_id uuid;
  v_txn_id        uuid;
  v_net           numeric;
  v_status        transaction_status;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the wallet: the balance check + reserve below are now atomic, so two
  -- concurrent withdrawals can never both pass the check and overdraw.
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0011';
  END IF;
  IF NOT COALESCE(v_wallet.is_active, true) THEN
    RAISE EXCEPTION 'Wallet is inactive' USING ERRCODE = 'P0012';
  END IF;
  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'P0006';
  END IF;

  v_net    := p_amount - COALESCE(p_fee_amount, 0);
  v_status := CASE WHEN p_requires_review THEN 'pending' ELSE 'processing' END::transaction_status;

  UPDATE public.wallets SET
    available_balance = available_balance - p_amount,
    reserved_balance  = reserved_balance  + p_amount,
    updated_at        = now()
  WHERE id = p_wallet_id;

  INSERT INTO public.withdrawals (
    user_id, wallet_id, status, provider, amount, currency, phone_number,
    exchange_rate_to_usd, fee_amount, requires_review, initiated_at
  ) VALUES (
    p_user_id, p_wallet_id, v_status, p_provider, p_amount, v_wallet.currency, p_phone,
    p_exchange_rate, COALESCE(p_fee_amount, 0), p_requires_review, now()
  )
  RETURNING id INTO v_withdrawal_id;

  INSERT INTO public.transactions (
    user_id, wallet_id, type, status, amount, currency, amount_usd,
    exchange_rate_to_usd, fee_amount, fee_currency,
    balance_before, balance_after, payment_provider, payment_phone,
    description, idempotency_key, initiated_at
  ) VALUES (
    p_user_id, p_wallet_id, 'withdrawal', 'pending', p_amount, v_wallet.currency, p_amount_usd,
    p_exchange_rate, COALESCE(p_fee_amount, 0), v_wallet.currency,
    v_wallet.available_balance, v_wallet.available_balance - p_amount, p_provider, p_phone,
    'Withdrawal via ' || p_provider::text, 'withdraw_' || v_withdrawal_id::text, now()
  )
  RETURNING id INTO v_txn_id;

  UPDATE public.withdrawals SET transaction_id = v_txn_id WHERE id = v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'transaction_id', v_txn_id,
    'status', v_status,
    'amount', p_amount,
    'fee_amount', COALESCE(p_fee_amount, 0),
    'net_amount', v_net,
    'available_balance', v_wallet.available_balance - p_amount,
    'reserved_balance', v_wallet.reserved_balance + p_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  p_withdrawal_id uuid,
  p_provider_reference text DEFAULT NULL::text,
  p_provider_receipt text DEFAULT NULL::text,
  p_raw_response jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_w public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0010';
  END IF;

  IF v_w.status = 'completed' THEN
    RETURN jsonb_build_object('completed', false, 'already_processed', true, 'status', 'completed');
  END IF;
  IF v_w.status = 'failed' THEN
    RAISE EXCEPTION 'Cannot complete a failed (refunded) withdrawal' USING ERRCODE = 'P0013';
  END IF;

  -- Release the reserve and tally total_withdrawn. available_balance was
  -- already debited at reserve time → the payout leaves the wallet exactly once.
  UPDATE public.wallets SET
    reserved_balance = reserved_balance - v_w.amount,
    total_withdrawn  = total_withdrawn  + v_w.amount,
    updated_at       = now()
  WHERE id = v_w.wallet_id;

  UPDATE public.withdrawals SET
    status             = 'completed',
    provider_reference = COALESCE(p_provider_reference, provider_reference),
    provider_receipt   = COALESCE(p_provider_receipt, provider_receipt),
    raw_response       = p_raw_response,
    completed_at       = now(),
    updated_at         = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions SET
    status             = 'completed',
    completed_at       = now(),
    provider_reference = COALESCE(p_provider_reference, provider_reference),
    payment_reference  = COALESCE(p_provider_receipt, payment_reference),
    updated_at         = now()
  WHERE idempotency_key = 'withdraw_' || p_withdrawal_id::text;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_w.user_id, 'withdrawal_completed', 'Withdrawal Successful',
    v_w.net_amount::text || ' ' || v_w.currency::text || ' has been sent to ' || v_w.phone_number || '.',
    jsonb_build_object(
      'withdrawal_id', p_withdrawal_id, 'amount', v_w.amount,
      'net_amount', v_w.net_amount, 'currency', v_w.currency, 'receipt', p_provider_receipt
    )
  );

  RETURN jsonb_build_object('completed', true, 'already_processed', false, 'withdrawal_id', p_withdrawal_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_withdrawal(
  p_withdrawal_id uuid,
  p_reason text,
  p_raw_response jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_w public.withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'P0010';
  END IF;

  -- Never refund a completed payout, never double-refund a failed one.
  IF v_w.status = 'completed' THEN
    RETURN jsonb_build_object('failed', false, 'already_processed', true, 'note', 'already completed');
  END IF;
  IF v_w.status = 'failed' THEN
    RETURN jsonb_build_object('failed', false, 'already_processed', true);
  END IF;

  -- Refund: move the reserved funds back to available.
  UPDATE public.wallets SET
    reserved_balance  = reserved_balance  - v_w.amount,
    available_balance = available_balance + v_w.amount,
    updated_at        = now()
  WHERE id = v_w.wallet_id;

  UPDATE public.withdrawals SET
    status         = 'failed',
    failure_reason = p_reason,
    raw_response   = p_raw_response,
    failed_at      = now(),
    updated_at     = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.transactions SET
    status     = 'failed',
    failed_at  = now(),
    notes      = p_reason,
    updated_at = now()
  WHERE idempotency_key = 'withdraw_' || p_withdrawal_id::text;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_w.user_id, 'withdrawal_failed', 'Withdrawal Failed',
    'Your withdrawal of ' || v_w.amount::text || ' ' || v_w.currency::text ||
    ' could not be completed and has been refunded to your wallet.',
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_w.amount, 'currency', v_w.currency, 'reason', p_reason)
  );

  RETURN jsonb_build_object('failed', true, 'already_processed', false, 'withdrawal_id', p_withdrawal_id, 'refunded', v_w.amount);
END;
$function$;

-- Privileged money-movement RPCs. request_withdrawal is called by the
-- (service-role) withdraw route; complete/fail are called by the service-role
-- disbursement-result webhooks. Never anon/authenticated.
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, uuid, numeric, numeric, numeric, numeric, payment_provider, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, uuid, numeric, numeric, numeric, numeric, payment_provider, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.fail_withdrawal(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid, text, jsonb) TO service_role;
