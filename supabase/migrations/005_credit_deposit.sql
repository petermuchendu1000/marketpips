-- ============================================================
-- Migration 005 — Module 6: Payments (deposits)
-- Atomic, idempotent deposit→wallet credit.
--
-- Problem this fixes (the old webhooks did deposit-update + wallet-update +
-- transaction-insert + notification as SEPARATE admin calls):
--   1. Not atomic — a partial failure could credit the wallet with no
--      matching transaction row (or vice-versa).
--   2. Racy idempotency — two concurrent provider callbacks both read
--      status='processing' and BOTH credit the wallet (double credit).
--   3. Bugs — M-Pesa set total_deposited = balance + amount (wrong, it
--      should INCREMENT); MTN never updated total_deposited at all.
--
-- credit_deposit() does it all in ONE transaction with row locks:
--   • FOR UPDATE on the deposit row  → concurrent callbacks serialize here.
--   • status='completed' short-circuit → second caller is a no-op.
--   • FOR UPDATE on the wallet, then INCREMENT available_balance &
--     total_deposited.
--   • Inserts the transaction with before/after balances + idempotency_key.
--   • UNIQUE(idempotency_key) on transactions is a defense-in-depth backstop:
--     unique_violation is caught → returns already_processed (no double credit).
--   • Inserts the in-app notification.
--
-- fail_deposit() flips a non-completed deposit to 'failed' (never clobbers an
-- already-credited deposit).
--
-- Idempotent migration: CREATE OR REPLACE. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.credit_deposit(
  p_deposit_id uuid,
  p_amount_usd numeric,
  p_exchange_rate numeric,
  p_provider_receipt text DEFAULT NULL::text,
  p_raw_callback jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deposit    public.deposits%ROWTYPE;
  v_wallet     public.wallets%ROWTYPE;
  v_bal_before numeric;
  v_bal_after  numeric;
  v_txn_id     uuid;
  v_idem       text;
BEGIN
  -- 1. Lock the deposit row: concurrent callbacks for the same deposit queue here.
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found' USING ERRCODE = 'P0010';
  END IF;

  -- 2. Idempotency: already credited → no-op.
  IF v_deposit.status = 'completed' THEN
    RETURN jsonb_build_object(
      'credited', false, 'already_processed', true,
      'deposit_id', p_deposit_id, 'status', 'completed'
    );
  END IF;

  -- 3. Lock the wallet and credit it.
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_deposit.wallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for deposit' USING ERRCODE = 'P0011';
  END IF;

  v_idem       := COALESCE(p_idempotency_key, 'deposit_' || p_deposit_id::text);
  v_bal_before := v_wallet.available_balance;
  v_bal_after  := v_bal_before + v_deposit.amount;

  UPDATE public.deposits SET
    status               = 'completed',
    confirmed_at         = now(),
    provider_receipt     = COALESCE(p_provider_receipt, provider_receipt),
    exchange_rate_to_usd = COALESCE(p_exchange_rate, exchange_rate_to_usd),
    raw_callback         = p_raw_callback,
    updated_at           = now()
  WHERE id = p_deposit_id;

  UPDATE public.wallets SET
    available_balance = available_balance + v_deposit.amount,
    total_deposited   = total_deposited   + v_deposit.amount,  -- correct increment
    updated_at        = now()
  WHERE id = v_deposit.wallet_id;

  INSERT INTO public.transactions (
    user_id, wallet_id, type, status, amount, currency, amount_usd,
    exchange_rate_to_usd, balance_before, balance_after, payment_reference,
    payment_provider, payment_phone, payment_metadata, description,
    idempotency_key, initiated_at, completed_at
  ) VALUES (
    v_deposit.user_id, v_deposit.wallet_id, 'deposit', 'completed',
    v_deposit.amount, v_deposit.currency, p_amount_usd, p_exchange_rate,
    v_bal_before, v_bal_after, p_provider_receipt, v_deposit.provider,
    v_deposit.phone_number, p_raw_callback,
    'Deposit via ' || v_deposit.provider::text,
    v_idem, now(), now()
  )
  RETURNING id INTO v_txn_id;

  UPDATE public.deposits SET transaction_id = v_txn_id WHERE id = p_deposit_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_deposit.user_id, 'deposit_completed', 'Deposit Confirmed',
    v_deposit.amount::text || ' ' || v_deposit.currency::text || ' has been added to your account.',
    jsonb_build_object(
      'amount', v_deposit.amount, 'currency', v_deposit.currency,
      'deposit_id', p_deposit_id, 'receipt', p_provider_receipt
    )
  );

  RETURN jsonb_build_object(
    'credited', true, 'already_processed', false,
    'deposit_id', p_deposit_id, 'transaction_id', v_txn_id,
    'amount', v_deposit.amount, 'currency', v_deposit.currency,
    'balance_before', v_bal_before, 'balance_after', v_bal_after
  );

EXCEPTION
  -- Defense-in-depth: a duplicate idempotency_key means another path already
  -- recorded this credit. The whole block rolls back → no double credit.
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'credited', false, 'already_processed', true,
      'deposit_id', p_deposit_id, 'status', 'completed',
      'note', 'idempotency_key conflict'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_deposit(
  p_deposit_id uuid,
  p_reason text,
  p_raw_callback jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status transaction_status;
BEGIN
  SELECT status INTO v_status FROM public.deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found' USING ERRCODE = 'P0010';
  END IF;

  -- Never mark a completed (already-credited) deposit as failed.
  IF v_status = 'completed' THEN
    RETURN jsonb_build_object('failed', false, 'already_processed', true);
  END IF;

  UPDATE public.deposits SET
    status         = 'failed',
    failed_at      = now(),
    failure_reason = p_reason,
    raw_callback   = p_raw_callback,
    updated_at     = now()
  WHERE id = p_deposit_id;

  RETURN jsonb_build_object('failed', true, 'deposit_id', p_deposit_id);
END;
$function$;

-- These are privileged money-movement RPCs. Only the service role (used by the
-- server-side webhook handlers) may call them — never anon/authenticated.
REVOKE ALL ON FUNCTION public.credit_deposit(uuid, numeric, numeric, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_deposit(uuid, numeric, numeric, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.fail_deposit(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_deposit(uuid, text, jsonb) TO service_role;
