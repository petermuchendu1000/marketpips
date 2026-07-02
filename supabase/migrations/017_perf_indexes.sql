-- ============================================================
-- MarketPips - Migration 017: Performance & caching (DB pass)
-- ============================================================
-- Module 15.2. Adds EXPLAIN-driven hot-path indexes, a denormalized 24h
-- market-stats rollup (so the markets grid never aggregates over `orders` at
-- request time), an admin-only slow-query view over pg_stat_statements, and a
-- lightweight refresh function scheduled via the Module 12 background-job
-- pattern. Extends schedule_marketpips_jobs() to wire the new cron.
--
-- Robustness: pg_stat_statements enablement and its dependent view are wrapped
-- in guarded DO blocks so this migration NEVER fails CI/migrate-db on an
-- environment where the extension isn't available. All index creation is
-- IF NOT EXISTS and CONCURRENTLY-free (runs inside the migration transaction).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Hot-path indexes (verified against the markets-list & orders queries)
-- ------------------------------------------------------------
-- Default markets list: status IN (...) ORDER BY total_volume_usd DESC.
CREATE INDEX IF NOT EXISTS idx_markets_status_volume
  ON public.markets (status, total_volume_usd DESC);

-- "Newest" markets sort: status IN (...) ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_markets_status_created
  ON public.markets (status, created_at DESC);

-- 24h rollup scan + per-market recent trades: orders by market and time,
-- restricted to actually-executed volume.
CREATE INDEX IF NOT EXISTS idx_orders_market_created
  ON public.orders (market_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_filled
  ON public.orders (created_at)
  WHERE filled_usd > 0;

-- ------------------------------------------------------------
-- 2. 24h market-stats rollup columns
-- ------------------------------------------------------------
-- Denormalized, refreshed on a schedule. Reads (markets grid, market cards) use
-- these instead of aggregating `orders` on every request.
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS volume_24h_usd DECIMAL(20,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trades_24h     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_trade_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.markets.volume_24h_usd IS
  'Denormalized executed volume (USD) over the trailing 24h. Refreshed by the '
  'refresh_market_stats() cron (Module 15). Not authoritative for money.';

-- ------------------------------------------------------------
-- 3. refresh_market_stats(): recompute the trailing-24h rollup
-- ------------------------------------------------------------
-- Set-based, idempotent. Recomputes volume/trades/last-trade for every market
-- that is active or closed (resolved/cancelled markets are inert). Zeroes out
-- markets whose 24h window has rolled past their last trade. service_role only.
CREATE OR REPLACE FUNCTION public.refresh_market_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH windowed AS (
    SELECT o.market_id,
           COALESCE(SUM(o.filled_usd), 0)          AS vol_24h,
           COUNT(*) FILTER (WHERE o.filled_usd > 0) AS trades_24h,
           MAX(o.created_at) FILTER (WHERE o.filled_usd > 0) AS last_trade
      FROM public.orders o
     WHERE o.created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY o.market_id
  ), upd AS (
    UPDATE public.markets m
       SET volume_24h_usd = COALESCE(w.vol_24h, 0),
           trades_24h     = COALESCE(w.trades_24h, 0),
           last_trade_at  = COALESCE(w.last_trade, m.last_trade_at),
           updated_at     = NOW()
      FROM (
        -- Left join every refreshable market to its window so markets that fell
        -- out of the 24h window are reset to zero.
        SELECT mk.id AS market_id, wd.vol_24h, wd.trades_24h, wd.last_trade
          FROM public.markets mk
          LEFT JOIN windowed wd ON wd.market_id = mk.id
         WHERE mk.status IN ('active', 'closed')
      ) w
     WHERE m.id = w.market_id
       AND (m.volume_24h_usd IS DISTINCT FROM COALESCE(w.vol_24h, 0)
            OR m.trades_24h  IS DISTINCT FROM COALESCE(w.trades_24h, 0))
     RETURNING m.id
  )
  SELECT COUNT(*) INTO v_updated FROM upd;

  RETURN jsonb_build_object('updated', v_updated, 'at', NOW());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_market_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.refresh_market_stats() TO service_role;

-- ------------------------------------------------------------
-- 4. pg_stat_statements + admin slow-query view (guarded)
-- ------------------------------------------------------------
-- Enable the extension if we're allowed to; never fail the migration if not.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
    RAISE NOTICE 'pg_stat_statements unavailable; skipping (enable via dashboard).';
  END;
END;
$$;

-- Create the slow-query view only if the extension is present. Restricted to
-- the audit/observability capability holders and service_role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    EXECUTE $ddl$
      CREATE OR REPLACE VIEW public.slow_queries AS
      SELECT queryid,
             query,
             calls,
             round(total_exec_time::numeric, 2)          AS total_ms,
             round(mean_exec_time::numeric, 2)           AS mean_ms,
             round(max_exec_time::numeric, 2)            AS max_ms,
             rows
        FROM pg_stat_statements
       ORDER BY mean_exec_time DESC
       LIMIT 100
    $ddl$;
    EXECUTE 'REVOKE ALL ON public.slow_queries FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.slow_queries TO service_role';
  ELSE
    RAISE NOTICE 'slow_queries view skipped (pg_stat_statements not installed).';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5. Extend the job scheduler with refresh-market-stats
-- ------------------------------------------------------------
-- CREATE OR REPLACE the Module 12 helper to also schedule the new stats-rollup
-- worker (every 5 minutes). Idempotent; no-ops without pg_cron/pg_net.
CREATE OR REPLACE FUNCTION public.schedule_marketpips_jobs(
  p_base_url     TEXT,
  p_cron_secret  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
     FROM cron.job
    WHERE jobname IN ('marketpips-close-markets','marketpips-resolve-market',
                      'marketpips-update-exchange-rates','marketpips-send-notifications',
                      'marketpips-refresh-market-stats');

  PERFORM cron.schedule('marketpips-close-markets', '*/5 * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/close-markets', v_hdr::text));

  PERFORM cron.schedule('marketpips-resolve-market', '*/15 * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/resolve-market', v_hdr::text));

  PERFORM cron.schedule('marketpips-update-exchange-rates', '0 */6 * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/update-exchange-rates', v_hdr::text));

  PERFORM cron.schedule('marketpips-send-notifications', '* * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/send-notifications', v_hdr::text));

  PERFORM cron.schedule('marketpips-refresh-market-stats', '*/5 * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/refresh-market-stats', v_hdr::text));

  RETURN jsonb_build_object('scheduled', TRUE, 'base_url', v_base, 'jobs', 5);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_marketpips_jobs(TEXT, TEXT) FROM PUBLIC;
