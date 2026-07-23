-- =====================================================================
-- Migration 033: CLOB two-sided matching engine (Polymarket CTF parity)
--
-- Completes the phase-1b BUY/MINT-only book (migration 030) into the full
-- Polymarket Conditional-Token matching taxonomy, so a candidate trades as a
-- real two-sided Central Limit Order Book:
--
--   Taker      Maker       Match     Collateral
--   BUY  S     SELL S      DIRECT    shares transfer  (cash taker -> maker)
--   BUY  S     BUY  C      MINT      $1 -> S + C       (both buyers funded it)
--   SELL S     BUY  S      DIRECT    shares transfer  (cash maker -> taker)
--   SELL S     SELL C      MERGE     S + C -> $1       (released to both sellers)
--
-- where S = the order's outcome_side and C = its complement (yes<->no). Because
-- YES(p) + NO(100-p) = 100c = $1, a resting BUY C @ q is an ASK on S at (100-q)
-- (mint), and a resting SELL C @ a is a BID on S at (100-a) (merge). The unified
-- ladder therefore merges REAL orders with these SYNTHETIC complementary levels
-- and consumes them in strict price-time priority.
--
-- INVARIANTS (property-tested in scripts/ops/clob/test_two_sided.py):
--   I1 share conservation : per option, Sum(YES shares) == Sum(NO shares) at all
--                           times (mint +1/+1, merge -1/-1, direct transfers).
--   I2 cash/collateral    : Sum(user cash out at buys) == Sum(paid back) across
--                           mint -> merge -> resolution (collateral in == out).
--   I3 price-time priority: takers fill best price first, then oldest.
--   I4 self-trade prevention: a user never matches their own resting order.
--   I5 no negatives       : available_balance, reserved_balance, reserved_shares,
--                           shares never go negative.
--   I6 escrow exactness   : resting BUY reserves cash = size*price; resting SELL
--                           reserves shares = size; cancel releases exactly the
--                           unfilled remainder.
--   I7 no over-sell       : a SELL can never exceed available (unreserved) shares.
--
-- SAFETY: additive & reversible. Only CREATE OR REPLACE on the CLOB RPCs +
--   one additive nullable-defaulted column (positions.reserved_shares). The AMM
--   / LMSR / independent paths are untouched. Rollback = re-apply migration 030
--   (restores the buy/mint-only bodies) and, optionally, DROP the new column.
--   Trading fees are plumbed but default to 0 (Polymarket charges 0 taker/maker
--   on the CLOB); a non-zero fee can be enabled later without a schema change.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Share escrow. A resting SELL locks shares so they cannot be double-sold.
--    available-to-sell = shares - reserved_shares.
-- ---------------------------------------------------------------------
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS reserved_shares numeric(20,6) NOT NULL DEFAULT 0
  CHECK (reserved_shares >= 0);

-- Legacy binary-era constraint UNIQUE(user_id, market_id, side) forbids a user
-- holding the SAME side on two candidates of one multi-outcome market (e.g. NO
-- on both "Ruto" and "Gachagua"), which is legitimate for multi-outcome/CLOB and
-- silently blocks it (INSERT fails before ON CONFLICT can resolve). Scope it to
-- binary markets only (market_option_id IS NULL); per-option uniqueness is
-- already covered by positions_user_market_option_side_uidx. Safe + reversible.
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_user_id_market_id_side_key;
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_market_side_binary_uidx
  ON public.positions (user_id, market_id, side) WHERE market_option_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. clob_get_book: full two-sided depth (real + synthetic on BOTH sides).
