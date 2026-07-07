-- ============================================================
-- 021_admin_resolve_market_options.sql
-- Admin console parity for multi-outcome resolution.
--
-- Migration 011 gave admins a capability-checked, audited wrapper
-- (admin_resolve_market) around the binary resolve_market. Migration 020
-- added the multi-outcome engine (resolve_market_options) but no admin-facing
-- wrapper, so the admin console could not settle multiple_choice markets.
--
-- This migration adds admin_resolve_market_options, mirroring admin_resolve_market
-- exactly (same capability gate, same notes requirement, same audit shape) but
-- delegating to resolve_market_options. Purely ADDITIVE + idempotent.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_resolve_market_options(
  p_market_id         UUID,
  p_winning_option_id UUID,
  p_notes             TEXT
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

  -- resolve_market_options performs the market state change + atomic payouts to
  -- holders of the winning option (mirrors resolve_market payout math).
  v_result := public.resolve_market_options(p_market_id, p_winning_option_id, auth.uid(), p_notes);

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'market.resolve', 'market', p_market_id,
    jsonb_build_object('winning_option_id', p_winning_option_id, 'notes', p_notes, 'result', v_result)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_market_options(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_market_options(UUID, UUID, TEXT) TO authenticated;

COMMIT;
