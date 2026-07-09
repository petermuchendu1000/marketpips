-- 025_fix_resolve_market_enum_cast.sql
-- ---------------------------------------------------------------------------
-- FIX: resolve_market() could never settle a binary market.
--
-- The winners/losers loops compared positions.side (enum `position_side`) to
-- p_outcome (enum `order_side`). Postgres has no equality operator across two
-- distinct enum types, so the query failed to PLAN ("operator does not exist:
-- position_side = order_side") for EVERY binary resolution -- including the
-- admin path (admin_resolve_market delegates here). The two enums carry
-- identical labels ('yes','no'), so the fix casts p_outcome through text to
-- position_side for the comparison. Behaviour is otherwise byte-for-byte the
-- original function; also hardens it with an explicit search_path.
--
-- Surfaced while wiring the recurring BTC engine (024), whose auto-resolution
-- pays out through this same audited RPC.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_market(p_market_id uuid, p_outcome order_side, p_resolver_id uuid, p_resolution_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_market public.markets%ROWTYPE;
  v_position RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_payout_usd DECIMAL;
  v_payout_local DECIMAL;
  v_exchange_rate DECIMAL;
  v_total_paid_out DECIMAL := 0;
  v_winners INTEGER := 0;
  v_losers INTEGER := 0;
BEGIN
  -- Lock and fetch market
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_market.status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Market cannot be resolved in status: %', v_market.status USING ERRCODE = 'P0002';
  END IF;

  -- Mark market resolved
  UPDATE public.markets SET
    status = 'resolved',
    resolved_outcome = p_outcome,
    resolved_at = NOW(),
    resolver_id = p_resolver_id,
    resolution_notes = p_resolution_notes
  WHERE id = p_market_id;

  -- Process all winning positions
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p
    JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id
    AND p.is_active = TRUE
    AND p.side = p_outcome::text::position_side
  LOOP
    -- Payout = shares * $1 (binary outcome)
    v_payout_usd := v_position.shares;

    -- Get exchange rate
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    v_payout_local := v_payout_usd / v_exchange_rate;

    -- Credit wallet (move from reserved to available + add winnings)
    UPDATE public.wallets SET
      available_balance = available_balance + v_payout_local
        + (v_position.total_invested_usd / v_exchange_rate), -- return initial bet too (reserved)
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_won = total_won + v_payout_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    -- Update position
    UPDATE public.positions SET
      is_active = FALSE,
      realized_pnl_usd = v_payout_usd - v_position.total_invested_usd,
      total_payout_usd = v_payout_usd + v_position.total_invested_usd,
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_position.id;

    -- Transaction record
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after,
      market_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_won', 'completed',
      v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      v_position.currency, v_payout_usd + v_position.total_invested_usd, v_exchange_rate,
      v_position.available_balance,
      v_position.available_balance + v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      p_market_id,
      FORMAT('Won: %s - %s', v_market.title, UPPER(p_outcome::TEXT)),
      FORMAT('win_%s_%s', p_market_id, v_position.user_id)
    );

    -- Notification
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_won',
      '🎉 You Won!',
      FORMAT('Your %s prediction on "%s" was correct! +%s USD', UPPER(p_outcome::TEXT), v_market.title, ROUND(v_payout_usd, 2)),
      jsonb_build_object('market_id', p_market_id, 'payout_usd', v_payout_usd)
    );

    v_total_paid_out := v_total_paid_out + v_payout_usd;
    v_winners := v_winners + 1;
  END LOOP;

  -- Mark losing positions
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p
    JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id
    AND p.is_active = TRUE
    AND p.side <> p_outcome::text::position_side
  LOOP
    -- Get exchange rate for reserved balance release
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    -- Release reserved balance (already deducted when bet placed)
    UPDATE public.wallets SET
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_lost = total_lost + v_position.total_invested_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    -- Update position
    UPDATE public.positions SET
      is_active = FALSE,
      realized_pnl_usd = -v_position.total_invested_usd,
      total_payout_usd = 0,
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_position.id;

    -- Transaction record
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after,
      market_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_lost', 'completed',
      0, v_position.currency, 0, v_exchange_rate,
      v_position.available_balance, v_position.available_balance,
      p_market_id,
      FORMAT('Lost: %s', v_market.title),
      FORMAT('lose_%s_%s', p_market_id, v_position.user_id)
    );

    -- Notification
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_lost',
      '📉 Prediction Incorrect',
      FORMAT('Your %s prediction on "%s" did not win this time.',
        CASE WHEN v_position.side = 'yes' THEN 'YES' ELSE 'NO' END, v_market.title),
      jsonb_build_object('market_id', p_market_id)
    );

    v_losers := v_losers + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'market_id', p_market_id,
    'outcome', p_outcome,
    'winners', v_winners,
    'losers', v_losers,
    'total_paid_out_usd', v_total_paid_out
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$