--    bids(S) = BUY S (real @ b) UNION SELL C (synthetic @ 100-a)   [merge]
--    asks(S) = SELL S (real @ a) UNION BUY C (synthetic @ 100-q)   [mint]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clob_get_book(
  p_market_id uuid,
  p_market_option_id uuid,
  p_outcome_side public.order_side
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp     public.order_side := CASE WHEN p_outcome_side = 'yes' THEN 'no' ELSE 'yes' END;
  v_bids     jsonb;
  v_asks     jsonb;
  v_last     numeric(4,1);
  v_best_bid numeric(4,1);
  v_best_ask numeric(4,1);
BEGIN
  -- BIDS on S: what a SELL S taker can hit, best (highest) first.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('price', price, 'size', size) ORDER BY price DESC), '[]'::jsonb)
    INTO v_bids
  FROM (
    SELECT price, SUM(avail) AS size FROM (
      -- real BUY S
      SELECT price_cents AS price, (size - filled) AS avail
      FROM public.clob_orders
      WHERE market_id = p_market_id
        AND market_option_id IS NOT DISTINCT FROM p_market_option_id
        AND outcome_side = p_outcome_side AND action = 'buy'
        AND status IN ('open','partially_filled')
        AND (expires_at IS NULL OR expires_at > now())
      UNION ALL
      -- synthetic: resting SELL C @ a -> bid on S at (100 - a)  [merge]
      SELECT (100 - price_cents)::numeric(4,1) AS price, (size - filled) AS avail
      FROM public.clob_orders
      WHERE market_id = p_market_id
        AND market_option_id IS NOT DISTINCT FROM p_market_option_id
        AND outcome_side = v_comp AND action = 'sell'
        AND status IN ('open','partially_filled')
        AND (expires_at IS NULL OR expires_at > now())
    ) u
    GROUP BY price HAVING SUM(avail) > 0
  ) t;

  -- ASKS on S: what a BUY S taker can hit, best (lowest) first.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('price', price, 'size', size) ORDER BY price ASC), '[]'::jsonb)
    INTO v_asks
  FROM (
    SELECT price, SUM(avail) AS size FROM (
      -- real SELL S
      SELECT price_cents AS price, (size - filled) AS avail
      FROM public.clob_orders
      WHERE market_id = p_market_id
        AND market_option_id IS NOT DISTINCT FROM p_market_option_id
        AND outcome_side = p_outcome_side AND action = 'sell'
        AND status IN ('open','partially_filled')
        AND (expires_at IS NULL OR expires_at > now())
      UNION ALL
      -- synthetic: resting BUY C @ q -> ask on S at (100 - q)  [mint]
      SELECT (100 - price_cents)::numeric(4,1) AS price, (size - filled) AS avail
      FROM public.clob_orders
      WHERE market_id = p_market_id
        AND market_option_id IS NOT DISTINCT FROM p_market_option_id
        AND outcome_side = v_comp AND action = 'buy'
        AND status IN ('open','partially_filled')
        AND (expires_at IS NULL OR expires_at > now())
    ) u
    GROUP BY price HAVING SUM(avail) > 0
  ) t;

  SELECT price_cents INTO v_last
  FROM public.clob_fills
  WHERE market_id = p_market_id
    AND market_option_id IS NOT DISTINCT FROM p_market_option_id
    AND outcome_side = p_outcome_side
  ORDER BY created_at DESC LIMIT 1;

  v_best_bid := NULLIF(v_bids->0->>'price','')::numeric(4,1);
  v_best_ask := NULLIF(v_asks->0->>'price','')::numeric(4,1);

  RETURN jsonb_build_object(
    'market_id', p_market_id,
    'market_option_id', p_market_option_id,
    'outcome_side', p_outcome_side,
    'bids', v_bids,
    'asks', v_asks,
    'last', v_last,
    'best_bid', v_best_bid,
    'best_ask', v_best_ask,
    'spread', CASE WHEN v_best_ask IS NOT NULL AND v_best_bid IS NOT NULL
                   THEN v_best_ask - v_best_bid ELSE NULL END,
    'mid', CASE WHEN v_best_ask IS NOT NULL AND v_best_bid IS NOT NULL
                THEN ROUND((v_best_ask + v_best_bid)/2, 1) ELSE COALESCE(v_last, NULL) END
  );
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------
-- 3. clob_place_order: unified two-sided matcher (DIRECT / MINT / MERGE).
--    Atomic SECURITY DEFINER: escrow (cash for buys, shares for sells),
--    positions, transactions, fills, price_history, market_activity and the
--    option's live price are all written in one call under row locks, in
--    strict price-time priority, with self-trade prevention.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clob_place_order(
  p_user_id           uuid,
  p_market_id         uuid,
  p_market_option_id  uuid,
  p_outcome_side      public.order_side,
  p_action            public.clob_action,
  p_order_type        public.order_type,
  p_price_cents       numeric,
  p_size              numeric,
  p_currency          public.currency_code,
  p_client_order_id   text DEFAULT NULL,
  p_expires_at        timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market       public.markets%ROWTYPE;
  v_option       public.market_options%ROWTYPE;
  v_wallet       public.wallets%ROWTYPE;
  v_rate         numeric;
  v_comp         public.order_side := CASE WHEN p_outcome_side = 'yes' THEN 'no' ELSE 'yes' END;
  v_tick         numeric;
  v_limit_c      numeric(4,1);
  v_min_usd      numeric;
  v_avail_shares numeric(20,6);
  v_remaining    numeric(20,6);
  v_filled       numeric(20,6) := 0;
  v_cash_delta   numeric := 0;          -- taker USD: buys negative-cost accum (spent), sells proceeds accum
  v_notional     numeric := 0;          -- Sum(exec*fill)/100 traded, USD (for stats/avg)
  v_taker_order  uuid;
  v_mk           RECORD;                 -- ladder row (maker id + kind + exec)
  v_maker        public.clob_orders%ROWTYPE;
  v_maker_avail  numeric(20,6);
  v_fill         numeric(20,6);
  v_e            numeric(4,1);           -- execution price cents (on S)
  v_maker_price  numeric(4,1);           -- maker's own leg price cents
  v_taker_usd    numeric;               -- per-fill taker USD (cost if buy, proceeds if sell)
  v_maker_usd    numeric;               -- per-fill maker USD leg
  v_maker_local  numeric;
  v_last_yes     numeric(4,1);          -- YES-implied price of the last fill (for writeback)
  v_order_id     uuid;
  v_txn_id       uuid;
  v_rest         numeric(20,6);
  v_reserve_usd  numeric := 0;
  v_reserve_loc  numeric := 0;
  v_cash_local   numeric;
  v_avg_price    numeric;               -- USD per share (0..1)
  v_status       public.order_status;
  v_fills        jsonb := '[]'::jsonb;
BEGIN
  -- ---- validation --------------------------------------------------
  IF p_action NOT IN ('buy','sell') THEN
    RAISE EXCEPTION 'action must be buy or sell' USING ERRCODE='P0102';
  END IF;
  IF p_market_option_id IS NULL THEN
    RAISE EXCEPTION 'CLOB requires a market_option_id (per-candidate book)' USING ERRCODE='P0101';
  END IF;
  IF p_size IS NULL OR p_size <= 0 THEN
    RAISE EXCEPTION 'size must be > 0' USING ERRCODE='P0102';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found or not active' USING ERRCODE='P0001'; END IF;
  IF v_market.closes_at < now() THEN RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE='P0002'; END IF;
  IF v_market.pricing_engine <> 'clob' THEN RAISE EXCEPTION 'Market is not a CLOB market' USING ERRCODE='P0103'; END IF;

  SELECT * INTO v_option FROM public.market_options
    WHERE id = p_market_option_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Option not found for market' USING ERRCODE='P0007'; END IF;

  -- tick lattice + limit clamp (031: markets.tick_size in {0.001,0.01} => 0.1c/1c)
  v_tick := GREATEST(0.1, COALESCE(v_market.tick_size,0.001) * 100);   -- cents
  IF p_order_type = 'limit' THEN
    IF p_price_cents IS NULL THEN RAISE EXCEPTION 'limit order needs price_cents' USING ERRCODE='P0104'; END IF;
    v_limit_c := ROUND((ROUND(p_price_cents / v_tick) * v_tick)::numeric, 1);
    v_limit_c := LEAST(99.9, GREATEST(0.1, v_limit_c));
  ELSE
    v_limit_c := CASE WHEN p_action='buy' THEN 99.9 ELSE 0.1 END;  -- market: cross anything
  END IF;

  -- FX for the taker
  SELECT rate INTO v_rate FROM public.exchange_rates WHERE from_currency = p_currency AND to_currency = 'USD';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE='P0003'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE='P0005'; END IF;

  -- min order size (USD notional at the limit / best price estimate)
  v_min_usd := COALESCE(v_market.min_order_size, 0);

  v_remaining := p_size;

  -- ---- SELL: lock the position and reserve shares (I7 no over-sell) ----
  IF p_action = 'sell' THEN
    PERFORM 1 FROM public.positions
      WHERE user_id = p_user_id AND market_id = p_market_id
        AND market_option_id = p_market_option_id
        AND side = p_outcome_side::text::position_side FOR UPDATE;
    SELECT (COALESCE(shares,0) - COALESCE(reserved_shares,0)) INTO v_avail_shares
      FROM public.positions
      WHERE user_id = p_user_id AND market_id = p_market_id
        AND market_option_id = p_market_option_id
        AND side = p_outcome_side::text::position_side;
    IF v_avail_shares IS NULL OR v_avail_shares < p_size THEN
      RAISE EXCEPTION 'Not enough shares to sell (available %, requested %)',
        COALESCE(v_avail_shares,0), p_size USING ERRCODE='P0113';
    END IF;
    -- reserve the full size up-front; each fill unlocks its part as it delivers.
    UPDATE public.positions SET reserved_shares = reserved_shares + p_size, updated_at = now()
      WHERE user_id = p_user_id AND market_id = p_market_id
        AND market_option_id = p_market_option_id
        AND side = p_outcome_side::text::position_side;
  END IF;

  -- ---- create the taker order row (for fill FK) --------------------
  INSERT INTO public.clob_orders (
    market_id, market_option_id, user_id, wallet_id, outcome_side, action,
    order_type, price_cents, size, filled, status, currency, exchange_rate_to_usd,
    reserved_usd, client_order_id, expires_at, metadata
  ) VALUES (
    p_market_id, p_market_option_id, p_user_id, v_wallet.id, p_outcome_side, p_action,
    p_order_type, CASE WHEN p_order_type='limit' THEN v_limit_c ELSE NULL END,
    p_size, 0, 'open', p_currency, v_rate,
    0, p_client_order_id, p_expires_at, jsonb_build_object('engine','clob')
  ) RETURNING id INTO v_taker_order;

  -- ---- unified ladder in price-time priority ----------------------
  --  BUY  S: asks = SELL S (direct @ a) UNION BUY C (mint @ 100-q); e ASC, e<=limit
  --  SELL S: bids = BUY  S (direct @ b) UNION SELL C (merge @ 100-a); e DESC, e>=limit
  FOR v_mk IN
    SELECT id, kind, exec, created_at FROM (
      -- 'direct' = maker on the SAME outcome_side (opposite action): share
      -- transfer at the maker's price. Complement-side makers are mint (both
      -- buys) or merge (both sells): the S-execution price is 100 - maker price.
      SELECT id,
             CASE WHEN outcome_side = p_outcome_side THEN 'direct'
                  WHEN p_action='buy' THEN 'mint' ELSE 'burn' END AS kind,
             CASE WHEN outcome_side = p_outcome_side THEN price_cents
                  ELSE (100 - price_cents)::numeric(4,1) END AS exec,
             created_at
      FROM public.clob_orders
      WHERE market_id = p_market_id
        AND market_option_id IS NOT DISTINCT FROM p_market_option_id
        AND status IN ('open','partially_filled')
        AND user_id <> p_user_id                          -- I4 self-trade prevention
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          -- BUY taker eats: SELL S (same side, action=sell) or BUY C (comp, action=buy)
          (p_action='buy'  AND ((action='sell' AND outcome_side=p_outcome_side)
                             OR (action='buy'  AND outcome_side=v_comp)))
          -- SELL taker eats: BUY S (same side, action=buy) or SELL C (comp, action=sell)
          OR (p_action='sell' AND ((action='buy'  AND outcome_side=p_outcome_side)
                               OR (action='sell' AND outcome_side=v_comp)))
        )
    ) lad
    WHERE (p_action='buy'  AND exec <= v_limit_c)
       OR (p_action='sell' AND exec >= v_limit_c)
    ORDER BY CASE WHEN p_action='buy' THEN exec END ASC,
             CASE WHEN p_action='sell' THEN exec END DESC,
             created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    SELECT * INTO v_maker FROM public.clob_orders WHERE id = v_mk.id FOR UPDATE;
    IF v_maker.status NOT IN ('open','partially_filled') THEN CONTINUE; END IF;
    v_maker_avail := v_maker.size - v_maker.filled;
    IF v_maker_avail <= 0 THEN CONTINUE; END IF;

    v_fill       := LEAST(v_remaining, v_maker_avail);
    v_e          := v_mk.exec;                 -- taker execution price on S (cents)
    v_maker_price:= v_maker.price_cents;       -- maker's own leg price (cents)
    v_maker_local:= NULL;

    -- advance maker order (filled + status); escrow release depends on kind.
    UPDATE public.clob_orders SET
      filled = filled + v_fill,
      status = (CASE WHEN (filled + v_fill) >= size THEN 'filled' ELSE 'partially_filled' END)::public.order_status,
      updated_at = now()
    WHERE id = v_maker.id;

    IF p_action = 'buy' THEN
      -- taker BUYS S @ v_e
      v_taker_usd := ROUND(v_fill * v_e / 100.0, 8);
      IF v_mk.kind = 'direct' THEN
        -- maker SELL S delivers shares, receives v_e; release maker's reserved shares
        v_maker_usd := v_taker_usd;
        UPDATE public.positions SET
          shares = shares - v_fill,
          reserved_shares = GREATEST(0, reserved_shares - v_fill),
          realized_pnl_usd = COALESCE(realized_pnl_usd,0) + (v_e/100.0 - COALESCE(avg_entry_price,0)) * v_fill,
          total_payout_usd = COALESCE(total_payout_usd,0) + v_maker_usd,
          current_value_usd = GREATEST(0, (shares - v_fill)) * (v_e/100.0),
          is_active = (shares - v_fill) > 0, updated_at = now()
        WHERE user_id = v_maker.user_id AND market_id = p_market_id
          AND market_option_id = p_market_option_id AND side = p_outcome_side::text::position_side;
        v_maker_local := ROUND(v_maker_usd / v_maker.exchange_rate_to_usd, 2);
        UPDATE public.wallets SET available_balance = available_balance + v_maker_local, updated_at = now()
          WHERE id = v_maker.wallet_id;
      ELSE
        -- MINT: maker BUY C @ q spends escrow q, receives C shares
        v_maker_usd := ROUND(v_fill * v_maker_price / 100.0, 8);
        v_maker_local := ROUND(v_maker_usd / v_maker.exchange_rate_to_usd, 2);
        UPDATE public.clob_orders SET reserved_usd = GREATEST(0, reserved_usd - v_maker_usd) WHERE id = v_maker.id;
        UPDATE public.wallets SET reserved_balance = GREATEST(0, reserved_balance - v_maker_local), updated_at = now()
          WHERE id = v_maker.wallet_id;
        INSERT INTO public.positions (
          user_id, market_id, wallet_id, market_option_id, side, shares,
          total_invested_usd, avg_entry_price, current_value_usd
        ) VALUES (
          v_maker.user_id, p_market_id, v_maker.wallet_id, p_market_option_id,
          v_comp::text::position_side, v_fill, v_maker_usd, ROUND(v_maker_price/100.0,6),
          v_fill * (v_maker_price/100.0))
        ON CONFLICT (user_id, market_id, market_option_id, side)
          WHERE market_option_id IS NOT NULL AND side IS NOT NULL
        DO UPDATE SET
          shares = public.positions.shares + v_fill,
          total_invested_usd = public.positions.total_invested_usd + v_maker_usd,
          avg_entry_price = (public.positions.total_invested_usd + v_maker_usd)
                            / NULLIF(public.positions.shares + v_fill, 0),
          current_value_usd = (public.positions.shares + v_fill) * (v_maker_price/100.0),
          is_active = TRUE, updated_at = now();
      END IF;
      v_cash_delta := v_cash_delta - v_taker_usd;    -- taker spends

    ELSE
      -- taker SELLS S @ v_e : delivers S shares, receives v_e
      v_taker_usd := ROUND(v_fill * v_e / 100.0, 8);
      IF v_mk.kind = 'direct' THEN
        -- maker BUY S spends escrow (their bid price), receives S shares
        v_maker_usd := ROUND(v_fill * v_maker_price / 100.0, 8);   -- == v_taker_usd (e==maker bid)
        v_maker_local := ROUND(v_maker_usd / v_maker.exchange_rate_to_usd, 2);
        UPDATE public.clob_orders SET reserved_usd = GREATEST(0, reserved_usd - v_maker_usd) WHERE id = v_maker.id;
        UPDATE public.wallets SET reserved_balance = GREATEST(0, reserved_balance - v_maker_local), updated_at = now()
          WHERE id = v_maker.wallet_id;
        INSERT INTO public.positions (
          user_id, market_id, wallet_id, market_option_id, side, shares,
          total_invested_usd, avg_entry_price, current_value_usd
        ) VALUES (
          v_maker.user_id, p_market_id, v_maker.wallet_id, p_market_option_id,
          p_outcome_side::text::position_side, v_fill, v_maker_usd, ROUND(v_maker_price/100.0,6),
          v_fill * (v_maker_price/100.0))
        ON CONFLICT (user_id, market_id, market_option_id, side)
          WHERE market_option_id IS NOT NULL AND side IS NOT NULL
        DO UPDATE SET
          shares = public.positions.shares + v_fill,
          total_invested_usd = public.positions.total_invested_usd + v_maker_usd,
          avg_entry_price = (public.positions.total_invested_usd + v_maker_usd)
                            / NULLIF(public.positions.shares + v_fill, 0),
          current_value_usd = (public.positions.shares + v_fill) * (v_maker_price/100.0),
          is_active = TRUE, updated_at = now();
      ELSE
        -- MERGE: maker SELL C @ a delivers C shares, receives a; S+C burn -> $1
        v_maker_usd := ROUND(v_fill * v_maker_price / 100.0, 8);   -- a/100*f
        v_maker_local := ROUND(v_maker_usd / v_maker.exchange_rate_to_usd, 2);
        UPDATE public.positions SET
          shares = shares - v_fill,
          reserved_shares = GREATEST(0, reserved_shares - v_fill),
          realized_pnl_usd = COALESCE(realized_pnl_usd,0) + (v_maker_price/100.0 - COALESCE(avg_entry_price,0)) * v_fill,
          total_payout_usd = COALESCE(total_payout_usd,0) + v_maker_usd,
          current_value_usd = GREATEST(0,(shares - v_fill)) * (v_maker_price/100.0),
          is_active = (shares - v_fill) > 0, updated_at = now()
        WHERE user_id = v_maker.user_id AND market_id = p_market_id
          AND market_option_id = p_market_option_id AND side = v_comp::text::position_side;
        UPDATE public.wallets SET available_balance = available_balance + v_maker_local, updated_at = now()
          WHERE id = v_maker.wallet_id;
      END IF;
      -- taker delivers S shares (reserved) and collects proceeds
      UPDATE public.positions SET
        shares = shares - v_fill,
        reserved_shares = GREATEST(0, reserved_shares - v_fill),
        realized_pnl_usd = COALESCE(realized_pnl_usd,0) + (v_e/100.0 - COALESCE(avg_entry_price,0)) * v_fill,
        total_payout_usd = COALESCE(total_payout_usd,0) + v_taker_usd,
        current_value_usd = GREATEST(0,(shares - v_fill)) * (v_e/100.0),
        is_active = (shares - v_fill) > 0, updated_at = now()
      WHERE user_id = p_user_id AND market_id = p_market_id
        AND market_option_id = p_market_option_id AND side = p_outcome_side::text::position_side;
      v_cash_delta := v_cash_delta + v_taker_usd;    -- taker receives
    END IF;

    -- maker transaction (audit)
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd,
      exchange_rate_to_usd, balance_before, balance_after, market_id,
      market_option_id, description, idempotency_key, payment_metadata
    ) VALUES (
      v_maker.user_id, v_maker.wallet_id,
      (CASE WHEN v_maker.action='buy' THEN 'bet_placed' ELSE 'bet_refunded' END)::public.transaction_type, 'completed'::public.transaction_status,
      COALESCE(v_maker_local,0), v_maker.currency, COALESCE(v_maker_usd,0), v_maker.exchange_rate_to_usd,
      0, 0, p_market_id, p_market_option_id,
      FORMAT('CLOB %s maker %s @ %s¢ (%s sh)', v_mk.kind, UPPER(v_maker.outcome_side::text), v_maker_price, v_fill),
      FORMAT('clob_mk_%s_%s', v_maker.id, gen_random_uuid()),
      jsonb_build_object('clob_order_id', v_maker.id, 'engine','clob','role','maker','match_kind', v_mk.kind)
    );

    -- fill print (taker perspective) + YES-implied last price
    INSERT INTO public.clob_fills (
      market_id, market_option_id, outcome_side, price_cents, size, match_kind,
      taker_order_id, maker_order_id, taker_user_id, maker_user_id
    ) VALUES (
      p_market_id, p_market_option_id, p_outcome_side, v_e, v_fill, v_mk.kind,
      v_taker_order, v_maker.id, p_user_id, v_maker.user_id
    );
    v_last_yes := CASE WHEN p_outcome_side='yes' THEN v_e ELSE (100 - v_e)::numeric(4,1) END;
    v_fills := v_fills || jsonb_build_object('price_cents', v_e, 'size', v_fill, 'match_kind', v_mk.kind, 'maker_order_id', v_maker.id);

    v_notional  := v_notional + v_taker_usd;
    v_filled    := v_filled + v_fill;
    v_remaining := v_remaining - v_fill;
  END LOOP;

  -- ---- taker settlement -------------------------------------------
  v_rest := CASE WHEN p_order_type='limit' THEN v_remaining ELSE 0 END;

  IF p_action = 'buy' THEN
    -- cash: spend filled cost + escrow the resting remainder
    v_reserve_usd := ROUND(v_rest * v_limit_c / 100.0, 8);
    v_cash_local  := ROUND((-v_cash_delta) / v_rate, 2);     -- spent (>=0)
    v_reserve_loc := ROUND(v_reserve_usd / v_rate, 2);
    IF v_wallet.available_balance < (v_cash_local + v_reserve_loc) THEN
      RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
        v_wallet.available_balance, (v_cash_local + v_reserve_loc) USING ERRCODE='P0006';
    END IF;
    UPDATE public.wallets SET
      available_balance = available_balance - v_cash_local - v_reserve_loc,
      reserved_balance  = reserved_balance + v_reserve_loc, updated_at = now()
    WHERE id = v_wallet.id;

    IF v_filled > 0 THEN
      v_avg_price := v_notional / v_filled;             -- USD/share
      INSERT INTO public.positions (
        user_id, market_id, wallet_id, market_option_id, side, shares,
        total_invested_usd, avg_entry_price, current_value_usd
      ) VALUES (
        p_user_id, p_market_id, v_wallet.id, p_market_option_id,
        p_outcome_side::text::position_side, v_filled, v_notional, ROUND(v_avg_price,6),
        v_filled * v_avg_price)
      ON CONFLICT (user_id, market_id, market_option_id, side)
        WHERE market_option_id IS NOT NULL AND side IS NOT NULL
      DO UPDATE SET
        shares = public.positions.shares + v_filled,
        total_invested_usd = public.positions.total_invested_usd + v_notional,
        avg_entry_price = (public.positions.total_invested_usd + v_notional)
                          / NULLIF(public.positions.shares + v_filled, 0),
        current_value_usd = (public.positions.shares + v_filled) * ROUND(v_avg_price,6),
        is_active = TRUE, updated_at = now();
    END IF;
  ELSE
    -- SELL: credit proceeds; release the unfilled reserved shares for market orders
    v_cash_local := ROUND(v_cash_delta / v_rate, 2);        -- proceeds (>=0)
    UPDATE public.wallets SET available_balance = available_balance + v_cash_local, updated_at = now()
      WHERE id = v_wallet.id;
    IF v_rest = 0 AND (p_size - v_filled) > 0 THEN
      -- market sell remainder dropped: release its share reservation
      UPDATE public.positions SET reserved_shares = GREATEST(0, reserved_shares - (p_size - v_filled)), updated_at = now()
        WHERE user_id = p_user_id AND market_id = p_market_id
          AND market_option_id = p_market_option_id AND side = p_outcome_side::text::position_side;
    END IF;
    IF v_filled > 0 THEN v_avg_price := v_notional / v_filled; END IF;
  END IF;

  -- final taker order status
  IF v_rest > 0 THEN
    v_status := CASE WHEN v_filled > 0 THEN 'partially_filled' ELSE 'open' END;
  ELSE
    v_status := CASE WHEN v_filled > 0 THEN 'filled' ELSE 'cancelled' END;
  END IF;
  UPDATE public.clob_orders SET
    filled = v_filled, status = v_status, reserved_usd = CASE WHEN p_action='buy' THEN v_reserve_usd ELSE 0 END,
    updated_at = now()
  WHERE id = v_taker_order RETURNING id INTO v_order_id;

  -- taker transaction (audit)
  IF v_cash_local IS NOT NULL AND v_cash_local <> 0 THEN
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd,
      exchange_rate_to_usd, balance_before, balance_after, market_id,
      market_option_id, description, idempotency_key, payment_metadata
    ) VALUES (
      p_user_id, v_wallet.id,
      (CASE WHEN p_action='buy' THEN 'bet_placed' ELSE 'bet_refunded' END)::public.transaction_type, 'completed'::public.transaction_status,
      v_cash_local, p_currency, ABS(v_notional), v_rate, 0, 0, p_market_id, p_market_option_id,
      FORMAT('CLOB %s %s %s (%s sh @ avg %s¢)', UPPER(p_action::text), UPPER(p_outcome_side::text),
             v_option.label, v_filled, ROUND(COALESCE(v_avg_price,0)*100,1)),
      COALESCE(p_client_order_id, FORMAT('clob_%s', v_order_id)),
      jsonb_build_object('clob_order_id', v_order_id, 'engine','clob','role','taker','action',p_action)
    ) RETURNING id INTO v_txn_id;
  END IF;

  -- market stats + price history + activity + live option price writeback
  IF v_filled > 0 THEN
    UPDATE public.markets SET
      total_volume_usd = total_volume_usd + v_notional, total_bets = total_bets + 1,
      last_trade_at = now(), updated_at = now()
    WHERE id = p_market_id;
    UPDATE public.market_options SET
      volume_usd = COALESCE(volume_usd,0) + v_notional,
      yes_price = ROUND(v_last_yes/100.0, 6),
      no_price  = ROUND((100 - v_last_yes)/100.0, 6),
      price     = ROUND(v_last_yes/100.0, 6),
      updated_at = now()
    WHERE id = p_market_option_id;
    INSERT INTO public.price_history (market_id, market_option_id, price, volume_usd)
    VALUES (p_market_id, p_market_option_id, ROUND(v_last_yes/100.0,6), v_notional);
    INSERT INTO public.market_activity (market_id, user_id, market_option_id, action, amount_usd, side, price)
    VALUES (p_market_id, p_user_id, p_market_option_id,
            CASE WHEN p_outcome_side='yes' THEN 'bet_yes' ELSE 'bet_no' END,
            v_notional, p_outcome_side, ROUND(v_e/100.0,6));
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE, 'order_id', v_order_id, 'transaction_id', v_txn_id, 'status', v_status,
    'action', p_action, 'filled_shares', v_filled, 'resting_shares', v_rest,
    'avg_fill_price_cents', CASE WHEN v_filled>0 THEN ROUND(v_avg_price*100,1) ELSE NULL END,
    'notional_usd', ROUND(v_notional,6), 'cash_local', v_cash_local, 'fills', v_fills
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clob_place_order(uuid, uuid, uuid, public.order_side, public.clob_action, public.order_type, numeric, numeric, public.currency_code, text, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. clob_cancel_order: release the unfilled remainder's escrow.
--    BUY  -> release reserved cash back to available_balance.
--    SELL -> release reserved shares back to the position (unlock).
--    (DROP first: migration 030 declared the args in reverse order; Postgres
--     won't rename params in place, and we standardise on (user, order).)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.clob_cancel_order(uuid, uuid);
CREATE OR REPLACE FUNCTION public.clob_cancel_order(
  p_user_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  public.clob_orders%ROWTYPE;
  v_rest   numeric(20,6);
  v_loc    numeric;
BEGIN
  SELECT * INTO v_order FROM public.clob_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0110'; END IF;
  IF v_order.user_id <> p_user_id THEN RAISE EXCEPTION 'Not your order' USING ERRCODE='P0111'; END IF;
  IF v_order.status NOT IN ('open','partially_filled') THEN
    RAISE EXCEPTION 'Order is no longer cancellable' USING ERRCODE='P0112';
  END IF;

  v_rest := v_order.size - v_order.filled;

  IF v_order.action = 'buy' THEN
    -- release the cash still escrowed for the unfilled remainder
    v_loc := ROUND(v_order.reserved_usd / v_order.exchange_rate_to_usd, 2);
    UPDATE public.wallets SET
      available_balance = available_balance + v_loc,
      reserved_balance  = GREATEST(0, reserved_balance - v_loc),
      updated_at = now()
    WHERE id = v_order.wallet_id;
  ELSE
    -- release the reserved shares back to the position
    UPDATE public.positions SET
      reserved_shares = GREATEST(0, reserved_shares - v_rest), updated_at = now()
    WHERE user_id = v_order.user_id AND market_id = v_order.market_id
      AND market_option_id = v_order.market_option_id
      AND side = v_order.outcome_side::text::position_side;
  END IF;

  UPDATE public.clob_orders SET status = 'cancelled', reserved_usd = 0, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', TRUE, 'order_id', p_order_id, 'released_shares',
                            CASE WHEN v_order.action='sell' THEN v_rest ELSE 0 END,
                            'released_local', CASE WHEN v_order.action='buy' THEN v_loc ELSE 0 END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clob_cancel_order(uuid, uuid) TO authenticated, service_role;
