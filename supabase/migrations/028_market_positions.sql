-- ---------------------------------------------------------------------------
-- 028_market_positions.sql
-- Market-wide "Positions" board (Polymarket parity).
--
-- The positions tab on a market page shows EVERY holder's position, split into
-- Yes / No columns and ranked by current value — exactly like Polymarket's
-- "Positions" view (name · avg price · value · amount bought). Direct client
-- reads of public.positions are blocked by RLS ("Users can view own positions")
-- so, mirroring market_top_holders(), we expose ONLY already-public position
-- economics through a read-only SECURITY DEFINER RPC.
--
-- p_option_id = NULL => whole (binary) book; pass an option id to scope a
-- multiple-choice market to one outcome's Yes/No book.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_positions(
  p_market_id UUID,
  p_option_id UUID DEFAULT NULL,
  p_limit     INTEGER DEFAULT 12
)
RETURNS TABLE (
  user_id            UUID,
  display_name       TEXT,
  username           TEXT,
  avatar_url         TEXT,
  joined_at          TIMESTAMPTZ,
  side               position_side,
  shares             NUMERIC,
  current_value_usd  NUMERIC,
  total_invested_usd NUMERIC,
  avg_entry_price    NUMERIC,
  side_rank          BIGINT
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
      p.total_invested_usd,
      p.avg_entry_price,
      ROW_NUMBER() OVER (PARTITION BY p.side ORDER BY p.current_value_usd DESC, p.shares DESC) AS side_rank
    FROM public.positions p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.market_id = p_market_id
      AND p.is_active = TRUE
      AND p.shares > 0
      AND (p_option_id IS NULL OR p.market_option_id = p_option_id)
      AND (p_option_id IS NOT NULL OR p.market_option_id IS NULL)
  )
  SELECT user_id, display_name, username, avatar_url, joined_at, side,
         shares, current_value_usd, total_invested_usd, avg_entry_price, side_rank
  FROM ranked
  WHERE side_rank <= p_limit
  ORDER BY side, current_value_usd DESC;
$$;

GRANT EXECUTE ON FUNCTION public.market_positions(UUID, UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.market_positions(UUID, UUID, INTEGER)
  IS 'Read-only Yes/No positions board for a market (+ optional outcome), ranked by current value. SECURITY DEFINER; exposes only public position economics.';
