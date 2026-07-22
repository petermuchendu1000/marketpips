-- =====================================================================
-- Migration 031: Polymarket parity primitives
--
-- Derived from the ground-truth research in docs/research/polymarket. Adds
-- per-market trading constraints (tick size, min order size, rewards spread),
-- a neg-risk flag, and nullable EXTERNAL on-chain reference keys (condition_id,
-- clob_token_id) so MarketPips data can be reconciled against Polymarket.
--
-- Additive & reversible: every column is nullable or defaulted; no data is
-- rewritten. Rollback = DROP the columns/constraints/indexes/function below
-- (no dependents). Idempotent DDL (IF NOT EXISTS / CREATE OR REPLACE / guarded
-- DO blocks), matching the conventions of migration 030.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-market trading constraints + external reference keys.
--    tick_size: price lattice, 0.001 (0.1c) or 0.01 (1c). PM live split ~65/35.
--    min_order_size: dust floor in USD (~$5 on PM).
--    rewards_max_spread: maker-rebate eligibility band around the midpoint.
--    neg_risk: mutually-exclusive multi-outcome basket (Sum price = 1).
--    condition_id: on-chain CTF condition id (external ref; nullable).
-- ---------------------------------------------------------------------
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS tick_size          numeric(6,4)  NOT NULL DEFAULT 0.001,
  ADD COLUMN IF NOT EXISTS min_order_size     numeric(20,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS rewards_max_spread numeric(6,4),
  ADD COLUMN IF NOT EXISTS neg_risk           boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_id       text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'markets_tick_size_chk') THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_tick_size_chk CHECK (tick_size IN (0.001, 0.01));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'markets_min_order_size_chk') THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_min_order_size_chk CHECK (min_order_size > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Outcome-level external reference key (ERC-1155 CLOB token id).
-- ---------------------------------------------------------------------
ALTER TABLE public.market_options
  ADD COLUMN IF NOT EXISTS clob_token_id text;

-- External refs are unique WHEN PRESENT (partial unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_markets_condition_id
  ON public.markets (condition_id)
  WHERE condition_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_market_options_clob_token_id
  ON public.market_options (clob_token_id)
  WHERE clob_token_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Coherence helper: Sum of active option prices for a market.
--    No-arbitrage invariant expects this ~= 1 (binary: YES+NO=1;
--    multi-outcome / neg-risk: Sum p_i = 1). Used by data-quality checks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_option_price_sum(p_market_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(price), 0)
  FROM public.market_options
  WHERE market_id = p_market_id
    AND is_active;
$$;

-- ---------------------------------------------------------------------
-- 4. Documentation.
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.markets.tick_size IS
  'Price lattice tick (0.001 or 0.01). Polymarket parity (docs/research/polymarket).';
COMMENT ON COLUMN public.markets.min_order_size IS
  'Minimum order size in USD (dust floor). Polymarket parity.';
COMMENT ON COLUMN public.markets.rewards_max_spread IS
  'Maker-rebate eligibility spread around midpoint. Polymarket parity.';
COMMENT ON COLUMN public.markets.neg_risk IS
  'Mutually-exclusive multi-outcome basket (Sum price = 1). Polymarket parity.';
COMMENT ON COLUMN public.markets.condition_id IS
  'External on-chain CTF condition id (nullable reference). Polymarket parity.';
COMMENT ON COLUMN public.market_options.clob_token_id IS
  'External ERC-1155 CLOB token id (nullable reference). Polymarket parity.';
COMMENT ON FUNCTION public.pm_option_price_sum(uuid) IS
  'Sum of active option prices for a market; no-arbitrage invariant expects ~1.';
