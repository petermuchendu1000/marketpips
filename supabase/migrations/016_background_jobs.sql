-- ============================================================
-- MarketPips - Migration 016: Background jobs infrastructure
-- ============================================================
-- Module 12 (Background jobs). Provides the DB-side substrate the four cron
-- workers run against, plus job-run observability and an operator helper to
-- schedule everything with pg_cron + pg_net.
--
-- Design notes
-- ------------
-- * All mutating job RPCs are SECURITY DEFINER, run with a pinned search_path,
--   and are EXECUTE-granted to `service_role` ONLY (the workers authenticate as
--   the service role behind the CRON_SECRET-gated Next.js endpoints). PUBLIC /
--   anon / authenticated cannot invoke them.
-- * Jobs are idempotent and safe to run concurrently / re-run: close-markets is
--   a set-based transition guarded by status; resolution flagging uses a
--   `resolution_flagged_at` high-water mark so reminders are not re-sent; the FX
--   upsert is an ON CONFLICT merge.
-- * Every run is recorded in `job_runs` for observability, alerting, and audit.
-- * NO financial auto-resolution: resolve-market only *flags* due markets and
--   notifies the resolver/admin cohort. Paying out winners stays a deliberate,
--   audited human action (`admin_resolve_market` -> `resolve_market`). This
--   keeps the blast radius of an automated job to zero real-money movement.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Schema additions
-- ------------------------------------------------------------
-- High-water mark so the resolution reminder is enqueued at most once per market
-- (until an operator clears it or the market resolves). NULL = never flagged.
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS resolution_flagged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.markets.resolution_flagged_at IS
  'When the resolve-market cron last enqueued a "resolution due" reminder for '
  'this market. Prevents duplicate reminders; cleared on resolution/cancel.';

-- Partial index: the resolve-market worker scans exactly this predicate.
CREATE INDEX IF NOT EXISTS idx_markets_resolution_due
  ON public.markets (resolves_at)
  WHERE status = 'closed' AND resolution_flagged_at IS NULL;

-- The close-markets worker scans active markets by close time.
CREATE INDEX IF NOT EXISTS idx_markets_active_closes_at
  ON public.markets (closes_at)
  WHERE status = 'active';

-- ------------------------------------------------------------
-- 1. Job-run observability
-- ------------------------------------------------------------
-- One row per worker invocation. `status` is derived by the caller from the
-- outcome counts (success / partial / failed). `result` holds a compact,
-- structured summary for dashboards and alerting.
CREATE TABLE IF NOT EXISTS public.job_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  result       JSONB,
  error        TEXT,
  request_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.job_runs IS
  'Append-only audit/observability log of background-job invocations '
  '(Module 12). Written by the service role via record_job_start/finish.';

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON public.job_runs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status
  ON public.job_runs (status) WHERE status IN ('partial', 'failed');

-- RLS: locked down. service_role bypasses RLS; admins read via the admin client.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- Staff with the audit/observability read capability may read the job-run log.
DROP POLICY IF EXISTS job_runs_admin_read ON public.job_runs;
CREATE POLICY job_runs_admin_read ON public.job_runs
  FOR SELECT USING (public.has_capability('audit:read'));

