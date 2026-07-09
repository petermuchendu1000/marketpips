-- 024_btc_recurring_markets.sql
-- ---------------------------------------------------------------------------
-- MarketPips — recurring "Bitcoin Up or Down" short-window markets.
--
-- WHY: the board pins a live BTC price market at the top across the first rows
-- ("Will BTC go up or down in 5M / 15M / 30M / 1H"), mirroring the short trading
-- windows traders expect. Each window is an ordinary `markets` row (binary,
-- category 'crypto', metadata.card_kind='up_down') so it flows through the
-- EXISTING LMSR betting, market-card, detail-page and payout paths unchanged —
-- no bespoke trading engine. This migration adds only the recurring lifecycle:
--
--   • btc_price_ticks   — append-only oracle sample log (auditable price feed)
--   • btc_series_config — the enabled durations + their board pin order
--   • btc_windows       — one row per open/resolved window, linked to a market
--   • record_btc_tick / latest_btc_price      — feed helpers
--   • open_btc_windows  — rolls a fresh window per series as the prior one closes
--   • resolve_btc_windows — auto-settles due windows against the recorded ticks,
--                           paying out through the audited resolve_market() RPC
--   • schedule_marketpips_btc_jobs — pg_cron registration (every minute)
--
-- DESIGN NOTES
--   * Automated resolution is deliberate here (unlike the human-gated
--     resolve-market cron): a 5-minute window cannot wait for a human. The
--     outcome is fully deterministic from the append-only btc_price_ticks log
--     (an oracle), and settlement still runs through resolve_market() so wallet
--     credits, positions and audit rows are produced by the one audited path.
--   * "Up" == YES, "Down" == NO. A window resolves YES iff the settle price is
--     STRICTLY greater than the reference price captured at open (a flat tick is
--     "not up" => NO). This tie rule is stated in each market's criteria.
--   * Everything is additive & idempotent (IF NOT EXISTS / ON CONFLICT / CREATE
--     OR REPLACE) so the migration is safe to re-run.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Oracle tick log ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.btc_price_ticks (
  id          BIGSERIAL PRIMARY KEY,
  price       DECIMAL(20,6) NOT NULL CHECK (price > 0),
  source      TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_price_ticks_observed
  ON public.btc_price_ticks (observed_at DESC, id DESC);

COMMENT ON TABLE public.btc_price_ticks IS
  'Append-only BTC/USD spot samples recorded by the btc-windows cron; the '
  'oracle of record for auto-resolving btc_windows.';

-- 2. Series configuration ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.btc_series_config (
  series_key      TEXT PRIMARY KEY,
  window_seconds  INTEGER NOT NULL CHECK (window_seconds > 0),
  display_label   TEXT NOT NULL,               -- '5M', '15M', ...
  featured_order  INTEGER NOT NULL,            -- pin rank across the board rows
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.btc_series_config (series_key, window_seconds, display_label, featured_order)
VALUES
  ('btc-up-down-5m',   300, '5M',  1),
  ('btc-up-down-15m',  900, '15M', 2),
  ('btc-up-down-30m', 1800, '30M', 3),
  ('btc-up-down-1h',  3600, '1H',  4)
ON CONFLICT (series_key) DO NOTHING;

-- 3. Window lifecycle --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.btc_windows (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id        UUID NOT NULL UNIQUE REFERENCES public.markets(id) ON DELETE CASCADE,
  series_key       TEXT NOT NULL REFERENCES public.btc_series_config(series_key),
  window_seconds   INTEGER NOT NULL,
  reference_price  DECIMAL(20,6) NOT NULL,     -- BTC/USD at open
  settle_price     DECIMAL(20,6),              -- BTC/USD at resolution
  opens_at         TIMESTAMPTZ NOT NULL,
  closes_at        TIMESTAMPTZ NOT NULL,
  resolves_at      TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','resolved','void')),
  resolved_outcome order_side,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btc_windows_series_status
  ON public.btc_windows (series_key, status);
CREATE INDEX IF NOT EXISTS idx_btc_windows_due
  ON public.btc_windows (resolves_at) WHERE status = 'open';

COMMENT ON TABLE public.btc_windows IS
  'Lifecycle row for each recurring BTC Up/Down window; 1:1 with a markets row.';

-- 4. Feed helpers ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_btc_tick(p_price DECIMAL, p_source TEXT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Invalid BTC price: %', p_price USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.btc_price_ticks (price, source)
    VALUES (p_price, COALESCE(NULLIF(p_source, ''), 'unknown'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.latest_btc_price()
RETURNS DECIMAL
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT price FROM public.btc_price_ticks ORDER BY observed_at DESC, id DESC LIMIT 1;
$$;

-- 5. Open rolling windows ----------------------------------------------------
-- Keeps exactly one live window per enabled series. Called every minute by the
-- cron; a no-op for a series whose current window is still open.
CREATE OR REPLACE FUNCTION public.open_btc_windows(
  p_creator            UUID DEFAULT NULL,
  p_resolution_source  TEXT DEFAULT 'https://www.coinbase.com/price/bitcoin'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_creator UUID := p_creator;
  v_price   DECIMAL := public.latest_btc_price();
  v_series  RECORD;
  v_now     TIMESTAMPTZ := NOW();
  v_closes  TIMESTAMPTZ;
  v_market  UUID;
  v_slug    TEXT;
  v_opened  INTEGER := 0;
  v_ids     UUID[] := '{}';
BEGIN
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('opened', 0, 'reason', 'no_price');
  END IF;

  -- Resolve a stable system creator (superadmin first, then any profile).
  IF v_creator IS NULL THEN
    SELECT id INTO v_creator FROM public.profiles
      WHERE role IN ('superadmin', 'admin') ORDER BY created_at LIMIT 1;
  END IF;
  IF v_creator IS NULL THEN
    SELECT id INTO v_creator FROM public.profiles ORDER BY created_at LIMIT 1;
  END IF;
  IF v_creator IS NULL THEN
    RETURN jsonb_build_object('opened', 0, 'reason', 'no_creator');
  END IF;

  FOR v_series IN
    SELECT * FROM public.btc_series_config WHERE enabled ORDER BY featured_order
  LOOP
    -- Already have a live window for this series? leave it be.
    IF EXISTS (
      SELECT 1 FROM public.btc_windows w
      WHERE w.series_key = v_series.series_key
        AND w.status = 'open'
        AND w.closes_at > v_now
    ) THEN
      CONTINUE;
    END IF;

    v_closes := v_now + make_interval(secs => v_series.window_seconds);
    v_slug   := v_series.series_key || '-' || (extract(epoch from v_closes)::bigint)::text;

    INSERT INTO public.markets (
      slug, title, description, category, resolution_type, creator_id,
      status, opens_at, closes_at, resolves_at,
      resolution_criteria, resolution_source,
      yes_price, no_price, liquidity_pool_usd, initial_liquidity_usd,
      is_featured, featured_order, tags, metadata
    ) VALUES (
      v_slug,
      'Bitcoin ' || v_series.display_label || ' — Up or Down?',
      'Will Bitcoin (BTC/USD) be HIGHER than $' ||
        to_char(v_price, 'FM999,999,990.00') || ' when this ' ||
        v_series.display_label ||
        ' window closes? The window opens at the reference price and settles '
        'automatically against the Coinbase BTC-USD spot feed.',
      'crypto', 'binary', v_creator,
      'active', v_now, v_closes, v_closes,
      'Resolves YES (Up) if the Coinbase BTC-USD spot price at close is '
        'STRICTLY greater than the reference price of $' ||
        to_char(v_price, 'FM999,999,990.00') ||
        ' captured at open; otherwise NO (Down). A flat price settles NO.',
      p_resolution_source,
      0.5, 0.5, 0, 100,
      TRUE, v_series.featured_order,
      ARRAY['bitcoin', 'btc', 'crypto', 'live'],
      jsonb_build_object(
        'card_kind', 'up_down', 'asset', 'BTC',
        'yes_label', 'Up', 'no_label', 'Down',
        'series_key', v_series.series_key,
        'window_seconds', v_series.window_seconds,
        'window_label', v_series.display_label,
        'reference_price', v_price, 'live', TRUE
      )
    )
    RETURNING id INTO v_market;

    INSERT INTO public.btc_windows (
      market_id, series_key, window_seconds, reference_price,
      opens_at, closes_at, resolves_at, status
    ) VALUES (
      v_market, v_series.series_key, v_series.window_seconds, v_price,
      v_now, v_closes, v_closes, 'open'
    );

    v_opened := v_opened + 1;
    v_ids := array_append(v_ids, v_market);
  END LOOP;

  RETURN jsonb_build_object('opened', v_opened, 'market_ids', v_ids, 'reference_price', v_price);
END;
$$;

-- 6. Resolve due windows -----------------------------------------------------
-- Settles every window whose resolves_at has passed, from the recorded ticks,
-- through the audited resolve_market() payout path. FOR UPDATE SKIP LOCKED keeps
-- it safe to run concurrently / re-run.
CREATE OR REPLACE FUNCTION public.resolve_btc_windows(
  p_resolver UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_resolver UUID := p_resolver;
  v_w        RECORD;
  v_settle   DECIMAL;
  v_outcome  order_side;
  v_resolved INTEGER := 0;
  v_skipped  INTEGER := 0;
  v_ids      UUID[] := '{}';
BEGIN
  IF v_resolver IS NULL THEN
    SELECT id INTO v_resolver FROM public.profiles
      WHERE role IN ('superadmin', 'admin') ORDER BY created_at LIMIT 1;
  END IF;
  IF v_resolver IS NULL THEN
    SELECT id INTO v_resolver FROM public.profiles ORDER BY created_at LIMIT 1;
  END IF;

  FOR v_w IN
    SELECT * FROM public.btc_windows
    WHERE status = 'open' AND resolves_at <= NOW()
    ORDER BY resolves_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Settle price: first tick at/after close; fallback to the latest tick.
    SELECT price INTO v_settle FROM public.btc_price_ticks
      WHERE observed_at >= v_w.closes_at ORDER BY observed_at ASC, id ASC LIMIT 1;
    IF v_settle IS NULL THEN
      v_settle := public.latest_btc_price();
    END IF;
    IF v_settle IS NULL THEN
      v_skipped := v_skipped + 1;  -- no price yet; a later cron tick will settle it
      CONTINUE;
    END IF;

    v_outcome := CASE WHEN v_settle > v_w.reference_price
                      THEN 'yes'::order_side ELSE 'no'::order_side END;

    -- Pay out through the single audited settlement path.
    PERFORM public.resolve_market(
      v_w.market_id, v_outcome, v_resolver,
      'Auto-resolved BTC ' || v_w.series_key || ' window: settle $' ||
        to_char(v_settle, 'FM999,999,990.00') || ' vs reference $' ||
        to_char(v_w.reference_price, 'FM999,999,990.00')
    );

    UPDATE public.btc_windows
      SET status = 'resolved', settle_price = v_settle, resolved_outcome = v_outcome
      WHERE id = v_w.id;

    UPDATE public.markets
      SET metadata = metadata || jsonb_build_object(
        'live', FALSE, 'settle_price', v_settle, 'settled_outcome', v_outcome)
      WHERE id = v_w.market_id;

    v_resolved := v_resolved + 1;
    v_ids := array_append(v_ids, v_w.market_id);
  END LOOP;

  RETURN jsonb_build_object('resolved', v_resolved, 'skipped', v_skipped, 'market_ids', v_ids);
END;
$$;

-- 7. Lock down execution -----------------------------------------------------
-- Mutating engine functions are service-role only (the CRON_SECRET-gated
-- endpoint runs as service_role). The read helper is safe for the UI.
REVOKE ALL ON FUNCTION public.record_btc_tick(DECIMAL, TEXT)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_btc_windows(UUID, TEXT)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_btc_windows(UUID)              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_btc_tick(DECIMAL, TEXT)       TO service_role;
GRANT EXECUTE ON FUNCTION public.open_btc_windows(UUID, TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_btc_windows(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION public.latest_btc_price()                   TO anon, authenticated, service_role;

-- New tables: internal only. RLS on with no policies => service_role (which
-- bypasses RLS) is the sole accessor; the public board reads `markets`, never these.
ALTER TABLE public.btc_price_ticks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btc_series_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.btc_windows       ENABLE ROW LEVEL SECURITY;

-- 8. pg_cron registration (additive; run once per environment as DB owner) ----
--   SELECT public.schedule_marketpips_btc_jobs('https://app.marketpips.co.ke', '<CRON_SECRET>');
CREATE OR REPLACE FUNCTION public.schedule_marketpips_btc_jobs(
  p_base_url    TEXT,
  p_cron_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_base TEXT := rtrim(p_base_url, '/');
  v_hdr  JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN jsonb_build_object(
      'scheduled', FALSE,
      'reason', 'pg_cron and/or pg_net not installed; enable them then re-run.'
    );
  END IF;

  v_hdr := jsonb_build_object('Content-Type', 'application/json',
                              'x-cron-secret', p_cron_secret);

  PERFORM cron.unschedule(jobname)
     FROM cron.job WHERE jobname = 'marketpips-btc-windows';

  -- Tick + resolve + roll new windows, every minute.
  PERFORM cron.schedule('marketpips-btc-windows', '* * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/btc-windows', v_hdr::text));

  RETURN jsonb_build_object('scheduled', TRUE, 'base_url', v_base, 'jobs', 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_marketpips_btc_jobs(TEXT, TEXT) FROM PUBLIC;

COMMIT;
