-- ============================================================
-- MarketPips - Migration 011: Admin markets & finance (Phase C)
-- ============================================================
-- Depends on 008 (roles), 009 (RBAC helpers/has_capability, superadmin
-- triggers), 010 (admin user RPC pattern), 004-006 (place_bet / credit_deposit
-- / withdrawals RPCs), 001 (resolve_market / cancel_market / schema).
--
-- Adds the DB layer behind /admin/markets and /admin/finance:
--   * a capability-gated read policy so market reviewers/resolvers can see
--     non-public (draft/pending/closed/disputed) markets via their own session,
--   * atomic, capability-checked, audited SECURITY DEFINER RPCs wrapping the
--     existing money/lifecycle primitives.
--
-- Every mutating operator action goes through a SECURITY DEFINER function that
--   1. enforces the capability itself (defence in depth vs. RLS/route guards),
--   2. reuses the already-audited atomic primitives where they exist
--      (resolve_market, cancel_market, complete_withdrawal, fail_withdrawal,
--      fail_deposit), and
--   3. writes an audit_log row with before/after + reason.
-- Callers invoke these from the operator's *user session* (auth.uid() present)
-- so has_capability() and the superadmin triggers evaluate correctly.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Market reviewers can read all markets (not just public/active)
-- ------------------------------------------------------------
-- The base schema only exposes `active` markets publicly and lets `is_admin()`
-- (admin/moderator/superadmin) manage all. Resolvers and any future
-- capability-holder need to read draft/pending/closed/disputed markets in the
-- console. Gate the read on the market capabilities so it tracks role_permissions.
DROP POLICY IF EXISTS "Market reviewers can read all markets" ON public.markets;
CREATE POLICY "Market reviewers can read all markets" ON public.markets
  FOR SELECT USING (
    public.has_capability('markets:approve')
    OR public.has_capability('markets:resolve')
    OR public.has_capability('markets:cancel')
  );

-- ------------------------------------------------------------
-- 2. Market lifecycle RPCs
-- ------------------------------------------------------------

