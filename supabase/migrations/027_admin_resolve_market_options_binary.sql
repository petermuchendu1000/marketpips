-- ============================================================
-- 027_admin_resolve_market_options_binary.sql
-- Admin console parity for INDEPENDENT multi-outcome resolution (Phase C).
--
-- Migration 021 added admin_resolve_market_options (capability-checked, audited
-- wrapper around the SIMPLEX resolver resolve_market_options). Migration 023
-- added the independent per-candidate Yes/No engine, including the settlement
-- function resolve_market_options_binary -- but NO admin-facing wrapper, so the
-- admin console (and the app resolve routes that call the admin_* RPCs) had no
-- way to settle an 'independent' market. That left independent markets tradable
-- but UN-SETTLEABLE via the admin path, so No holders would never be paid.
--
-- This migration adds admin_resolve_market_options_binary, mirroring
-- admin_resolve_market_options EXACTLY (same capability gate, same >=10 char
-- notes requirement, same audit shape) but delegating to
-- resolve_market_options_binary. Purely ADDITIVE + idempotent. The application
-- layer selects this wrapper only when markets.options_pricing_mode =
-- 'independent'; simplex markets keep using admin_resolve_market_options.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_resolve_market_options_binary(
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

  -- resolve_market_options_binary performs the market state change + atomic
  -- payouts using the independent payoff: a position wins iff
  --   (option = winner AND side = 'yes') OR (option <> winner AND side = 'no')
  -- i.e. No holders of every LOSING candidate are paid (Polymarket-faithful).
  v_result := public.resolve_market_options_binary(p_market_id, p_winning_option_id, auth.uid(), p_notes);

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    auth.uid(), 'market.resolve', 'market', p_market_id,
    jsonb_build_object(
      'winning_option_id', p_winning_option_id,
      'notes', p_notes,
      'pricing_mode', 'independent',
      'result', v_result
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_market_options_binary(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_market_options_binary(UUID, UUID, TEXT) TO authenticated;

COMMIT;
