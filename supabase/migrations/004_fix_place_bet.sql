-- ============================================================
-- Migration 004 — Module 4: Trading (orders & positions)
-- Corrects place_bet():
--   1. Balance: a FILLED market bet now DEBITS available_balance only.
--      (Previously it also added the stake to reserved_balance and never
--      released it — funds were locked forever.)
--   2. Shares: true, slippage-aware LMSR allocation via a numerically-stable
--      closed-form inverse, instead of the constant-price `net_usd / price`.
--        q reconstructed from current prices (anchor q_no = 0):
--          shares_yes = net + b·ln( (1 − no_price·e^(−net/b)) / yes_price )
--        new price via exact ratio R = (yes/no)·e^(Δ/b)  (no EXP overflow).
--   3. Creator reward: pays creator_reward_rate (0.25%) out of the platform
--      fee, crediting the creator's USD wallet + a `creator_reward` txn.
--      Skipped when the bettor IS the creator (anti wash-trading).
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_bet(
  p_user_id uuid,
  p_market_id uuid,
  p_side order_side,
  p_amount_local numeric,
  p_currency currency_code,
  p_order_type order_type DEFAULT 'market'::order_type,
  p_limit_price numeric DEFAULT NULL::numeric,
  p_client_order_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_wallet            public.wallets%ROWTYPE;
  v_market            public.markets%ROWTYPE;
  v_exchange_rate     DECIMAL;
  v_amount_usd        DECIMAL;
  v_fee_usd           DECIMAL;
  v_creator_reward    DECIMAL;
  v_net_usd           DECIMAL;
  v_shares            DECIMAL;
  v_avg_price         DECIMAL;
  v_yes               DECIMAL;
  v_no                DECIMAL;
  v_new_yes_price     DECIMAL;
  v_new_no_price      DECIMAL;
  v_ratio             DECIMAL;
  v_lmsr_b            DECIMAL;
  v_order_id          UUID;
  v_transaction_id    UUID;
  v_bal_before        DECIMAL;
  v_creator_wallet_id UUID;
  v_creator_bal       DECIMAL;
BEGIN
  -- ---- Lock + validate market -------------------------------------------
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found or not active' USING ERRCODE = 'P0001';
  END IF;

  IF v_market.closes_at < NOW() THEN
    RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE = 'P0002';
  END IF;

  -- Limit orders require a price (matching engine not implemented; fill at market).
  IF p_order_type = 'limit' AND p_limit_price IS NULL THEN
    RAISE EXCEPTION 'Limit orders require a limit_price' USING ERRCODE = 'P0007';
  END IF;

  -- ---- FX ----------------------------------------------------------------
  SELECT rate INTO v_exchange_rate FROM public.exchange_rates
  WHERE from_currency = p_currency AND to_currency = 'USD';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE = 'P0003';
  END IF;

  v_amount_usd := p_amount_local * v_exchange_rate;
  IF v_amount_usd < 0.10 THEN
    RAISE EXCEPTION 'Minimum bet is 0.10 USD equivalent' USING ERRCODE = 'P0004';
  END IF;

  -- ---- Fees: platform fee (2%) with creator reward (0.25%) carved out ----
  v_fee_usd        := ROUND(v_amount_usd * COALESCE(v_market.platform_fee_rate, 0.02), 8);
  v_creator_reward := ROUND(v_amount_usd * COALESCE(v_market.creator_reward_rate, 0.0025), 8);
  -- creator reward cannot exceed the collected fee
  v_creator_reward := LEAST(v_creator_reward, v_fee_usd);
  v_net_usd        := v_amount_usd - v_fee_usd;

  -- ---- Lock wallet + balance check --------------------------------------
  SELECT * INTO v_wallet FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0005';
  END IF;

  IF v_wallet.available_balance < p_amount_local THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
      v_wallet.available_balance, p_amount_local USING ERRCODE = 'P0006';
  END IF;

  -- ---- LMSR: stable, slippage-aware share allocation --------------------
  v_lmsr_b := GREATEST(v_market.liquidity_pool_usd / 2, 50);
  v_yes := GREATEST(v_market.yes_price, 0.000001);
  v_no  := GREATEST(v_market.no_price,  0.000001);

  IF p_side = 'yes' THEN
    -- shares = net + b·ln( (1 − no·e^(−net/b)) / yes )
    v_shares := v_net_usd + v_lmsr_b * LN( (1 - v_no * EXP(-v_net_usd / v_lmsr_b)) / v_yes );
    -- new prices via exact ratio R = (yes/no)·e^(Δ/b)
    v_ratio := (v_yes / v_no) * EXP(v_shares / v_lmsr_b);
    v_new_yes_price := v_ratio / (1 + v_ratio);
    v_new_no_price  := 1 / (1 + v_ratio);
  ELSE
    v_shares := v_net_usd + v_lmsr_b * LN( (1 - v_yes * EXP(-v_net_usd / v_lmsr_b)) / v_no );
    v_ratio := (v_no / v_yes) * EXP(v_shares / v_lmsr_b);
    v_new_no_price  := v_ratio / (1 + v_ratio);
    v_new_yes_price := 1 / (1 + v_ratio);
  END IF;

  v_new_yes_price := ROUND(v_new_yes_price, 6);
  v_new_no_price  := ROUND(v_new_no_price, 6);

  IF v_shares IS NULL OR v_shares <= 0 THEN
    RAISE EXCEPTION 'Computed non-positive shares' USING ERRCODE = 'P0008';
  END IF;
  v_avg_price := v_net_usd / v_shares; -- effective fill price incl. slippage

  -- ---- Debit wallet (spend; do NOT reserve a filled bet) ----------------
  v_bal_before := v_wallet.available_balance;
  UPDATE public.wallets SET
    available_balance = available_balance - p_amount_local,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- ---- Order ------------------------------------------------------------
  INSERT INTO public.orders (
    market_id, user_id, wallet_id,
    side, type, status,
    amount_usd, currency, amount_local, exchange_rate_to_usd,
    limit_price, avg_fill_price,
    shares, potential_payout_usd,
    fee_usd, fee_local, filled_usd,
    client_order_id, metadata
  ) VALUES (
    p_market_id, p_user_id, v_wallet.id,
    p_side, p_order_type, 'filled',
    v_amount_usd, p_currency, p_amount_local, v_exchange_rate,
    p_limit_price, ROUND(v_avg_price, 6),
    v_shares, v_shares,
    v_fee_usd, v_fee_usd / v_exchange_rate, v_amount_usd,
    p_client_order_id,
    jsonb_build_object('creator_reward_usd', v_creator_reward, 'lmsr_b', v_lmsr_b)
  ) RETURNING id INTO v_order_id;

  -- ---- Position (aggregate per user/market/side) ------------------------
  INSERT INTO public.positions (
    user_id, market_id, wallet_id,
    side, shares, total_invested_usd, avg_entry_price, current_value_usd
  ) VALUES (
    p_user_id, p_market_id, v_wallet.id,
    p_side::text::position_side, v_shares, v_net_usd, ROUND(v_avg_price, 6),
    v_shares * CASE WHEN p_side = 'yes' THEN v_new_yes_price ELSE v_new_no_price END
  )
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    shares = public.positions.shares + v_shares,
    total_invested_usd = public.positions.total_invested_usd + v_net_usd,
    avg_entry_price = (public.positions.total_invested_usd + v_net_usd)
                      / NULLIF(public.positions.shares + v_shares, 0),
    current_value_usd = (public.positions.shares + v_shares)
                      * CASE WHEN p_side = 'yes' THEN v_new_yes_price ELSE v_new_no_price END,
    is_active = TRUE,
    updated_at = NOW();

  -- ---- Bet transaction --------------------------------------------------
  INSERT INTO public.transactions (
    user_id, wallet_id, type, status,
    amount, currency, amount_usd, exchange_rate_to_usd,
    fee_amount, fee_currency,
    balance_before, balance_after,
    order_id, market_id,
    description, idempotency_key
  ) VALUES (
    p_user_id, v_wallet.id, 'bet_placed', 'completed',
    p_amount_local, p_currency, v_amount_usd, v_exchange_rate,
    v_fee_usd / v_exchange_rate, p_currency,
    v_bal_before, v_bal_before - p_amount_local,
    v_order_id, p_market_id,
    FORMAT('Bet %s on market: %s', UPPER(p_side::TEXT), v_market.title),
    COALESCE(p_client_order_id, gen_random_uuid()::TEXT)
  ) RETURNING id INTO v_transaction_id;

  -- ---- Creator reward (USD) — skip self-bets (anti wash-trading) --------
  IF v_creator_reward > 0 AND v_market.creator_id IS DISTINCT FROM p_user_id THEN
    INSERT INTO public.wallets (user_id, currency)
    VALUES (v_market.creator_id, 'USD')
    ON CONFLICT (user_id, currency) DO NOTHING;

    SELECT id, available_balance INTO v_creator_wallet_id, v_creator_bal
    FROM public.wallets WHERE user_id = v_market.creator_id AND currency = 'USD'
    FOR UPDATE;

    UPDATE public.wallets SET
      available_balance = available_balance + v_creator_reward,
      total_won = total_won + v_creator_reward,
      updated_at = NOW()
    WHERE id = v_creator_wallet_id;

    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after,
      order_id, market_id,
      description, idempotency_key
    ) VALUES (
      v_market.creator_id, v_creator_wallet_id, 'creator_reward', 'completed',
      v_creator_reward, 'USD', v_creator_reward, 1,
      COALESCE(v_creator_bal, 0), COALESCE(v_creator_bal, 0) + v_creator_reward,
      v_order_id, p_market_id,
      FORMAT('Creator reward from bet on: %s', v_market.title),
      'creator_' || v_order_id::TEXT
    );
  END IF;

  -- ---- Market stats + price + history + activity ------------------------
  UPDATE public.markets SET
    total_volume_usd = total_volume_usd + v_amount_usd,
    yes_volume_usd = CASE WHEN p_side = 'yes' THEN yes_volume_usd + v_net_usd ELSE yes_volume_usd END,
    no_volume_usd  = CASE WHEN p_side = 'no'  THEN no_volume_usd  + v_net_usd ELSE no_volume_usd END,
    liquidity_pool_usd = liquidity_pool_usd + v_net_usd,
    total_bets = total_bets + 1,
    yes_price = v_new_yes_price,
    no_price = v_new_no_price,
    updated_at = NOW()
  WHERE id = p_market_id;

  INSERT INTO public.price_history (market_id, yes_price, no_price, volume_usd)
  VALUES (p_market_id, v_new_yes_price, v_new_no_price, v_amount_usd);

  INSERT INTO public.market_activity (market_id, user_id, action, amount_usd, side, price)
  VALUES (p_market_id, p_user_id,
    CASE WHEN p_side = 'yes' THEN 'bet_yes' ELSE 'bet_no' END,
    v_amount_usd, p_side,
    CASE WHEN p_side = 'yes' THEN v_new_yes_price ELSE v_new_no_price END
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'transaction_id', v_transaction_id,
    'shares', v_shares,
    'avg_fill_price', ROUND(v_avg_price, 6),
    'amount_usd', v_amount_usd,
    'fee_usd', v_fee_usd,
    'creator_reward_usd', CASE WHEN v_market.creator_id IS DISTINCT FROM p_user_id THEN v_creator_reward ELSE 0 END,
    'net_usd', v_net_usd,
    'new_yes_price', v_new_yes_price,
    'new_no_price', v_new_no_price,
    'potential_payout_usd', v_shares
  );
END;
$function$;
