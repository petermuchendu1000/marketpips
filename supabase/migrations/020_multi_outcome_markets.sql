-- ============================================================
-- 020_multi_outcome_markets.sql
-- Module 3.x — evolve the market engine from binary (YES/NO) to true
-- multi-outcome (N mutually-exclusive options) WITHOUT breaking binary.
--
-- Strategy: purely ADDITIVE. New nullable columns, new functions, new
-- indexes. Binary markets, positions and the existing place_bet /
-- resolve_market / cancel_market RPCs are left completely intact.
--
-- ⚠ REVIEW + STAGING TEST REQUIRED before production apply. Run inside a
-- maintenance window; take a backup first. Rollback = keep schema, gate the
-- feature off (see docs/design/MULTI-OUTCOME-MARKETS.md).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Schema — additive columns (idempotent)
-- ------------------------------------------------------------

-- Winning option for multiple_choice markets (binary keeps resolved_outcome).
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS resolved_option_id UUID REFERENCES public.market_options(id);

-- market_options gains LMSR inventory + reconciliation columns.
ALTER TABLE public.market_options
  ADD COLUMN IF NOT EXISTS q_shares          DECIMAL(20,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_invested_usd DECIMAL(20,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- Bounded, valid probability on every option.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_options_price_bounds'
  ) THEN
    ALTER TABLE public.market_options
      ADD CONSTRAINT market_options_price_bounds CHECK (price >= 0 AND price <= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS market_options_market_order_uidx
  ON public.market_options(market_id, display_order);

-- Option linkage on the transactional tables (nullable; binary rows stay NULL).
ALTER TABLE public.positions      ADD COLUMN IF NOT EXISTS market_option_id UUID REFERENCES public.market_options(id);
ALTER TABLE public.orders         ADD COLUMN IF NOT EXISTS market_option_id UUID REFERENCES public.market_options(id);
ALTER TABLE public.transactions   ADD COLUMN IF NOT EXISTS market_option_id UUID REFERENCES public.market_options(id);
ALTER TABLE public.market_activity ADD COLUMN IF NOT EXISTS market_option_id UUID REFERENCES public.market_options(id);
ALTER TABLE public.price_history  ADD COLUMN IF NOT EXISTS market_option_id UUID REFERENCES public.market_options(id);
ALTER TABLE public.price_history  ADD COLUMN IF NOT EXISTS price DECIMAL(8,6);

-- Relax NOT NULL on side / yes/no price so option-based rows can omit them.
ALTER TABLE public.positions     ALTER COLUMN side DROP NOT NULL;
ALTER TABLE public.orders        ALTER COLUMN side DROP NOT NULL;
ALTER TABLE public.price_history ALTER COLUMN yes_price DROP NOT NULL;
ALTER TABLE public.price_history ALTER COLUMN no_price  DROP NOT NULL;

-- One active position per (user, market, option).
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_market_option_uidx
  ON public.positions(user_id, market_id, market_option_id)
  WHERE market_option_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_positions_option ON public.positions(market_option_id);
CREATE INDEX IF NOT EXISTS idx_price_history_option_time ON public.price_history(market_option_id, recorded_at DESC);

-- ------------------------------------------------------------
-- 2. Generalized multi-outcome LMSR pricing (stabilized softmax)
--    price_i = exp((q_i - qmax)/b) / Σ_j exp((q_j - qmax)/b), Σ price = 1
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lmsr_price_multi(q DECIMAL[], b DECIMAL)
RETURNS DECIMAL[] AS $$
DECLARE
  n INT := array_length(q, 1);
  qmax DECIMAL;
  s DECIMAL := 0;
  e DECIMAL[];
  r DECIMAL[];
  i INT;
  bb DECIMAL := GREATEST(b, 1);  -- guard against divide-by-zero / tiny b
BEGIN
  IF n IS NULL OR n = 0 THEN
    RETURN ARRAY[]::DECIMAL[];
  END IF;
  SELECT MAX(v) INTO qmax FROM unnest(q) AS v;
  e := ARRAY[]::DECIMAL[];
  FOR i IN 1..n LOOP
    e := array_append(e, EXP((q[i] - qmax) / bb));
    s := s + e[i];
  END LOOP;
  r := ARRAY[]::DECIMAL[];
  FOR i IN 1..n LOOP
    r := array_append(r, ROUND(e[i] / s, 6));
  END LOOP;
  RETURN r;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------------------------------------
-- 3. place_bet_option — atomic bet on ONE option of a multi-outcome market.
--    Mirrors place_bet's guardrails / wallet / fee / accounting.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_bet_option(
  p_user_id UUID,
  p_market_id UUID,
  p_option_id UUID,
  p_amount_local DECIMAL,
  p_currency currency_code,
  p_client_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_option public.market_options%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_exchange_rate DECIMAL;
  v_amount_usd DECIMAL;
  v_fee_usd DECIMAL;
  v_net_usd DECIMAL;
  v_price_before DECIMAL;
  v_shares DECIMAL;
  v_lmsr_b DECIMAL;
  v_ids UUID[];
  v_q DECIMAL[];
  v_prices DECIMAL[];
  v_new_price DECIMAL;
  v_order_id UUID;
  v_transaction_id UUID;
  i INT;
BEGIN
  -- Lock market
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found or not active' USING ERRCODE = 'P0001'; END IF;
  IF v_market.closes_at < NOW() THEN RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE = 'P0002'; END IF;

  -- Lock the chosen option, ensure it belongs to this market
  SELECT * INTO v_option FROM public.market_options
  WHERE id = p_option_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Option not found for market' USING ERRCODE = 'P0007'; END IF;
  v_price_before := GREATEST(v_option.price, 0.01);

  -- Exchange rate → USD
  SELECT rate INTO v_exchange_rate FROM public.exchange_rates
  WHERE from_currency = p_currency AND to_currency = 'USD';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE = 'P0003'; END IF;

  v_amount_usd := p_amount_local * v_exchange_rate;
  IF v_amount_usd < 0.10 THEN RAISE EXCEPTION 'Minimum bet is 0.10 USD equivalent' USING ERRCODE = 'P0004'; END IF;

  v_fee_usd := v_amount_usd * v_market.platform_fee_rate;
  v_net_usd := v_amount_usd - v_fee_usd;

  -- Lock wallet + balance check
  SELECT * INTO v_wallet FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0005'; END IF;
  IF v_wallet.available_balance < p_amount_local THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
      v_wallet.available_balance, p_amount_local USING ERRCODE = 'P0006';
  END IF;

  -- Shares from pre-trade price (consistent with binary place_bet)
  v_shares := v_net_usd / v_price_before;
  v_lmsr_b := GREATEST(v_market.liquidity_pool_usd / 2, 50);

  -- Bump the chosen option's inventory, then reprice ALL options via multi-LMSR
  UPDATE public.market_options
    SET q_shares = q_shares + v_net_usd,
        total_invested_usd = total_invested_usd + v_net_usd,
        volume_usd = volume_usd + v_net_usd,
        updated_at = NOW()
  WHERE id = p_option_id;

  SELECT array_agg(id ORDER BY display_order, id),
         array_agg(q_shares ORDER BY display_order, id)
    INTO v_ids, v_q
  FROM public.market_options WHERE market_id = p_market_id;

  v_prices := public.lmsr_price_multi(v_q, v_lmsr_b);

  FOR i IN 1..array_length(v_ids, 1) LOOP
    UPDATE public.market_options SET price = v_prices[i], updated_at = NOW() WHERE id = v_ids[i];
    IF v_ids[i] = p_option_id THEN v_new_price := v_prices[i]; END IF;
  END LOOP;

  -- Deduct wallet (available → reserved)
  UPDATE public.wallets SET
    available_balance = available_balance - p_amount_local,
    reserved_balance = reserved_balance + p_amount_local,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Order (side NULL — this is an option order)
  INSERT INTO public.orders (
    market_id, user_id, wallet_id, market_option_id,
    side, type, status,
    amount_usd, currency, amount_local, exchange_rate_to_usd,
    avg_fill_price, shares, potential_payout_usd,
    fee_usd, fee_local, filled_usd, client_order_id
  ) VALUES (
    p_market_id, p_user_id, v_wallet.id, p_option_id,
    NULL, 'market', 'filled',
    v_amount_usd, p_currency, p_amount_local, v_exchange_rate,
    v_price_before, v_shares, v_shares,
    v_fee_usd, v_fee_usd / v_exchange_rate, v_amount_usd, p_client_order_id
  ) RETURNING id INTO v_order_id;

  -- Position keyed by option
  INSERT INTO public.positions (
    user_id, market_id, wallet_id, market_option_id,
    side, shares, total_invested_usd, avg_entry_price, current_value_usd
  ) VALUES (
    p_user_id, p_market_id, v_wallet.id, p_option_id,
    NULL, v_shares, v_net_usd, v_price_before, v_shares * v_new_price
  )
  ON CONFLICT (user_id, market_id, market_option_id) WHERE market_option_id IS NOT NULL
  DO UPDATE SET
    shares = positions.shares + v_shares,
    total_invested_usd = positions.total_invested_usd + v_net_usd,
    avg_entry_price = (positions.total_invested_usd + v_net_usd) / (positions.shares + v_shares),
    current_value_usd = (positions.shares + v_shares) * v_new_price,
    is_active = TRUE,
    updated_at = NOW();

  -- Transaction
  INSERT INTO public.transactions (
    user_id, wallet_id, type, status,
    amount, currency, amount_usd, exchange_rate_to_usd,
    fee_amount, fee_currency, balance_before, balance_after,
    order_id, market_id, market_option_id, description, idempotency_key
  ) VALUES (
    p_user_id, v_wallet.id, 'bet_placed', 'completed',
    p_amount_local, p_currency, v_amount_usd, v_exchange_rate,
    v_fee_usd / v_exchange_rate, p_currency,
    v_wallet.available_balance, v_wallet.available_balance - p_amount_local,
    v_order_id, p_market_id, p_option_id,
    FORMAT('Bet on "%s": %s', v_market.title, v_option.label),
    COALESCE(p_client_order_id, gen_random_uuid()::TEXT)
  ) RETURNING id INTO v_transaction_id;

  -- Market stats + per-option price history
  UPDATE public.markets SET
    total_volume_usd = total_volume_usd + v_amount_usd,
    total_bets = total_bets + 1,
    updated_at = NOW()
  WHERE id = p_market_id;

  INSERT INTO public.price_history (market_id, market_option_id, price, volume_usd)
  VALUES (p_market_id, p_option_id, v_new_price, v_amount_usd);

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'transaction_id', v_transaction_id,
    'option_id', p_option_id,
    'shares', v_shares,
    'amount_usd', v_amount_usd,
    'fee_usd', v_fee_usd,
    'new_price', v_new_price,
    'potential_payout_usd', v_shares
  );
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. resolve_market_options — pay holders of the winning option.
--    Mirrors resolve_market payout math exactly (stake returned + shares×$1
--    to winners; reserved forfeited by losers).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_market_options(
  p_market_id UUID,
  p_winning_option_id UUID,
  p_resolver_id UUID,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_win public.market_options%ROWTYPE;
  v_position RECORD;
  v_exchange_rate DECIMAL;
  v_payout_usd DECIMAL;
  v_payout_local DECIMAL;
  v_total_paid_out DECIMAL := 0;
  v_winners INTEGER := 0;
  v_losers INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0001'; END IF;
  IF v_market.status NOT IN ('active', 'closed', 'disputed') THEN
    RAISE EXCEPTION 'Market cannot be resolved in status: %', v_market.status USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_win FROM public.market_options
  WHERE id = p_winning_option_id AND market_id = p_market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Winning option not found for market' USING ERRCODE = 'P0007'; END IF;

  -- Mark market + option winners
  UPDATE public.markets SET
    status = 'resolved', resolved_option_id = p_winning_option_id,
    resolved_at = NOW(), resolver_id = p_resolver_id, resolution_notes = p_resolution_notes
  WHERE id = p_market_id;

  UPDATE public.market_options
    SET is_winner = (id = p_winning_option_id), updated_at = NOW()
  WHERE market_id = p_market_id;

  -- Winners
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id AND p.is_active = TRUE
      AND p.market_option_id = p_winning_option_id
  LOOP
    v_payout_usd := v_position.shares;
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';
    v_payout_local := v_payout_usd / v_exchange_rate;

    UPDATE public.wallets SET
      available_balance = available_balance + v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_won = total_won + v_payout_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    UPDATE public.positions SET
      is_active = FALSE,
      realized_pnl_usd = v_payout_usd - v_position.total_invested_usd,
      total_payout_usd = v_payout_usd + v_position.total_invested_usd,
      claimed_at = NOW(), updated_at = NOW()
    WHERE id = v_position.id;

    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after, market_id, market_option_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_won', 'completed',
      v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      v_position.currency, v_payout_usd + v_position.total_invested_usd, v_exchange_rate,
      v_position.available_balance,
      v_position.available_balance + v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      p_market_id, p_winning_option_id,
      FORMAT('Won: %s - %s', v_market.title, v_win.label),
      FORMAT('win_%s_%s', p_market_id, v_position.user_id)
    );

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_won', '🎉 You Won!',
      FORMAT('Your pick "%s" on "%s" was correct! +%s USD', v_win.label, v_market.title, ROUND(v_payout_usd, 2)),
      jsonb_build_object('market_id', p_market_id, 'option_id', p_winning_option_id, 'payout_usd', v_payout_usd)
    );

    v_total_paid_out := v_total_paid_out + v_payout_usd;
    v_winners := v_winners + 1;
  END LOOP;

  -- Losers (any other option on this market)
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id AND p.is_active = TRUE
      AND p.market_option_id IS NOT NULL
      AND p.market_option_id <> p_winning_option_id
  LOOP
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    UPDATE public.wallets SET
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_lost = total_lost + v_position.total_invested_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    UPDATE public.positions SET
      is_active = FALSE, realized_pnl_usd = -v_position.total_invested_usd,
      total_payout_usd = 0, claimed_at = NOW(), updated_at = NOW()
    WHERE id = v_position.id;

    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after, market_id, market_option_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_lost', 'completed',
      0, v_position.currency, 0, v_exchange_rate,
      v_position.available_balance, v_position.available_balance,
      p_market_id, v_position.market_option_id,
      FORMAT('Lost: %s', v_market.title),
      FORMAT('lose_%s_%s', p_market_id, v_position.user_id)
    );

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_lost', '📉 Prediction Incorrect',
      FORMAT('Your pick on "%s" did not win this time.', v_market.title),
      jsonb_build_object('market_id', p_market_id)
    );

    v_losers := v_losers + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE, 'market_id', p_market_id, 'winning_option_id', p_winning_option_id,
    'winners', v_winners, 'losers', v_losers, 'total_paid_out_usd', v_total_paid_out
  );
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. seed_binary_options — OPTIONAL helper to materialize YES/NO option rows
--    for a binary market (for callers that want unified option storage).
--    Not run in bulk; safe to call idempotently per market.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_binary_options(p_market_id UUID)
RETURNS VOID AS $$
DECLARE v_m public.markets%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.markets WHERE id = p_market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_options WHERE market_id = p_market_id) THEN
    RETURN; -- already has options
  END IF;
  INSERT INTO public.market_options (market_id, label, price, volume_usd, display_order)
  VALUES
    (p_market_id, 'Yes', COALESCE(v_m.yes_price, 0.5), COALESCE(v_m.yes_volume_usd, 0), 0),
    (p_market_id, 'No',  COALESCE(v_m.no_price, 0.5),  COALESCE(v_m.no_volume_usd, 0),  1);
END;
$$ LANGUAGE plpgsql;

-- Execute grants consistent with existing RPCs (service_role / authenticated).
GRANT EXECUTE ON FUNCTION public.lmsr_price_multi(DECIMAL[], DECIMAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_bet_option(UUID, UUID, UUID, DECIMAL, currency_code, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_market_options(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_binary_options(UUID) TO service_role;

COMMIT;
