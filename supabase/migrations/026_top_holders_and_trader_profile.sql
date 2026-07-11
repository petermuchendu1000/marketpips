-- 026_top_holders_and_trader_profile.sql
-- Top Holders board + holder hover-card + public trader profile (Module: social).
--
-- Adds read-only, SECURITY DEFINER RPCs that expose ONLY already-public
-- aggregates (display name, avatar, shares, position value, P&L, volume) so the
-- surfaces can render without loosening RLS on the base tables. No PII (phone,
-- email, KYC, wallet balances) is ever selected. Also adds a lightweight
-- profile view counter and the supporting composite indexes.
--
-- Design: docs/design/TOP-HOLDERS-DOSSIER.md  (Board -> Peek -> Profile).

-- ---------------------------------------------------------------------------
-- 1. Profile view counter (Polymarket "N views" on the trader header)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_view_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_profile_views(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.profiles
     SET profile_view_count = profile_view_count + 1
   WHERE id = p_user_id
  RETURNING profile_view_count INTO v_count;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Supporting indexes for the holder board (per market/option/side, ranked)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_positions_holders_board
  ON public.positions (market_id, market_option_id, side, shares DESC)
  WHERE is_active = TRUE AND shares > 0;

CREATE INDEX IF NOT EXISTS idx_positions_user_active
  ON public.positions (user_id, is_active, current_value_usd DESC);

-- ---------------------------------------------------------------------------
-- 3. market_top_holders(): ranked Yes/No holders for a market (+ option).
--    Returns both sides; the client splits into two columns. Each row carries
--    its per-side rank and share-of-book (% of that side's total shares) so the
--    UI can draw a concentration bar. p_option_id = NULL => whole (binary) book.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_top_holders(
  p_market_id UUID,
  p_option_id UUID DEFAULT NULL,
  p_limit     INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id           UUID,
  display_name      TEXT,
  username          TEXT,
  avatar_url        TEXT,
  joined_at         TIMESTAMPTZ,
  side              position_side,
  shares            NUMERIC,
  current_value_usd NUMERIC,
  share_of_book     NUMERIC,
  side_rank         BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      p.user_id,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.created_at AS joined_at,
      p.side,
      p.shares,
      p.current_value_usd,
      CASE WHEN SUM(p.shares) OVER (PARTITION BY p.side) > 0
           THEN p.shares / SUM(p.shares) OVER (PARTITION BY p.side)
           ELSE 0 END AS share_of_book,
      ROW_NUMBER() OVER (PARTITION BY p.side ORDER BY p.shares DESC) AS side_rank
    FROM public.positions p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.market_id = p_market_id
      AND p.is_active = TRUE
      AND p.shares > 0
      AND (p_option_id IS NULL OR p.market_option_id = p_option_id)
      AND (p_option_id IS NOT NULL OR p.market_option_id IS NULL)
  )
  SELECT user_id, display_name, username, avatar_url, joined_at, side,
         shares, current_value_usd, share_of_book, side_rank
  FROM ranked
  WHERE side_rank <= p_limit
  ORDER BY side, shares DESC;
$$;

-- ---------------------------------------------------------------------------
-- 4. trader_card_stats(): the 3-up hover-card (Positions / P&L / Volume).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trader_card_stats(p_user_id UUID)
RETURNS TABLE (
  user_id         UUID,
  display_name    TEXT,
  username        TEXT,
  avatar_url      TEXT,
  joined_at       TIMESTAMPTZ,
  positions_value NUMERIC,
  profit_loss_usd NUMERIC,
  volume_usd      NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id,
    pr.display_name,
    pr.username,
    pr.avatar_url,
    pr.created_at,
    COALESCE((SELECT SUM(current_value_usd) FROM public.positions
              WHERE user_id = pr.id AND is_active = TRUE), 0),
    pr.profit_loss_usd,
    pr.total_volume_usd
  FROM public.profiles pr
  WHERE pr.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. trader_public_profile(): identity + header stat strip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trader_public_profile(p_user_id UUID)
RETURNS TABLE (
  user_id          UUID,
  display_name     TEXT,
  username         TEXT,
  avatar_url       TEXT,
  bio              TEXT,
  joined_at        TIMESTAMPTZ,
  view_count       INTEGER,
  positions_value  NUMERIC,
  biggest_win_usd  NUMERIC,
  predictions      BIGINT,
  profit_loss_usd  NUMERIC,
  volume_usd       NUMERIC,
  win_rate         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id,
    pr.display_name,
    pr.username,
    pr.avatar_url,
    pr.bio,
    pr.created_at,
    pr.profile_view_count,
    COALESCE((SELECT SUM(current_value_usd) FROM public.positions
              WHERE user_id = pr.id AND is_active = TRUE), 0),
    COALESCE((SELECT MAX(realized_pnl_usd) FROM public.positions
              WHERE user_id = pr.id AND is_active = FALSE), 0),
    (SELECT COUNT(DISTINCT market_id) FROM public.positions WHERE user_id = pr.id),
    pr.profit_loss_usd,
    pr.total_volume_usd,
    pr.win_rate
  FROM public.profiles pr
  WHERE pr.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- 6. trader_positions(): the portfolio table (Active | Closed), searchable.
--    Active  -> avg entry, current price, value, unrealized P&L.
--    Closed  -> result (won/lost), total traded, amount won, realized P&L.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trader_positions(
  p_user_id UUID,
  p_status  TEXT DEFAULT 'active',
  p_search  TEXT DEFAULT NULL,
  p_limit   INTEGER DEFAULT 50
)
RETURNS TABLE (
  position_id       UUID,
  market_id         UUID,
  market_slug       TEXT,
  market_title      TEXT,
  category          market_category,
  option_label      TEXT,
  side              position_side,
  shares            NUMERIC,
  avg_entry_price   NUMERIC,
  current_price     NUMERIC,
  current_value_usd NUMERIC,
  total_invested_usd NUMERIC,
  unrealized_pnl_usd NUMERIC,
  realized_pnl_usd  NUMERIC,
  total_payout_usd  NUMERIC,
  is_active         BOOLEAN,
  is_won            BOOLEAN,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    m.id,
    m.slug,
    m.title,
    m.category,
    mo.label,
    p.side,
    p.shares,
    p.avg_entry_price,
    CASE
      WHEN mo.id IS NOT NULL THEN
        CASE WHEN p.side = 'yes' THEN mo.yes_price ELSE mo.no_price END
      ELSE
        CASE WHEN p.side = 'yes' THEN m.yes_price ELSE m.no_price END
    END AS current_price,
    p.current_value_usd,
    p.total_invested_usd,
    p.unrealized_pnl_usd,
    p.realized_pnl_usd,
    p.total_payout_usd,
    p.is_active,
    (p.total_payout_usd > 0) AS is_won,
    p.updated_at
  FROM public.positions p
  JOIN public.markets m ON m.id = p.market_id
  LEFT JOIN public.market_options mo ON mo.id = p.market_option_id
  WHERE p.user_id = p_user_id
    AND ((p_status = 'active'  AND p.is_active = TRUE)
      OR (p_status = 'closed'  AND p.is_active = FALSE)
      OR (p_status = 'all'))
    AND (p_search IS NULL OR m.title ILIKE '%' || p_search || '%')
  ORDER BY (p.is_active) DESC, p.current_value_usd DESC, p.updated_at DESC
  LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 7. trader_pnl_series(): mark-to-market portfolio-value curve over a range.
--    Buckets price_history for the markets/options the trader currently holds,
--    valuing each snapshot at the trader's held shares. Honest approximation of
--    "what this book was worth over time" (documented in the dossier).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trader_pnl_series(
  p_user_id UUID,
  p_range   TEXT DEFAULT '1M'
)
RETURNS TABLE (
  bucket    TIMESTAMPTZ,
  value_usd NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT CASE p_range
             WHEN '1D'  THEN INTERVAL '1 day'
             WHEN '1W'  THEN INTERVAL '7 days'
             WHEN '1M'  THEN INTERVAL '30 days'
             WHEN '1Y'  THEN INTERVAL '365 days'
             WHEN 'YTD' THEN (NOW() - date_trunc('year', NOW()))
             ELSE INTERVAL '3650 days'
           END AS span,
           CASE p_range
             WHEN '1D' THEN INTERVAL '1 hour'
             WHEN '1W' THEN INTERVAL '6 hours'
             ELSE INTERVAL '1 day'
           END AS step
  ),
  held AS (
    SELECT p.market_id, p.market_option_id, p.side, p.shares
    FROM public.positions p
    WHERE p.user_id = p_user_id AND p.is_active = TRUE AND p.shares > 0
  ),
  ticks AS (
    SELECT
      date_trunc('hour', ph.recorded_at) AS bucket,
      h.shares * CASE
        WHEN h.side = 'yes' THEN COALESCE(ph.price, ph.yes_price)
        ELSE COALESCE(1 - ph.price, ph.no_price)
      END AS val
    FROM held h
    JOIN public.price_history ph
      ON ph.market_id = h.market_id
     AND (h.market_option_id IS NULL OR ph.market_option_id = h.market_option_id)
    WHERE ph.recorded_at >= NOW() - (SELECT span FROM win)
  )
  SELECT bucket, SUM(val) AS value_usd
  FROM ticks
  GROUP BY bucket
  ORDER BY bucket;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants: read-only RPCs are safe for anon + authenticated.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.market_top_holders(UUID, UUID, INTEGER)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trader_card_stats(UUID)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trader_public_profile(UUID)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trader_positions(UUID, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trader_pnl_series(UUID, TEXT)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_profile_views(UUID)               TO anon, authenticated;

COMMENT ON FUNCTION public.market_top_holders(UUID, UUID, INTEGER)
  IS 'Ranked Yes/No holders for a market (+ optional option). Public aggregates only.';
COMMENT ON FUNCTION public.trader_public_profile(UUID)
  IS 'Public trader profile header + stat strip. No PII.';
