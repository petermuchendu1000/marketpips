-- =====================================================================
-- Migration 030: CLOB foundation (per-candidate Central Limit Order Book)
-- Polymarket parity for multi-outcome markets. See
-- docs/design/CLOB-ARCHITECTURE.md (phase 1b).
--
-- Additive & reversible: introduces markets.pricing_engine ('amm'|'clob').
-- All existing LMSR/simplex/independent paths are untouched; rollback = flip
-- the flag back to 'amm'. Idempotent DDL (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Phase 1b scope: BUY-side matching (complementary mint) end-to-end for
-- per-candidate (market_option_id NOT NULL) books, with escrow, positions,
-- transactions, fills, price_history and market_activity all ledgered
-- atomically in one SECURITY DEFINER RPC. SELL/burn + binary (option NULL)
-- books land in phase 1b'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Feature flag on markets: which pricing engine drives the market.
-- ---------------------------------------------------------------------
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS pricing_engine text NOT NULL DEFAULT 'amm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'markets_pricing_engine_chk'
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_pricing_engine_chk
      CHECK (pricing_engine IN ('amm', 'clob'));
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2. Enum: order action (buy|sell). Reuses order_side (yes|no),
--    order_status (open|filled|partially_filled|cancelled|expired),
--    order_type (market|limit).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='clob_action' AND n.nspname='public') THEN
    CREATE TYPE public.clob_action AS ENUM ('buy', 'sell');
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 3. Resting / working orders.
--    price_cents: integer-tick price in cents, 0.1c tick, range [0.1,99.9].
--    size/filled: shares (each share pays $1 at resolution).
--    reserved_usd: escrow still held for the UNFILLED remainder.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clob_orders (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id            uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  market_option_id     uuid REFERENCES public.market_options(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id            uuid NOT NULL REFERENCES public.wallets(id),
  outcome_side         public.order_side  NOT NULL,           -- yes | no
  action               public.clob_action NOT NULL,           -- buy | sell
  order_type           public.order_type  NOT NULL DEFAULT 'limit',
  price_cents          numeric(4,1) CHECK (price_cents IS NULL OR (price_cents >= 0.1 AND price_cents <= 99.9)),
  size                 numeric(20,6) NOT NULL CHECK (size > 0),
  filled               numeric(20,6) NOT NULL DEFAULT 0 CHECK (filled >= 0),
  status               public.order_status NOT NULL DEFAULT 'open',
  currency             public.currency_code NOT NULL,
  exchange_rate_to_usd numeric NOT NULL,
  reserved_usd         numeric(20,2) NOT NULL DEFAULT 0,
  client_order_id      text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  CONSTRAINT clob_orders_filled_lte_size CHECK (filled <= size)
);

-- Best-price-then-oldest book scan (only live orders).
CREATE INDEX IF NOT EXISTS idx_clob_orders_book
  ON public.clob_orders (market_id, market_option_id, outcome_side, action, price_cents, created_at)
  WHERE status IN ('open', 'partially_filled');

CREATE INDEX IF NOT EXISTS idx_clob_orders_user
  ON public.clob_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clob_orders_expiry
  ON public.clob_orders (expires_at)
  WHERE status IN ('open', 'partially_filled') AND expires_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Immutable trade prints (fills).
--    match_kind: 'direct' (share transfer), 'mint' ($1 splits into YES+NO),
--                'burn' (YES+NO recombine to $1) — phase 1b'.
--    price_cents printed here is the TAKER's execution price on outcome_side.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clob_fills (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id         uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  market_option_id  uuid REFERENCES public.market_options(id) ON DELETE CASCADE,
  outcome_side      public.order_side NOT NULL,
  price_cents       numeric(4,1) NOT NULL,
  size              numeric(20,6) NOT NULL,
  match_kind        text NOT NULL CHECK (match_kind IN ('direct','mint','burn')),
  taker_order_id    uuid REFERENCES public.clob_orders(id) ON DELETE SET NULL,
  maker_order_id    uuid REFERENCES public.clob_orders(id) ON DELETE SET NULL,
  taker_user_id     uuid NOT NULL,
  maker_user_id     uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clob_fills_book
  ON public.clob_fills (market_id, market_option_id, outcome_side, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clob_fills_taker ON public.clob_fills (taker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clob_fills_maker ON public.clob_fills (maker_user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. Row-Level Security: a user reads/writes only their own orders.
--    Fills visible only to the two participants. All matching happens via
--    SECURITY DEFINER RPCs (which bypass RLS); aggregated depth is exposed
--    via clob_get_book (definer) so counterparty identity never leaks.
-- ---------------------------------------------------------------------
ALTER TABLE public.clob_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clob_fills  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clob_orders_owner_select ON public.clob_orders;
CREATE POLICY clob_orders_owner_select ON public.clob_orders
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS clob_orders_owner_cud ON public.clob_orders;
CREATE POLICY clob_orders_owner_cud ON public.clob_orders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS clob_fills_participant_select ON public.clob_fills;
CREATE POLICY clob_fills_participant_select ON public.clob_fills
  FOR SELECT USING (taker_user_id = auth.uid() OR maker_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. clob_get_book: aggregated depth for ONE (market, option, side) book,
--    in the YES/NO-of-side perspective PM shows in the inline drawer.
--    bids  = resting BUY <side> orders, aggregated by price desc.
--    asks  = synthesized from resting BUY <complement> orders: a BUY NO @ q
--            offers to sell YES at (100 - q) via mint. Aggregated asc.
--    last  = most recent fill on this side; spread = best_ask - best_bid.
--    SECURITY DEFINER — public/aggregated, no user identity exposed.
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
  -- Bids: resting BUY orders on this side.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('price', price, 'size', size) ORDER BY price DESC), '[]'::jsonb)
    INTO v_bids
  FROM (
    SELECT price_cents AS price,
           SUM(size - filled) AS size
    FROM public.clob_orders
    WHERE market_id = p_market_id
      AND market_option_id IS NOT DISTINCT FROM p_market_option_id
      AND outcome_side = p_outcome_side
      AND action = 'buy'
      AND status IN ('open','partially_filled')
      AND (expires_at IS NULL OR expires_at > now())
    GROUP BY price_cents
    HAVING SUM(size - filled) > 0
  ) t;

  -- Asks: synthesized from BUY <complement> @ q -> ask at (100 - q).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('price', price, 'size', size) ORDER BY price ASC), '[]'::jsonb)
    INTO v_asks
  FROM (
    SELECT (100 - price_cents)::numeric(4,1) AS price,
           SUM(size - filled) AS size
    FROM public.clob_orders
    WHERE market_id = p_market_id
      AND market_option_id IS NOT DISTINCT FROM p_market_option_id
      AND outcome_side = v_comp
      AND action = 'buy'
      AND status IN ('open','partially_filled')
      AND (expires_at IS NULL OR expires_at > now())
    GROUP BY price_cents
    HAVING SUM(size - filled) > 0
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
                   THEN v_best_ask - v_best_bid ELSE NULL END
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7. clob_place_order: BUY-side matching (complementary mint) + rest.
--    Atomic: escrow, positions, transactions, fills, price_history and
--    market_activity all in one SECURITY DEFINER call with row locks.
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
  v_market        public.markets%ROWTYPE;
  v_option        public.market_options%ROWTYPE;
  v_wallet        public.wallets%ROWTYPE;
  v_rate          numeric;
  v_comp          public.order_side := CASE WHEN p_outcome_side = 'yes' THEN 'no' ELSE 'yes' END;
  v_limit_c       numeric(4,1);
  v_remaining     numeric(20,6);
  v_filled        numeric(20,6) := 0;
  v_cost_usd      numeric := 0;         -- taker spent, USD
  v_maker         RECORD;
  v_maker_avail   numeric(20,6);
  v_fill          numeric(20,6);
  v_q             numeric(4,1);
  v_taker_price   numeric(4,1);
  v_taker_cost    numeric;              -- per-match taker cost USD
  v_maker_cost    numeric;             -- per-match maker cost USD
  v_maker_cost_l  numeric;             -- maker cost local
  v_maker_status  public.order_status;
  v_order_id      uuid;
  v_taker_order   uuid;
  v_cost_local    numeric;
  v_rest          numeric(20,6);
  v_reserve_usd   numeric;
  v_reserve_local numeric;
  v_avg_price     numeric;
  v_status        public.order_status;
  v_fills         jsonb := '[]'::jsonb;
  v_txn_id        uuid;
BEGIN
  -- ---- validation --------------------------------------------------
  IF p_action <> 'buy' THEN
    RAISE EXCEPTION 'CLOB phase 1b supports buy orders only (sell/burn arrives in 1b'')' USING ERRCODE='P0100';
  END IF;
  IF p_market_option_id IS NULL THEN
    RAISE EXCEPTION 'CLOB phase 1b requires a market_option_id (per-candidate book)' USING ERRCODE='P0101';
  END IF;
  IF p_size IS NULL OR p_size <= 0 THEN
    RAISE EXCEPTION 'size must be > 0' USING ERRCODE='P0102';
  END IF;

  SELECT * INTO v_market FROM public.markets WHERE id = p_market_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found or not active' USING ERRCODE='P0001'; END IF;
  IF v_market.closes_at < now() THEN RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE='P0002'; END IF;
  IF v_market.pricing_engine <> 'clob' THEN
    RAISE EXCEPTION 'Market is not a CLOB market' USING ERRCODE='P0103';
  END IF;

  SELECT * INTO v_option FROM public.market_options
  WHERE id = p_market_option_id AND market_id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Option not found for market' USING ERRCODE='P0007'; END IF;

  -- price / tick
  IF p_order_type = 'limit' THEN
    IF p_price_cents IS NULL THEN RAISE EXCEPTION 'limit order needs price_cents' USING ERRCODE='P0104'; END IF;
    v_limit_c := LEAST(99.9, GREATEST(0.1, ROUND(p_price_cents * 10) / 10.0));
  ELSE
    v_limit_c := 99.9;  -- market buy: accept any complementary price
  END IF;

  -- FX
  SELECT rate INTO v_rate FROM public.exchange_rates WHERE from_currency = p_currency AND to_currency = 'USD';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE='P0003'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE='P0005'; END IF;

  v_remaining := p_size;

  -- ---- create the taker order row up-front (for fill FK) ------------
  INSERT INTO public.clob_orders (
    market_id, market_option_id, user_id, wallet_id, outcome_side, action,
    order_type, price_cents, size, filled, status, currency, exchange_rate_to_usd,
    reserved_usd, client_order_id, expires_at,
    metadata
  ) VALUES (
    p_market_id, p_market_option_id, p_user_id, v_wallet.id, p_outcome_side, 'buy',
    p_order_type, CASE WHEN p_order_type='limit' THEN v_limit_c ELSE NULL END,
    p_size, 0, 'open', p_currency, v_rate,
    0, p_client_order_id, p_expires_at,
    jsonb_build_object('engine','clob')
  ) RETURNING id INTO v_taker_order;

  -- ---- MINT matching loop: BUY <side> crosses resting BUY <comp> ----
  -- Best for taker = highest complementary q (lowest taker cost 100-q),
  -- then oldest. Constraint p + q >= 100  <=>  q >= 100 - limit.
  FOR v_maker IN
    SELECT * FROM public.clob_orders
    WHERE market_id = p_market_id
      AND market_option_id IS NOT DISTINCT FROM p_market_option_id
      AND outcome_side = v_comp
      AND action = 'buy'
      AND status IN ('open','partially_filled')
      AND user_id <> p_user_id                       -- self-match prevention
      AND (expires_at IS NULL OR expires_at > now())
      AND price_cents >= (100 - v_limit_c)
    ORDER BY price_cents DESC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_maker_avail := v_maker.size - v_maker.filled;
    IF v_maker_avail <= 0 THEN CONTINUE; END IF;

    v_fill        := LEAST(v_remaining, v_maker_avail);
    v_q           := v_maker.price_cents;
    v_taker_price := (100 - v_q)::numeric(4,1);
    v_taker_cost  := ROUND(v_fill * v_taker_price / 100.0, 8);
    v_maker_cost  := ROUND(v_fill * v_q / 100.0, 8);

    -- advance maker order + release its escrow proportionally (it is spent)
    v_maker_status := CASE WHEN (v_maker.filled + v_fill) >= v_maker.size
                           THEN 'filled' ELSE 'partially_filled' END;
    UPDATE public.clob_orders SET
      filled       = filled + v_fill,
      reserved_usd = GREATEST(0, reserved_usd - v_maker_cost),
      status       = v_maker_status,
      updated_at   = now()
    WHERE id = v_maker.id;

    -- maker wallet: escrow spent (reserved -> gone), shares received
    v_maker_cost_l := ROUND(v_maker_cost / v_maker.exchange_rate_to_usd, 2);
    UPDATE public.wallets SET
      reserved_balance = GREATEST(0, reserved_balance - v_maker_cost_l),
      updated_at = now()
    WHERE id = v_maker.wallet_id;

    -- maker position: NO(comp) side @ q
    INSERT INTO public.positions (
      user_id, market_id, wallet_id, market_option_id, side, shares,
      total_invested_usd, avg_entry_price, current_value_usd
    ) VALUES (
      v_maker.user_id, p_market_id, v_maker.wallet_id, p_market_option_id,
      v_comp::text::position_side, v_fill, v_maker_cost, ROUND(v_q/100.0, 6),
      v_fill * (v_q/100.0)
    )
    ON CONFLICT (user_id, market_id, market_option_id, side)
      WHERE market_option_id IS NOT NULL AND side IS NOT NULL
    DO UPDATE SET
      shares = public.positions.shares + v_fill,
      total_invested_usd = public.positions.total_invested_usd + v_maker_cost,
      avg_entry_price = (public.positions.total_invested_usd + v_maker_cost)
                        / NULLIF(public.positions.shares + v_fill, 0),
      current_value_usd = (public.positions.shares + v_fill) * (v_q/100.0),
      is_active = TRUE, updated_at = now();

    -- maker transaction (escrow already reserved; record the spend)
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd,
      exchange_rate_to_usd, balance_before, balance_after, market_id,
      market_option_id, description, idempotency_key, payment_metadata
    ) VALUES (
      v_maker.user_id, v_maker.wallet_id, 'bet_placed', 'completed',
      v_maker_cost_l, v_maker.currency, v_maker_cost, v_maker.exchange_rate_to_usd,
      0, 0, p_market_id, p_market_option_id,
      FORMAT('CLOB mint %s @ %s¢ (%s shares)', UPPER(v_comp::text), v_q, v_fill),
      FORMAT('clob_mint_%s_%s', v_maker.id, gen_random_uuid()),
      jsonb_build_object('clob_order_id', v_maker.id, 'engine', 'clob', 'role', 'maker', 'match_kind', 'mint')
    );

    -- fill print (taker perspective)
    INSERT INTO public.clob_fills (
      market_id, market_option_id, outcome_side, price_cents, size, match_kind,
      taker_order_id, maker_order_id, taker_user_id, maker_user_id
    ) VALUES (
      p_market_id, p_market_option_id, p_outcome_side, v_taker_price, v_fill, 'mint',
      v_taker_order, v_maker.id, p_user_id, v_maker.user_id
    );

    v_fills := v_fills || jsonb_build_object(
      'price_cents', v_taker_price, 'size', v_fill, 'match_kind', 'mint',
      'maker_order_id', v_maker.id);

    v_cost_usd  := v_cost_usd + v_taker_cost;
    v_filled    := v_filled + v_fill;
    v_remaining := v_remaining - v_fill;
  END LOOP;

  -- ---- taker settlement -------------------------------------------
  v_cost_local := ROUND(v_cost_usd / v_rate, 2);
  v_rest       := CASE WHEN p_order_type = 'limit' THEN v_remaining ELSE 0 END;
  v_reserve_usd   := ROUND(v_rest * v_limit_c / 100.0, 8);
  v_reserve_local := ROUND(v_reserve_usd / v_rate, 2);

  IF v_wallet.available_balance < (v_cost_local + v_reserve_local) THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
      v_wallet.available_balance, (v_cost_local + v_reserve_local) USING ERRCODE='P0006';
  END IF;

  -- spent leaves available; escrow for resting remainder moves to reserved
  UPDATE public.wallets SET
    available_balance = available_balance - v_cost_local - v_reserve_local,
    reserved_balance  = reserved_balance + v_reserve_local,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- taker position (side) at blended fill price
  IF v_filled > 0 THEN
    v_avg_price := v_cost_usd / v_filled;
    INSERT INTO public.positions (
      user_id, market_id, wallet_id, market_option_id, side, shares,
      total_invested_usd, avg_entry_price, current_value_usd
    ) VALUES (
      p_user_id, p_market_id, v_wallet.id, p_market_option_id,
      p_outcome_side::text::position_side, v_filled, v_cost_usd,
      ROUND(v_avg_price, 6), v_filled * v_avg_price
    )
    ON CONFLICT (user_id, market_id, market_option_id, side)
      WHERE market_option_id IS NOT NULL AND side IS NOT NULL
    DO UPDATE SET
      shares = public.positions.shares + v_filled,
      total_invested_usd = public.positions.total_invested_usd + v_cost_usd,
      avg_entry_price = (public.positions.total_invested_usd + v_cost_usd)
                        / NULLIF(public.positions.shares + v_filled, 0),
      current_value_usd = (public.positions.shares + v_filled) * ROUND(v_avg_price,6),
      is_active = TRUE, updated_at = now();
  END IF;

  -- final taker order status
  IF v_rest > 0 THEN
    v_status := CASE WHEN v_filled > 0 THEN 'partially_filled' ELSE 'open' END;
  ELSE
    v_status := CASE WHEN v_filled > 0 THEN 'filled' ELSE 'cancelled' END;  -- market remainder dropped
  END IF;

  UPDATE public.clob_orders SET
    filled = v_filled, status = v_status, reserved_usd = v_reserve_usd, updated_at = now()
  WHERE id = v_taker_order
  RETURNING id INTO v_order_id;

  -- taker transaction for the spent amount
  IF v_cost_local > 0 THEN
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd,
      exchange_rate_to_usd, balance_before, balance_after, market_id,
      market_option_id, description, idempotency_key, payment_metadata
    ) VALUES (
      p_user_id, v_wallet.id, 'bet_placed', 'completed',
      v_cost_local, p_currency, v_cost_usd, v_rate,
      v_wallet.available_balance, v_wallet.available_balance - v_cost_local - v_reserve_local,
      p_market_id, p_market_option_id,
      FORMAT('CLOB %s %s (%s shares @ avg %s¢)', UPPER(p_outcome_side::text),
             v_option.label, v_filled, ROUND(COALESCE(v_avg_price,0)*100, 1)),
      COALESCE(p_client_order_id, FORMAT('clob_%s', v_order_id)),
      jsonb_build_object('clob_order_id', v_order_id, 'engine', 'clob', 'role', 'taker')
    ) RETURNING id INTO v_txn_id;
  END IF;

  -- market stats + price history + activity (only if we traded)
  IF v_filled > 0 THEN
    UPDATE public.markets SET
      total_volume_usd = total_volume_usd + v_cost_usd,
      total_bets = total_bets + 1,
      last_trade_at = now(),
      updated_at = now()
    WHERE id = p_market_id;

    UPDATE public.market_options SET
      volume_usd = COALESCE(volume_usd,0) + v_cost_usd,
      updated_at = now()
    WHERE id = p_market_option_id;

    INSERT INTO public.price_history (market_id, market_option_id, price, volume_usd)
    VALUES (p_market_id, p_market_option_id, ROUND(v_avg_price, 6), v_cost_usd);

    INSERT INTO public.market_activity (market_id, user_id, market_option_id, action, amount_usd, side, price)
    VALUES (p_market_id, p_user_id, p_market_option_id,
            CASE WHEN p_outcome_side='yes' THEN 'bet_yes' ELSE 'bet_no' END,
            v_cost_usd, p_outcome_side, ROUND(v_avg_price, 6));
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'transaction_id', v_txn_id,
    'status', v_status,
    'filled_shares', v_filled,
    'resting_shares', v_rest,
    'avg_fill_price_cents', CASE WHEN v_filled > 0 THEN ROUND(v_avg_price*100, 1) ELSE NULL END,
    'cost_usd', ROUND(v_cost_usd, 6),
    'cost_local', v_cost_local,
    'reserved_local', v_reserve_local,
    'fills', v_fills
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 8. clob_cancel_order: release the escrow held for the unfilled remainder.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clob_cancel_order(
  p_order_id uuid,
  p_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.clob_orders%ROWTYPE;
  v_release numeric;
BEGIN
  SELECT * INTO v_order FROM public.clob_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0110'; END IF;
  IF v_order.user_id <> p_user_id THEN RAISE EXCEPTION 'Not your order' USING ERRCODE='P0111'; END IF;
  IF v_order.status NOT IN ('open','partially_filled') THEN
    RAISE EXCEPTION 'Order is not cancellable (status=%)', v_order.status USING ERRCODE='P0112';
  END IF;

  v_release := ROUND(v_order.reserved_usd / v_order.exchange_rate_to_usd, 2);
  IF v_release > 0 THEN
    UPDATE public.wallets SET
      available_balance = available_balance + v_release,
      reserved_balance  = GREATEST(0, reserved_balance - v_release),
      updated_at = now()
    WHERE id = v_order.wallet_id;
  END IF;

  UPDATE public.clob_orders SET status = 'cancelled', reserved_usd = 0, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', TRUE, 'order_id', p_order_id, 'released_local', v_release);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants. Matching RPCs run as definer; called from the API (service
--    role) and by authenticated users. Book is public/aggregated.
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.clob_get_book(uuid, uuid, public.order_side) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clob_place_order(uuid, uuid, uuid, public.order_side, public.clob_action, public.order_type, numeric, numeric, public.currency_code, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clob_cancel_order(uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.clob_orders IS 'CLOB resting/working orders (per-candidate YES/NO books). Migration 030.';
COMMENT ON TABLE public.clob_fills  IS 'CLOB immutable trade prints (mint/direct/burn). Migration 030.';
COMMENT ON COLUMN public.markets.pricing_engine IS 'amm (LMSR/simplex/independent) | clob (order book). Migration 030.';
