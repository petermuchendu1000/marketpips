-- ============================================================
-- 023_independent_option_lines.sql
-- Module 3.x / 7.x — Phase C of the Polymarket/Kalshi parity roadmap
-- (docs/design/POLYMARKET-KALSHI-PARITY.md §5–§6).
--
-- WHAT THIS DOES
--   Evolves multi-outcome markets from the "simplex" model (one shared LMSR
--   across all options, ΣΣ prices == 1) to the "independent" model that
--   Polymarket & Kalshi actually use: EACH candidate is its own binary Yes/No
--   line with an independent probability. A candidate's yes_price + no_price
--   == 1 for THAT candidate; the yes_prices do NOT sum to 1 across candidates.
--
-- HOW
--   An independent market is just N binary LMSR sub-markets. Every option row
--   carries its own (q_yes, q_no) inventory and (yes_price, no_price), priced
--   with the SAME numerically-stable closed-form the binary place_bet already
--   uses — so the tested TS preview equals on-chain execution.
--
-- SAFETY (dual-write / shadow-read / backout — §6)
--   • Purely ADDITIVE: new nullable columns, new RPCs, reworked partial indexes.
--   • Per-market opt-in via markets.options_pricing_mode ('simplex'|'independent'),
--     so we migrate market-by-market and can revert a single market.
--   • The UI/API only take the independent path when BOTH the market is in
--     'independent' mode AND the feature flag flags.independent_options is on
--     (instant kill-switch, no redeploy).
--   • The legacy simplex RPCs (place_bet_option / resolve_market_options) and the
--     binary RPCs (place_bet / resolve_market) are left completely intact.
--
-- ⚠ REVIEW + STAGING TEST REQUIRED before production apply. Take a backup first.
--   Rollback = set affected markets back to 'simplex' (their q_shares/price are
--   untouched) and/or flip the flag off; optionally DROP the added columns/RPCs.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Schema — additive columns (idempotent)
-- ------------------------------------------------------------

-- Per-market pricing mode. 'simplex' = legacy shared-LMSR (default; nothing
-- changes for existing markets). 'independent' = per-candidate binary lines.
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS options_pricing_mode TEXT NOT NULL DEFAULT 'simplex';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'markets_options_pricing_mode_chk'
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_options_pricing_mode_chk
      CHECK (options_pricing_mode IN ('simplex', 'independent'));
  END IF;
END $$;

