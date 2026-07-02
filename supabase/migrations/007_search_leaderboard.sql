-- ============================================================
-- MarketPips - Migration 007  (Module 10: Search & Leaderboard)
-- ------------------------------------------------------------
-- Hardens the baseline scaffolding from migration 002 into a
-- production-grade search + leaderboard subsystem:
--   1. Weighted, STORED full-text `search_vector` column on markets
--      (title=A, tags=B, description=C) + GIN index.
--   2. Trigram index on title for typo/fuzzy fallback (pg_trgm).
--   3. Composite btree indexes for the common filter+sort paths.
--   4. `search_markets()` RPC: ts_rank_cd relevance ranking with a
--      trigram fuzzy fallback, category/status filters, deterministic
--      multi-key sort, and server-side pagination -> single jsonb payload.
--   5. Hardened `leaderboard` materialized view (deterministic ranks,
--      all three metrics, tie-breaks) + CONCURRENT refresh function.
--   6. `get_leaderboard()` RPC: all-time (from matview) plus rolling
--      week/month windows computed from transactions.
--
-- Idempotent & re-runnable. pg_trgm is already enabled (migration 001).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions (defensive; already present)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. WEIGHTED STORED SEARCH VECTOR
-- NOTE: `to_tsvector('english', ...)` is only STABLE (the text->regconfig
-- cast does a catalog lookup), so it cannot be used directly in a GENERATED
-- column. We wrap it in an IMMUTABLE SQL function -- the canonical Postgres
-- workaround -- which pins the regconfig and is safe to index/generate on.
-- ============================================================
CREATE OR REPLACE FUNCTION public.markets_tsv(
  p_title       text,
  p_tags        text[],
  p_description text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT setweight(to_tsvector('english'::regconfig, coalesce(p_title, '')), 'A')
       || setweight(to_tsvector('english'::regconfig, coalesce(array_to_string(p_tags, ' '), '')), 'B')
       || setweight(to_tsvector('english'::regconfig, coalesce(p_description, '')), 'C')
$fn$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'markets'
      AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE public.markets
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (public.markets_tsv(title, tags, description)) STORED;
  END IF;
END$$;

-- Primary FTS index
CREATE INDEX IF NOT EXISTS idx_markets_search_vector
  ON public.markets USING GIN (search_vector);

-- Trigram index on title for fuzzy / typo-tolerant matching
CREATE INDEX IF NOT EXISTS idx_markets_title_trgm
  ON public.markets USING GIN (title gin_trgm_ops);

-- Composite indexes for the browse (no-query) filter+sort paths
CREATE INDEX IF NOT EXISTS idx_markets_status_volume
  ON public.markets (status, total_volume_usd DESC);
CREATE INDEX IF NOT EXISTS idx_markets_status_created
  ON public.markets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_status_closes
  ON public.markets (status, closes_at ASC);

-- The old expression index is superseded by the stored column's GIN index.
DROP INDEX IF EXISTS public.idx_markets_title_search;

-- Keep the convenience view in sync with the weighted vector.
CREATE OR REPLACE VIEW public.market_search AS
SELECT
  m.id, m.slug, m.title, m.description, m.category, m.status,
  m.yes_price, m.no_price, m.total_volume_usd, m.unique_bettors,
  m.closes_at, m.is_featured, m.is_trending, m.tags, m.cover_image_url,
  m.created_at, m.search_vector
FROM public.markets m
WHERE m.status IN ('active', 'closed', 'resolved');

-- ============================================================
-- 2. search_markets() RPC
-- Relevance-ranked, filtered, paginated market search.
-- SECURITY DEFINER: only ever exposes publicly-visible statuses
-- (active/closed/resolved) regardless of caller, so no draft leakage.
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_markets(
  p_query    text DEFAULT '',
  p_category text DEFAULT NULL,
  p_status   text DEFAULT 'active',    -- 'active' | 'closed' | 'resolved' | 'all'
  p_sort     text DEFAULT 'relevance', -- relevance | volume | newest | closing | bettors
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
-- NOTE: intentionally no `SET pg_trgm.word_similarity_threshold` — ranking uses
-- the word_similarity() function (not the `%>` operator), so the session GUC is
-- irrelevant, and a function-level SET of it fails on Supabase's migration role
-- (SQLSTATE 42501) which would break a fresh `db reset` / DR restore.
AS $$
DECLARE
  v_limit    int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset   int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_query    text := btrim(COALESCE(p_query, ''));
  v_sort     text := lower(COALESCE(p_sort, 'relevance'));
  v_ts       tsquery;
  v_cat      market_category;
  v_statuses market_status[];
  v_total    bigint := 0;
  v_data     jsonb  := '[]'::jsonb;
BEGIN
  IF v_sort NOT IN ('relevance', 'volume', 'newest', 'closing', 'bettors') THEN
    v_sort := 'relevance';
  END IF;

  -- Restrict to publicly-visible statuses only.
  v_statuses := CASE lower(COALESCE(p_status, 'active'))
    WHEN 'all'      THEN ARRAY['active','closed','resolved']::market_status[]
    WHEN 'closed'   THEN ARRAY['closed']::market_status[]
    WHEN 'resolved' THEN ARRAY['resolved']::market_status[]
    ELSE ARRAY['active']::market_status[]
  END;

  IF p_category IS NOT NULL AND lower(p_category) NOT IN ('', 'all') THEN
    BEGIN
      v_cat := p_category::market_category;
    EXCEPTION WHEN others THEN
      v_cat := NULL;  -- unknown category -> no category filter
    END;
  END IF;

  IF v_query <> '' THEN
    v_ts := websearch_to_tsquery('english', v_query);
  END IF;

  WITH base AS (
    SELECT
      m.id, m.slug, m.title, m.description, m.category, m.status,
      m.yes_price, m.no_price, m.total_volume_usd, m.unique_bettors,
      m.total_bets, m.closes_at, m.resolved_outcome, m.is_featured,
      m.is_trending, m.tags, m.cover_image_url, m.created_at,
      CASE
        WHEN v_ts IS NULL THEN 0::real
        ELSE ts_rank_cd(m.search_vector, v_ts)
             + word_similarity(v_query, m.title) * 0.4
      END AS relevance
    FROM public.markets m
    WHERE m.status = ANY (v_statuses)
      AND (v_cat IS NULL OR m.category = v_cat)
      AND (
        v_ts IS NULL
        OR m.search_vector @@ v_ts
        OR (length(v_query) >= 3 AND v_query <% m.title)  -- word-trigram fuzzy fallback (typo tolerant)
      )
  ),
  windowed AS (
    SELECT
      b.*,
      count(*) OVER () AS total_count,
      row_number() OVER (
        ORDER BY
          (CASE WHEN v_sort = 'relevance' THEN b.relevance END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'volume'    THEN b.total_volume_usd END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'newest'    THEN extract(epoch FROM b.created_at) END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'bettors'   THEN b.unique_bettors::numeric END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'closing'   THEN extract(epoch FROM b.closes_at) END) ASC NULLS LAST,
          b.total_volume_usd DESC, b.created_at DESC, b.id
      ) AS rn
    FROM base b
  )
  SELECT
    COALESCE(
      jsonb_agg((to_jsonb(w) - 'rn' - 'total_count') ORDER BY w.rn)
        FILTER (WHERE w.rn > v_offset AND w.rn <= v_offset + v_limit),
      '[]'::jsonb
    ),
    COALESCE(max(w.total_count), 0)
  INTO v_data, v_total
  FROM windowed w;

  RETURN jsonb_build_object(
    'data',   v_data,
    'total',  v_total,
    'limit',  v_limit,
    'offset', v_offset,
    'sort',   v_sort,
    'query',  v_query
  );
END;
$$;

-- ============================================================
-- 3. HARDENED LEADERBOARD MATERIALIZED VIEW
-- Deterministic ranks (tie-broken by id) across all three metrics.
-- No LIMIT: the RPC/API applies the display limit so weekly/all
-- ranks stay globally correct.
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard;
CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.id,
  p.display_name,
  p.username,
  p.avatar_url,
  p.total_bets,
  p.total_wins,
  p.win_rate,
  p.profit_loss_usd,
  p.total_volume_usd,
  RANK() OVER (ORDER BY p.total_volume_usd DESC, p.id)                    AS volume_rank,
  RANK() OVER (ORDER BY p.win_rate DESC, p.total_bets DESC, p.id)         AS winrate_rank,
  RANK() OVER (ORDER BY p.profit_loss_usd DESC, p.id)                     AS pnl_rank
FROM public.profiles p
WHERE p.account_status = 'active'
  AND p.total_bets >= 1;

-- Unique index is REQUIRED for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX leaderboard_id_idx      ON public.leaderboard (id);
CREATE INDEX        leaderboard_volume_idx  ON public.leaderboard (volume_rank);
CREATE INDEX        leaderboard_winrate_idx ON public.leaderboard (winrate_rank);
CREATE INDEX        leaderboard_pnl_idx     ON public.leaderboard (pnl_rank);

-- Concurrent refresh (falls back to a plain refresh on first populate).
CREATE OR REPLACE FUNCTION public.refresh_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
EXCEPTION WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
  -- CONCURRENTLY needs the matview populated once first.
  REFRESH MATERIALIZED VIEW public.leaderboard;
END;
$$;

-- ============================================================
-- 4. get_leaderboard() RPC
-- All-time reads the matview; week/month aggregate from transactions.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_metric text DEFAULT 'volume',  -- 'volume' | 'winrate' | 'pnl'
  p_period text DEFAULT 'all',     -- 'all' | 'week' | 'month'
  p_limit  int  DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_metric text := lower(COALESCE(p_metric, 'volume'));
  v_period text := lower(COALESCE(p_period, 'all'));
  v_since  timestamptz;
  v_data   jsonb := '[]'::jsonb;
BEGIN
  IF v_metric NOT IN ('volume', 'winrate', 'pnl') THEN v_metric := 'volume'; END IF;
  IF v_period NOT IN ('all', 'week', 'month')     THEN v_period := 'all';    END IF;

  IF v_period = 'all' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.rank), '[]'::jsonb)
      INTO v_data
    FROM (
      SELECT
        l.id, l.display_name, l.username, l.avatar_url,
        l.total_bets, l.total_wins, l.win_rate,
        l.profit_loss_usd, l.total_volume_usd,
        CASE v_metric
          WHEN 'winrate' THEN l.winrate_rank
          WHEN 'pnl'     THEN l.pnl_rank
          ELSE l.volume_rank
        END AS rank
      FROM public.leaderboard l
      ORDER BY rank
      LIMIT v_limit
    ) t;
  ELSE
    v_since := now() - (CASE v_period WHEN 'month' THEN interval '30 days'
                                      ELSE interval '7 days' END);
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.rank), '[]'::jsonb)
      INTO v_data
    FROM (
      SELECT
        p.id, p.display_name, p.username, p.avatar_url,
        agg.period_bets   AS total_bets,
        agg.period_wins   AS total_wins,
        CASE WHEN agg.period_bets > 0
             THEN round(agg.period_wins::numeric / agg.period_bets, 4)
             ELSE 0 END   AS win_rate,
        agg.period_pnl    AS profit_loss_usd,
        agg.period_volume AS total_volume_usd,
        RANK() OVER (
          ORDER BY
            CASE v_metric
              WHEN 'winrate' THEN (CASE WHEN agg.period_bets > 0
                                        THEN agg.period_wins::numeric / agg.period_bets
                                        ELSE 0 END)
              WHEN 'pnl'     THEN agg.period_pnl
              ELSE agg.period_volume
            END DESC,
            p.id
        ) AS rank
      FROM (
        SELECT
          tx.user_id,
          count(*) FILTER (WHERE tx.type = 'bet_placed')                         AS period_bets,
          count(*) FILTER (WHERE tx.type = 'bet_won')                            AS period_wins,
          COALESCE(sum(tx.amount_usd) FILTER (WHERE tx.type = 'bet_placed'), 0)  AS period_volume,
          COALESCE(sum(CASE WHEN tx.type = 'bet_won'    THEN tx.amount_usd
                            WHEN tx.type = 'bet_placed' THEN -tx.amount_usd
                            ELSE 0 END), 0)                                       AS period_pnl
        FROM public.transactions tx
        WHERE tx.status = 'completed'
          AND tx.created_at >= v_since
          AND tx.type IN ('bet_placed', 'bet_won')
        GROUP BY tx.user_id
      ) agg
      JOIN public.profiles p
        ON p.id = agg.user_id AND p.account_status = 'active'
      WHERE agg.period_bets > 0
      ORDER BY rank
      LIMIT v_limit
    ) t;
  END IF;

  RETURN jsonb_build_object('data', v_data, 'metric', v_metric, 'period', v_period);
END;
$$;

-- ============================================================
-- 5. GRANTS
-- ============================================================
GRANT SELECT ON public.leaderboard    TO anon, authenticated;
GRANT SELECT ON public.market_search  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_markets(text, text, text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, text, int)                 TO anon, authenticated;

COMMENT ON FUNCTION public.search_markets IS
  'Module 10: relevance-ranked full-text market search (ts_rank_cd + trigram fuzzy fallback), filtered & paginated. Returns jsonb {data,total,limit,offset,sort,query}.';
COMMENT ON FUNCTION public.get_leaderboard IS
  'Module 10: leaderboard by metric (volume|winrate|pnl) and period (all|week|month). All-time reads the leaderboard matview; week/month aggregate from transactions.';