-- 2a. Approve: draft/pending -> active.
CREATE OR REPLACE FUNCTION public.admin_approve_market(
  p_market_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
BEGIN
  IF NOT public.has_capability('markets:approve') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:approve required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_market.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Only draft or pending markets can be approved (current: %)', v_market.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.markets
     SET status = 'active',
         opens_at = COALESCE(opens_at, NOW()),
         updated_at = NOW()
   WHERE id = p_market_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'market.approve', 'market', p_market_id,
    jsonb_build_object('status', v_market.status),
    jsonb_build_object('status', 'active', 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', TRUE, 'market_id', p_market_id, 'status', 'active');
END;
$$;

-- 2b. Reject: draft/pending -> cancelled (no trades exist yet, so no refunds).
CREATE OR REPLACE FUNCTION public.admin_reject_market(
  p_market_id UUID,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
BEGIN
  IF NOT public.has_capability('markets:approve') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:approve required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_market.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Only draft or pending markets can be rejected (current: %)', v_market.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.markets
     SET status = 'cancelled',
         resolution_notes = 'Rejected: ' || p_reason,
         updated_at = NOW()
   WHERE id = p_market_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'market.reject', 'market', p_market_id,
    jsonb_build_object('status', v_market.status),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', TRUE, 'market_id', p_market_id, 'status', 'cancelled');
END;
$$;

-- 2c. Close early: active -> closed (stops trading, awaits resolution).
CREATE OR REPLACE FUNCTION public.admin_close_market(
  p_market_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
BEGIN
  IF NOT public.has_capability('markets:approve') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:approve required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_market.status <> 'active' THEN
    RAISE EXCEPTION 'Only active markets can be closed (current: %)', v_market.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.markets SET status = 'closed', updated_at = NOW() WHERE id = p_market_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'market.close', 'market', p_market_id,
    jsonb_build_object('status', v_market.status),
    jsonb_build_object('status', 'closed', 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', TRUE, 'market_id', p_market_id, 'status', 'closed');
END;
$$;

-- 2d. Dispute: active/closed -> disputed.
CREATE OR REPLACE FUNCTION public.admin_dispute_market(
  p_market_id UUID,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
BEGIN
  IF NOT (public.has_capability('markets:resolve') OR public.has_capability('markets:cancel')) THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:resolve or markets:cancel required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A dispute reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_market.status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Only active or closed markets can be disputed (current: %)', v_market.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.markets
     SET status = 'disputed',
         resolution_notes = COALESCE(resolution_notes || E'\n', '') || 'Disputed: ' || p_reason,
         updated_at = NOW()
   WHERE id = p_market_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'market.dispute', 'market', p_market_id,
    jsonb_build_object('status', v_market.status),
    jsonb_build_object('status', 'disputed', 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', TRUE, 'market_id', p_market_id, 'status', 'disputed');
END;
$$;

-- 2e. Feature / trend toggles + ordering.
CREATE OR REPLACE FUNCTION public.admin_set_market_featured(
  p_market_id     UUID,
  p_is_featured   BOOLEAN,
  p_is_trending   BOOLEAN,
  p_featured_order INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
BEGIN
  IF NOT public.has_capability('markets:approve') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:approve required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.markets
     SET is_featured = p_is_featured,
         is_trending = p_is_trending,
         featured_order = CASE WHEN p_is_featured THEN p_featured_order ELSE NULL END,
         updated_at = NOW()
   WHERE id = p_market_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'market.feature', 'market', p_market_id,
    jsonb_build_object('is_featured', v_market.is_featured, 'is_trending', v_market.is_trending, 'featured_order', v_market.featured_order),
    jsonb_build_object('is_featured', p_is_featured, 'is_trending', p_is_trending, 'featured_order', p_featured_order)
  );

  RETURN jsonb_build_object('success', TRUE, 'market_id', p_market_id);
END;
$$;

-- 2f. Resolve: wraps the atomic resolve_market (which pays out winners).
CREATE OR REPLACE FUNCTION public.admin_resolve_market(
  p_market_id UUID,
  p_outcome   order_side,
  p_notes     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_capability('markets:resolve') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:resolve required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) < 10 THEN
    RAISE EXCEPTION 'Resolution notes (>= 10 chars) are required' USING ERRCODE = 'check_violation';
  END IF;

  -- resolve_market performs the market state change + atomic payouts.
  v_result := public.resolve_market(p_market_id, p_outcome, auth.uid(), p_notes);

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'market.resolve', 'market', p_market_id,
    jsonb_build_object('outcome', p_outcome, 'notes', p_notes, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- 2g. Cancel: wraps the atomic cancel_market (which refunds all bets).
CREATE OR REPLACE FUNCTION public.admin_cancel_market(
  p_market_id UUID,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_capability('markets:cancel') THEN
    RAISE EXCEPTION 'Insufficient permissions (markets:cancel required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = 'check_violation';
  END IF;

  v_result := public.cancel_market(p_market_id, p_reason);

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'market.cancel', 'market', p_market_id,
    jsonb_build_object('reason', p_reason, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 3. Finance RPCs
-- ------------------------------------------------------------

-- 3a. Approve a withdrawal for disbursement (clears the review hold).
--     Leaves the reserve in place; the disbursement + provider webhook finalize.
CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(
  p_withdrawal_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w public.withdrawals%ROWTYPE;
BEGIN
  IF NOT public.has_capability('finance:withdrawals') THEN
    RAISE EXCEPTION 'Insufficient permissions (finance:withdrawals required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_w.status IN ('completed', 'failed', 'refunded') THEN
    RAISE EXCEPTION 'Withdrawal is already terminal (%)', v_w.status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.withdrawals
     SET requires_review = FALSE,
         reviewed_by = auth.uid(),
         reviewed_at = NOW(),
         review_notes = p_notes,
         updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'withdrawal.approve', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('requires_review', v_w.requires_review, 'status', v_w.status),
    jsonb_build_object('requires_review', FALSE, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', TRUE, 'withdrawal_id', p_withdrawal_id, 'reviewed', TRUE);
END;
$$;

-- 3b. Reject a withdrawal -> atomic refund via fail_withdrawal + mark reviewed.
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(
  p_withdrawal_id UUID,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w public.withdrawals%ROWTYPE;
  v_result JSONB;
BEGIN
  IF NOT public.has_capability('finance:withdrawals') THEN
    RAISE EXCEPTION 'Insufficient permissions (finance:withdrawals required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = 'check_violation';
  END IF;

  -- fail_withdrawal is atomic + idempotent + refunds reserved -> available.
  v_result := public.fail_withdrawal(p_withdrawal_id, p_reason, jsonb_build_object('rejected_by_admin', TRUE));

  UPDATE public.withdrawals
     SET reviewed_by = auth.uid(), reviewed_at = NOW(), review_notes = p_reason, updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'withdrawal.reject', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('reason', p_reason, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- 3c. Manually complete a withdrawal (reconcile a confirmed-but-stuck payout).
CREATE OR REPLACE FUNCTION public.admin_complete_withdrawal(
  p_withdrawal_id     UUID,
  p_provider_reference TEXT DEFAULT NULL,
  p_provider_receipt   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_capability('finance:withdrawals') THEN
    RAISE EXCEPTION 'Insufficient permissions (finance:withdrawals required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_result := public.complete_withdrawal(
    p_withdrawal_id, p_provider_reference, p_provider_receipt,
    jsonb_build_object('completed_by_admin', TRUE)
  );

  UPDATE public.withdrawals
     SET reviewed_by = COALESCE(reviewed_by, auth.uid()), updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'withdrawal.complete_manual', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('provider_reference', p_provider_reference, 'provider_receipt', p_provider_receipt, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- 3d. Retry a FAILED withdrawal: re-reserve funds on the same row (atomic,
--     balance-checked) and set it back to 'processing' for re-disbursement.
--     Funds were refunded available on the original failure, so this simply
--     re-reserves them exactly like request_withdrawal does.
CREATE OR REPLACE FUNCTION public.admin_retry_withdrawal(
  p_withdrawal_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w public.withdrawals%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF NOT public.has_capability('finance:withdrawals') THEN
    RAISE EXCEPTION 'Insufficient permissions (finance:withdrawals required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_w.status <> 'failed' THEN
    RAISE EXCEPTION 'Only failed withdrawals can be retried (current: %)', v_w.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-reserve the funds atomically.
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_w.wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_wallet.available_balance < v_w.amount THEN
    RAISE EXCEPTION 'Insufficient available balance to retry withdrawal'
      USING ERRCODE = 'P0006';
  END IF;

  UPDATE public.wallets
     SET available_balance = available_balance - v_w.amount,
         reserved_balance  = reserved_balance + v_w.amount,
         updated_at = NOW()
   WHERE id = v_w.wallet_id;

  UPDATE public.withdrawals
     SET status = 'processing',
         failed_at = NULL,
         failure_reason = NULL,
         reviewed_by = auth.uid(),
         reviewed_at = NOW(),
         updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'withdrawal.retry', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_w.status),
    jsonb_build_object('status', 'processing', 're_reserved', v_w.amount)
  );

  RETURN jsonb_build_object('success', TRUE, 'withdrawal_id', p_withdrawal_id, 'status', 'processing');
END;
$$;

-- 3e. Fail/cancel a stuck deposit (safe: no money moves; wraps fail_deposit).
CREATE OR REPLACE FUNCTION public.admin_fail_deposit(
  p_deposit_id UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_capability('finance:deposits') THEN
    RAISE EXCEPTION 'Insufficient permissions (finance:deposits required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = 'check_violation';
  END IF;

  v_result := public.fail_deposit(p_deposit_id, p_reason, jsonb_build_object('failed_by_admin', TRUE));

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'deposit.fail_manual', 'deposit', p_deposit_id,
    jsonb_build_object('reason', p_reason, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 4. Notes
-- ------------------------------------------------------------
-- * Reads in the console use the operator's session (RLS): markets via the
--   policy above; deposits/withdrawals/transactions via the staff-read policies
--   from migration 009; profiles are publicly viewable.
-- * These RPCs are SECURITY DEFINER and self-check capabilities, so they are
--   safe to expose to `authenticated` (Supabase default EXECUTE grant), exactly
--   like the migration 010 admin_* functions.