-- Per-candidate independent binary line: own inventory + own Yes/No price.
-- Nullable so existing simplex rows are unaffected; seeded on migration.
ALTER TABLE public.market_options
  ADD COLUMN IF NOT EXISTS q_yes     DECIMAL(20,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS q_no      DECIMAL(20,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yes_price DECIMAL(8,6),
  ADD COLUMN IF NOT EXISTS no_price  DECIMAL(8,6);

-- Bounded, valid per-candidate prices when present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'market_options_yes_price_bounds') THEN
    ALTER TABLE public.market_options
      ADD CONSTRAINT market_options_yes_price_bounds
      CHECK (yes_price IS NULL OR (yes_price >= 0 AND yes_price <= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'market_options_no_price_bounds') THEN
    ALTER TABLE public.market_options
      ADD CONSTRAINT market_options_no_price_bounds
      CHECK (no_price IS NULL OR (no_price >= 0 AND no_price <= 1));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Position uniqueness — split by side so a user can hold BOTH a Yes and a
--    No line on the SAME candidate in an independent market.
--
--    Legacy simplex option positions carry side = NULL → keep their (user,
--    market, option) uniqueness but scope it to side IS NULL. Independent
--    positions carry side = 'yes'|'no' → get a (user, market, option, side)
--    uniqueness. Binary positions (market_option_id IS NULL) are unaffected.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.positions_user_market_option_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS positions_user_market_option_uidx
  ON public.positions(user_id, market_id, market_option_id)
  WHERE market_option_id IS NOT NULL AND side IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS positions_user_market_option_side_uidx
  ON public.positions(user_id, market_id, market_option_id, side)
  WHERE market_option_id IS NOT NULL AND side IS NOT NULL;

-- ------------------------------------------------------------
-- 3. set_market_pricing_independent — opt a market into the independent model.
--    Seeds each candidate's binary line at 50/50 (neutral, no inventory) so
--    the board starts unbiased; admins/creators can pre-price later. Idempotent.
--    Only meaningful for multiple_choice markets with option rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_market_pricing_independent(p_market_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_count INT;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0001'; END IF;

  -- Seed only the options that have not yet been given a binary line.
  UPDATE public.market_options
    SET yes_price = COALESCE(yes_price, 0.5),
        no_price  = COALESCE(no_price, 0.5),
        q_yes     = COALESCE(q_yes, 0),
        q_no      = COALESCE(q_no, 0),
        updated_at = NOW()
  WHERE market_id = p_market_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.markets
    SET options_pricing_mode = 'independent', updated_at = NOW()
  WHERE id = p_market_id;

  RETURN jsonb_build_object(
    'success', TRUE, 'market_id', p_market_id,
    'options_seeded', v_count, 'mode', 'independent'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. place_bet_option_binary — atomic Yes/No bet on ONE candidate line of an
--    INDEPENDENT multi-outcome market. Mirrors place_bet's LMSR share math and
--    place_bet_option's wallet/fee/accounting (reserve on bet → release on
--    settle). Only reprices the ONE candidate — other candidates are untouched.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_bet_option_binary(
  p_user_id       UUID,
  p_market_id     UUID,
  p_option_id     UUID,
  p_side          order_side,
  p_amount_local  DECIMAL,
  p_currency      currency_code,
  p_client_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_market         public.markets%ROWTYPE;
  v_option         public.market_options%ROWTYPE;
  v_wallet         public.wallets%ROWTYPE;
  v_exchange_rate  DECIMAL;
  v_amount_usd     DECIMAL;
  v_fee_usd        DECIMAL;
  v_creator_reward DECIMAL;
  v_net_usd        DECIMAL;
  v_lmsr_b         DECIMAL;
  v_yes            DECIMAL;
  v_no             DECIMAL;
  v_shares         DECIMAL;
  v_ratio          DECIMAL;
  v_new_yes        DECIMAL;
  v_new_no         DECIMAL;
  v_price_before   DECIMAL;
  v_new_price      DECIMAL;
  v_avg_price      DECIMAL;
  v_order_id       UUID;
  v_transaction_id UUID;
  v_creator_wallet_id UUID;
  v_creator_bal    DECIMAL;
BEGIN
  -- Lock market; must be active + independent.
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found or not active' USING ERRCODE = 'P0001'; END IF;
  IF v_market.closes_at < NOW() THEN RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE = 'P0002'; END IF;
  IF v_market.options_pricing_mode <> 'independent' THEN
    RAISE EXCEPTION 'Market is not in independent pricing mode' USING ERRCODE = 'P0009';
  END IF;

  -- Lock the candidate line; must belong to this market.
  SELECT * INTO v_option FROM public.market_options
  WHERE id = p_option_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Option not found for market' USING ERRCODE = 'P0007'; END IF;

  -- FX → USD.
  SELECT rate INTO v_exchange_rate FROM public.exchange_rates
  WHERE from_currency = p_currency AND to_currency = 'USD';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE = 'P0003'; END IF;

  v_amount_usd := p_amount_local * v_exchange_rate;
  IF v_amount_usd < 0.10 THEN RAISE EXCEPTION 'Minimum bet is 0.10 USD equivalent' USING ERRCODE = 'P0004'; END IF;

  -- Fees: platform fee with creator reward carved out (mirrors place_bet).
  v_fee_usd        := ROUND(v_amount_usd * COALESCE(v_market.platform_fee_rate, 0.02), 8);
  v_creator_reward := ROUND(v_amount_usd * COALESCE(v_market.creator_reward_rate, 0.0025), 8);
  v_creator_reward := LEAST(v_creator_reward, v_fee_usd);
  v_net_usd        := v_amount_usd - v_fee_usd;

  -- Lock wallet + balance check.
  SELECT * INTO v_wallet FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0005'; END IF;
  IF v_wallet.available_balance < p_amount_local THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
      v_wallet.available_balance, p_amount_local USING ERRCODE = 'P0006';
  END IF;

  -- Independent binary LMSR on THIS candidate only (same closed-form as place_bet).
  v_lmsr_b := GREATEST(v_market.liquidity_pool_usd / 2, 50);
  v_yes := GREATEST(COALESCE(v_option.yes_price, 0.5), 0.000001);
  v_no  := GREATEST(COALESCE(v_option.no_price, 0.5),  0.000001);
  v_price_before := CASE WHEN p_side = 'yes' THEN v_yes ELSE v_no END;

  IF p_side = 'yes' THEN
    v_shares := v_net_usd + v_lmsr_b * LN( (1 - v_no * EXP(-v_net_usd / v_lmsr_b)) / v_yes );
    v_ratio  := (v_yes / v_no) * EXP(v_shares / v_lmsr_b);
    v_new_yes := v_ratio / (1 + v_ratio);
    v_new_no  := 1 / (1 + v_ratio);
  ELSE
    v_shares := v_net_usd + v_lmsr_b * LN( (1 - v_yes * EXP(-v_net_usd / v_lmsr_b)) / v_no );
    v_ratio  := (v_no / v_yes) * EXP(v_shares / v_lmsr_b);
    v_new_no  := v_ratio / (1 + v_ratio);
    v_new_yes := 1 / (1 + v_ratio);
  END IF;

  v_new_yes := ROUND(v_new_yes, 6);
  v_new_no  := ROUND(v_new_no, 6);
  IF v_shares IS NULL OR v_shares <= 0 THEN
    RAISE EXCEPTION 'Computed non-positive shares' USING ERRCODE = 'P0008';
  END IF;
  v_new_price := CASE WHEN p_side = 'yes' THEN v_new_yes ELSE v_new_no END;
  v_avg_price := v_net_usd / v_shares;

  -- Update ONLY this candidate's line (independence: no reprice of siblings).
  -- `price` mirrors the candidate's implied Yes probability so legacy readers
  -- (that read market_options.price) keep working.
  UPDATE public.market_options SET
    q_yes = q_yes + CASE WHEN p_side = 'yes' THEN v_shares ELSE 0 END,
    q_no  = q_no  + CASE WHEN p_side = 'no'  THEN v_shares ELSE 0 END,
    yes_price = v_new_yes,
    no_price  = v_new_no,
    price = v_new_yes,
    total_invested_usd = COALESCE(total_invested_usd, 0) + v_net_usd,
    volume_usd = COALESCE(volume_usd, 0) + v_amount_usd,
    updated_at = NOW()
  WHERE id = p_option_id;

  -- Reserve the stake (available → reserved), released at settlement.
  UPDATE public.wallets SET
    available_balance = available_balance - p_amount_local,
    reserved_balance  = reserved_balance + p_amount_local,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Order (side set — this is a Yes/No line order on a candidate).
  INSERT INTO public.orders (
    market_id, user_id, wallet_id, market_option_id,
    side, type, status,
    amount_usd, currency, amount_local, exchange_rate_to_usd,
    avg_fill_price, shares, potential_payout_usd,
    fee_usd, fee_local, filled_usd, client_order_id, metadata
  ) VALUES (
    p_market_id, p_user_id, v_wallet.id, p_option_id,
    p_side, 'market', 'filled',
    v_amount_usd, p_currency, p_amount_local, v_exchange_rate,
    ROUND(v_avg_price, 6), v_shares, v_shares,
    v_fee_usd, v_fee_usd / v_exchange_rate, v_amount_usd, p_client_order_id,
    jsonb_build_object('creator_reward_usd', v_creator_reward, 'lmsr_b', v_lmsr_b, 'pricing_mode', 'independent')
  ) RETURNING id INTO v_order_id;

  -- Position keyed by (user, market, option, side).
  INSERT INTO public.positions (
    user_id, market_id, wallet_id, market_option_id,
    side, shares, total_invested_usd, avg_entry_price, current_value_usd
  ) VALUES (
    p_user_id, p_market_id, v_wallet.id, p_option_id,
    p_side::text::position_side, v_shares, v_net_usd, ROUND(v_avg_price, 6),
    v_shares * v_new_price
  )
  ON CONFLICT (user_id, market_id, market_option_id, side) WHERE market_option_id IS NOT NULL AND side IS NOT NULL
  DO UPDATE SET
    shares = public.positions.shares + v_shares,
    total_invested_usd = public.positions.total_invested_usd + v_net_usd,
    avg_entry_price = (public.positions.total_invested_usd + v_net_usd)
                      / NULLIF(public.positions.shares + v_shares, 0),
    current_value_usd = (public.positions.shares + v_shares) * v_new_price,
    is_active = TRUE,
    updated_at = NOW();

  -- Transaction.
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
    FORMAT('Bet %s on "%s": %s', UPPER(p_side::TEXT), v_market.title, v_option.label),
    COALESCE(p_client_order_id, gen_random_uuid()::TEXT)
  ) RETURNING id INTO v_transaction_id;

  -- Creator reward (USD) — paid out of the fee to the creator's USD wallet;
  -- skip self-bets (anti wash-trading). Mirrors place_bet exactly.
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
      market_id, market_option_id, description, idempotency_key
    ) VALUES (
      v_market.creator_id, v_creator_wallet_id, 'creator_reward', 'completed',
      v_creator_reward, 'USD', v_creator_reward, 1,
      v_creator_bal, v_creator_bal + v_creator_reward,
      p_market_id, p_option_id,
      FORMAT('Creator reward: %s', v_market.title),
      FORMAT('creward_%s', v_order_id)
    );
  END IF;

  -- Market stats + per-candidate price history (store the candidate's Yes price).
  UPDATE public.markets SET
    total_volume_usd = total_volume_usd + v_amount_usd,
    total_bets = total_bets + 1,
    updated_at = NOW()
  WHERE id = p_market_id;

  INSERT INTO public.price_history (market_id, market_option_id, price, volume_usd)
  VALUES (p_market_id, p_option_id, v_new_yes, v_amount_usd);

  INSERT INTO public.market_activity (market_id, user_id, market_option_id, action, amount_usd, side, price)
  VALUES (
    p_market_id, p_user_id, p_option_id,
    CASE WHEN p_side = 'yes' THEN 'bet_yes' ELSE 'bet_no' END,
    v_amount_usd, p_side, v_new_price
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'transaction_id', v_transaction_id,
    'option_id', p_option_id,
    'side', p_side,
    'shares', v_shares,
    'avg_fill_price', ROUND(v_avg_price, 6),
    'amount_usd', v_amount_usd,
    'fee_usd', v_fee_usd,
    'creator_reward_usd', CASE WHEN v_market.creator_id IS DISTINCT FROM p_user_id THEN v_creator_reward ELSE 0 END,
    'net_usd', v_net_usd,
    'new_yes_price', v_new_yes,
    'new_no_price', v_new_no,
    'potential_payout_usd', v_shares
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. resolve_market_options_binary — settle an INDEPENDENT market.
--    A position WINS iff (option = winner AND side = 'yes')
--                     OR (option <> winner AND side = 'no').
--    Winners: shares × $1 + return of stake (from reserved). Losers: release
--    reserved (already spent), pnl = −invested. Per-(option,side,user) idem key.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_market_options_binary(
  p_market_id         UUID,
  p_winning_option_id UUID,
  p_resolver_id       UUID,
  p_resolution_notes  TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_win public.market_options%ROWTYPE;
  v_position RECORD;
  v_exchange_rate DECIMAL;
  v_payout_usd DECIMAL;
  v_payout_local DECIMAL;
  v_is_winner BOOLEAN;
  v_total_paid_out DECIMAL := 0;
  v_winners INTEGER := 0;
  v_losers INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0001'; END IF;
  IF v_market.status NOT IN ('active', 'closed', 'disputed') THEN
    RAISE EXCEPTION 'Market cannot be resolved in status: %', v_market.status USING ERRCODE = 'P0002';
  END IF;
  IF v_market.options_pricing_mode <> 'independent' THEN
    RAISE EXCEPTION 'Market is not in independent pricing mode' USING ERRCODE = 'P0009';
  END IF;

  SELECT * INTO v_win FROM public.market_options
  WHERE id = p_winning_option_id AND market_id = p_market_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Winning option not found for market' USING ERRCODE = 'P0007'; END IF;

  UPDATE public.markets SET
    status = 'resolved', resolved_option_id = p_winning_option_id,
    resolved_at = NOW(), resolver_id = p_resolver_id, resolution_notes = p_resolution_notes
  WHERE id = p_market_id;

  UPDATE public.market_options
    SET is_winner = (id = p_winning_option_id), updated_at = NOW()
  WHERE market_id = p_market_id;

  -- Iterate every independent (option, side) position on this market.
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id AND p.is_active = TRUE
      AND p.market_option_id IS NOT NULL AND p.side IS NOT NULL
  LOOP
    v_is_winner := (v_position.market_option_id = p_winning_option_id AND v_position.side = 'yes')
                OR (v_position.market_option_id <> p_winning_option_id AND v_position.side = 'no');

    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    IF v_is_winner THEN
      v_payout_usd := v_position.shares;
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
        p_market_id, v_position.market_option_id,
        FORMAT('Won %s: %s — %s', UPPER(v_position.side::TEXT), v_market.title, v_win.label),
        FORMAT('winb_%s_%s_%s_%s', p_market_id, v_position.market_option_id, v_position.side, v_position.user_id)
      );

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_position.user_id, 'bet_won', '🎉 You Won!',
        FORMAT('Your %s line on "%s" paid out +%s USD', UPPER(v_position.side::TEXT), v_market.title, ROUND(v_payout_usd, 2)),
        jsonb_build_object('market_id', p_market_id, 'option_id', v_position.market_option_id, 'side', v_position.side, 'payout_usd', v_payout_usd)
      );

      v_total_paid_out := v_total_paid_out + v_payout_usd;
      v_winners := v_winners + 1;
    ELSE
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
        FORMAT('Lost %s: %s', UPPER(v_position.side::TEXT), v_market.title),
        FORMAT('loseb_%s_%s_%s_%s', p_market_id, v_position.market_option_id, v_position.side, v_position.user_id)
      );

      v_losers := v_losers + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE, 'market_id', p_market_id, 'winning_option_id', p_winning_option_id,
    'mode', 'independent', 'winners', v_winners, 'losers', v_losers,
    'total_paid_out_usd', v_total_paid_out
  );
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 6. Grants — consistent with existing RPCs.
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.set_market_pricing_independent(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_bet_option_binary(UUID, UUID, UUID, order_side, DECIMAL, currency_code, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_market_options_binary(UUID, UUID, UUID, TEXT) TO service_role;

COMMIT;
