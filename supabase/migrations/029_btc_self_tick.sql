-- ---------------------------------------------------------------------------
-- 029_btc_self_tick.sql
-- Make the recurring "Bitcoin Up or Down" engine self-sustaining IN THE DATABASE.
--
-- Migration 024 shipped the engine (record_btc_tick / resolve_btc_windows /
-- open_btc_windows) but relied on an external, CRON_SECRET-gated HTTP endpoint
-- being hit every minute by pg_cron. In environments where that scheduler isn't
-- wired up, the windows go stale and the market pages show a closed/empty chart.
--
-- This migration removes that external dependency: it fetches the BTC/USD spot
-- price directly from the database with the `http` extension and drives the full
-- engine tick from a pg_cron job every minute. Coinbase is the same source the
-- oracle settles against (lib/markets/btc-price.ts), so chart and settlement
-- stay consistent.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS http;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- One self-contained engine tick: sample price -> record -> resolve due -> roll.
-- SECURITY DEFINER so the pg_cron job (which runs as the DB owner) can call the
-- service-role-only engine functions.
CREATE OR REPLACE FUNCTION public.btc_tick_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_status  INT;
  v_content TEXT;
  v_price   NUMERIC;
BEGIN
  -- 1) Sample BTC/USD spot in-process (best-effort; a bad sample degrades to a
  --    no-op tick and the next minute recovers).
  BEGIN
    SELECT h.status, h.content INTO v_status, v_content
      FROM http_get('https://api.coinbase.com/v2/prices/BTC-USD/spot') h;
    IF v_status = 200 THEN
      v_price := (v_content::json -> 'data' ->> 'amount')::numeric;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_price := NULL;
  END;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    PERFORM public.record_btc_tick(v_price, 'coinbase-pgcron');
  END IF;

  -- 2) Settle any due windows, then 3) roll a fresh window per series.
  PERFORM public.resolve_btc_windows();
  PERFORM public.open_btc_windows();

  RETURN jsonb_build_object('price', v_price, 'at', now());
END;
$$;

-- (Re)register the every-minute pg_cron job idempotently.
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'marketpips-btc-tick';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule('marketpips-btc-tick', '* * * * *', 'select public.btc_tick_cron();');
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may be unavailable in some environments (e.g. local shadow db);
  -- the engine still works when driven by any external minute scheduler.
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.btc_tick_cron()
  IS 'Self-contained BTC Up/Down engine tick (sample price via http, record, resolve due windows, roll fresh). Driven every minute by the marketpips-btc-tick pg_cron job.';