-- Record the start of a run; returns the run id the worker carries to finish.
CREATE OR REPLACE FUNCTION public.record_job_start(
  p_job_name   TEXT,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.job_runs (job_name, status, request_id)
  VALUES (p_job_name, 'running', p_request_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Finalize a run with its derived status, structured result, and timing.
CREATE OR REPLACE FUNCTION public.record_job_finish(
  p_id     UUID,
  p_status TEXT,
  p_result JSONB DEFAULT NULL,
  p_error  TEXT  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('success', 'partial', 'failed') THEN
    RAISE EXCEPTION 'Invalid job status: %', p_status USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.job_runs
     SET status      = p_status,
         result      = COALESCE(p_result, result),
         error       = p_error,
         finished_at = NOW(),
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::INT)
   WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- 2. close-markets: active -> closed once trading window has passed
-- ------------------------------------------------------------
-- Set-based, idempotent, and re-run safe (the status guard makes a second run a
-- no-op). Writes a system audit row per market (actor_id NULL = system) and an
-- in-app notice to each holder of an active position. Returns a compact summary.
CREATE OR REPLACE FUNCTION public.close_due_markets(
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids            UUID[];
  v_closed         INTEGER := 0;
  v_notified       INTEGER := 0;
  v_limit          INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
BEGIN
  -- Select & lock the due markets, then flip them in one statement. FOR UPDATE
  -- SKIP LOCKED keeps concurrent runs from fighting over the same rows.
  WITH due AS (
    SELECT id
      FROM public.markets
     WHERE status = 'active'
       AND closes_at <= NOW()
     ORDER BY closes_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE public.markets m
       SET status = 'closed', updated_at = NOW()
      FROM due
     WHERE m.id = due.id
     RETURNING m.id
  )
  SELECT array_agg(id) INTO v_ids FROM moved;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('closed', 0, 'notified', 0, 'market_ids', '[]'::jsonb);
  END IF;

  v_closed := array_length(v_ids, 1);

  -- System audit trail (one row per closed market).
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  SELECT NULL, 'market.auto_close', 'market', m.id,
         jsonb_build_object('status', 'active', 'closes_at', m.closes_at),
         jsonb_build_object('status', 'closed', 'via', 'cron:close-markets')
    FROM public.markets m
   WHERE m.id = ANY(v_ids);

  -- Notify each distinct holder of an active position that their market closed
  -- and now awaits resolution. In-app only (system_announcement default = no
  -- SMS/email), so no provider fan-out from a batch job.
  WITH holders AS (
    SELECT DISTINCT p.user_id, p.market_id, m.title
      FROM public.positions p
      JOIN public.markets m ON m.id = p.market_id
     WHERE p.market_id = ANY(v_ids)
       AND p.is_active = TRUE
  ), ins AS (
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT h.user_id, 'system_announcement',
           'Market closed',
           'Trading has closed for "' || h.title || '". It now awaits resolution.',
           jsonb_build_object('market_id', h.market_id, 'event', 'market_closed')
      FROM holders h
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_notified FROM ins;

  RETURN jsonb_build_object(
    'closed', v_closed,
    'notified', v_notified,
    'market_ids', to_jsonb(v_ids)
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. resolve-market: flag closed markets whose resolution is due
-- ------------------------------------------------------------
-- Deliberately does NOT pay out. It (a) marks closed markets whose resolves_at
-- has passed with a high-water mark so we only remind once, and (b) enqueues an
-- in-app notice to the resolver/admin cohort so a human can resolve with the
-- correct outcome via admin_resolve_market. Financial settlement stays manual.
CREATE OR REPLACE FUNCTION public.flag_markets_due_for_resolution(
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids       UUID[];
  v_flagged   INTEGER := 0;
  v_notified  INTEGER := 0;
  v_limit     INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
BEGIN
  WITH due AS (
    SELECT id
      FROM public.markets
     WHERE status = 'closed'
       AND resolves_at IS NOT NULL
       AND resolves_at <= NOW()
       AND resolution_flagged_at IS NULL
     ORDER BY resolves_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ), flagged AS (
    UPDATE public.markets m
       SET resolution_flagged_at = NOW(), updated_at = NOW()
      FROM due
     WHERE m.id = due.id
     RETURNING m.id
  )
  SELECT array_agg(id) INTO v_ids FROM flagged;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('flagged', 0, 'notified', 0, 'market_ids', '[]'::jsonb);
  END IF;

  v_flagged := array_length(v_ids, 1);

  -- System audit trail.
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  SELECT NULL, 'market.resolution_due', 'market', m.id,
         jsonb_build_object('status', 'closed', 'resolves_at', m.resolves_at),
         jsonb_build_object('flagged_at', NOW(), 'via', 'cron:resolve-market')
    FROM public.markets m
   WHERE m.id = ANY(v_ids);

  -- Notify the resolution cohort: any role that grants markets:resolve, plus the
  -- always-privileged admin/superadmin roles. One notice per market per staffer.
  WITH resolvers AS (
    SELECT DISTINCT pr.id AS user_id
      FROM public.profiles pr
     WHERE pr.role IN ('admin', 'superadmin', 'resolver')
        OR pr.role::text IN (
             SELECT role::text FROM public.role_permissions WHERE capability = 'markets:resolve'
           )
  ), targets AS (
    SELECT r.user_id, m.id AS market_id, m.title
      FROM resolvers r
      CROSS JOIN public.markets m
     WHERE m.id = ANY(v_ids)
  ), ins AS (
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT t.user_id, 'system_announcement',
           'Market awaiting resolution',
           'Market "' || t.title || '" is past its resolution time and needs a resolver.',
           jsonb_build_object('market_id', t.market_id, 'event', 'resolution_due')
      FROM targets t
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_notified FROM ins;

  RETURN jsonb_build_object(
    'flagged', v_flagged,
    'notified', v_notified,
    'market_ids', to_jsonb(v_ids)
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. update-exchange-rates: upsert live local->USD rates
-- ------------------------------------------------------------
-- Accepts a JSON array of { from_currency, rate } objects (rates are
-- local -> USD, matching exchange_rates.to_currency = 'USD'). Validates each
-- row against the currency_code enum and rate > 0, then upserts. Rows for
-- unknown currencies or non-positive rates are skipped (never overwrite a good
-- rate with garbage). Returns the count upserted and skipped.
CREATE OR REPLACE FUNCTION public.upsert_exchange_rates(
  p_rates  JSONB,
  p_source TEXT DEFAULT 'cron'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      JSONB;
  v_code     TEXT;
  v_rate     NUMERIC;
  v_upserted INTEGER := 0;
  v_skipped  INTEGER := 0;
BEGIN
  IF p_rates IS NULL OR jsonb_typeof(p_rates) <> 'array' THEN
    RAISE EXCEPTION 'p_rates must be a JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rates)
  LOOP
    v_code := upper(NULLIF(v_row->>'from_currency', ''));
    BEGIN
      v_rate := (v_row->>'rate')::NUMERIC;
    EXCEPTION WHEN others THEN
      v_rate := NULL;
    END;

    -- Skip unknown enum values, USD self-rate, and non-positive/NULL rates.
    IF v_code IS NULL
       OR v_code = 'USD'
       OR NOT EXISTS (SELECT 1 FROM pg_enum e
                        JOIN pg_type t ON t.oid = e.enumtypid
                       WHERE t.typname = 'currency_code' AND e.enumlabel = v_code)
       OR v_rate IS NULL OR v_rate <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.exchange_rates (from_currency, to_currency, rate, source, fetched_at)
    VALUES (v_code::currency_code, 'USD', v_rate, COALESCE(p_source, 'cron'), NOW())
    ON CONFLICT (from_currency, to_currency)
    DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at;

    v_upserted := v_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted, 'skipped', v_skipped);
END;
$$;

-- ------------------------------------------------------------
-- 5. Grants: service_role only for the mutating job RPCs
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_job_start(TEXT, TEXT)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_job_finish(UUID, TEXT, JSONB, TEXT)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_due_markets(INTEGER)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.flag_markets_due_for_resolution(INTEGER)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_exchange_rates(JSONB, TEXT)           FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_job_start(TEXT, TEXT)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.record_job_finish(UUID, TEXT, JSONB, TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.close_due_markets(INTEGER)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_markets_due_for_resolution(INTEGER)     TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_exchange_rates(JSONB, TEXT)           TO service_role;

-- ------------------------------------------------------------
-- 6. Scheduling helper (pg_cron + pg_net)
-- ------------------------------------------------------------
-- Idempotent operator helper: schedules all four workers to hit the deployed
-- Next.js /api/cron endpoints with the CRON_SECRET header. Call ONCE per
-- environment from the SQL editor (secrets never live in migrations):
--
--   SELECT public.schedule_marketpips_jobs(
--     'https://app.marketpips.co.ke', '<CRON_SECRET>');
--
-- Requires the pg_cron and pg_net extensions (Supabase: enable in Dashboard >
-- Database > Extensions). The function no-ops with a clear message if missing,
-- so this migration is safe to run on environments without them (e.g. CI).
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

  -- Unschedule prior definitions so this is safe to re-run.
  PERFORM cron.unschedule(jobname)
     FROM cron.job
    WHERE jobname IN ('marketpips-close-markets','marketpips-resolve-market',
                      'marketpips-update-exchange-rates','marketpips-send-notifications');

  -- close-markets: every 5 minutes.
  PERFORM cron.schedule('marketpips-close-markets', '*/5 * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/close-markets', v_hdr::text));

  -- resolve-market: every 15 minutes.
  PERFORM cron.schedule('marketpips-resolve-market', '*/15 * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/resolve-market', v_hdr::text));

  -- update-exchange-rates: every 6 hours.
  PERFORM cron.schedule('marketpips-update-exchange-rates', '0 */6 * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/update-exchange-rates', v_hdr::text));

  -- send-notifications: every minute (outbox worker).
  PERFORM cron.schedule('marketpips-send-notifications', '* * * * *', format(
    $c$ SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) $c$,
    v_base || '/api/cron/send-notifications', v_hdr::text));

  RETURN jsonb_build_object('scheduled', TRUE, 'base_url', v_base, 'jobs', 4);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_marketpips_jobs(TEXT, TEXT) FROM PUBLIC;
-- Intentionally NOT granted to anon/authenticated. Run as the DB owner/service
-- role from the SQL editor during environment setup.
