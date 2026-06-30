// ============================================================
// MarketPips — LMSR (Logarithmic Market Scoring Rule) pricing
// ------------------------------------------------------------
// AUTHORITY MODEL
//   The Postgres functions `lmsr_price` / `lmsr_cost_to_buy` are AUTHORITATIVE
//   for trade execution (place_bet runs server-side, atomically). This module
//   is the matching client/server TypeScript reference, used for:
//     • UI previews (price impact, est. shares, slippage) without a round-trip
//     • a single, tested source of truth for the math that the DB mirrors
//
// MATH (binary market, quantities qYes / qNo, liquidity b > 0)
//   Cost function:  C(q) = b · ln( e^(qYes/b) + e^(qNo/b) )
//   Marginal price: p_i  = e^(qi/b) / Σ_j e^(qj/b)
//   Cost to buy Δ:  C(q+Δ) − C(q)
//
// NUMERICAL STABILITY
//   The DB uses naive EXP(), which overflows to ∞ for large q/b. Here we use
//   the log-sum-exp trick (factor out the max exponent) so results stay finite
//   and match the DB wherever the DB does not overflow.
// ============================================================

/** Default liquidity floor — mirrors place_bet: b = max(liquidity_pool_usd/2, 50). */
export const MIN_LIQUIDITY_B = 50

/** Derive the LMSR `b` parameter from a market's USD liquidity pool (mirrors place_bet). */
export function bFromLiquidity(liquidityPoolUsd: number): number {
  if (!Number.isFinite(liquidityPoolUsd) || liquidityPoolUsd <= 0) return MIN_LIQUIDITY_B
  return Math.max(liquidityPoolUsd / 2, MIN_LIQUIDITY_B)
}

function assertB(b: number): void {
  if (!Number.isFinite(b) || b <= 0) throw new Error('LMSR liquidity parameter b must be a positive number')
}
function assertFinite(...xs: number[]): void {
  for (const x of xs) if (!Number.isFinite(x)) throw new Error('LMSR inputs must be finite numbers')
}

/** Stable cost function C(q) = b·ln(Σ e^(qi/b)). */
export function lmsrCost(qYes: number, qNo: number, b: number): number {
  assertB(b)
  assertFinite(qYes, qNo)
  const a = qYes / b
  const c = qNo / b
  const m = Math.max(a, c)
  // C = b·(m + ln(e^(a-m) + e^(c-m)))
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)))
}

export interface LmsrPrices {
  yesPrice: number
  noPrice: number
  /** Value of the cost function C(q) at these quantities. */
  cost: number
}

/** Stable marginal prices + cost. yesPrice + noPrice === 1 (within fp epsilon). */
export function lmsrPrices(qYes: number, qNo: number, b: number): LmsrPrices {
  assertB(b)
  assertFinite(qYes, qNo)
  const a = qYes / b
  const c = qNo / b
  const m = Math.max(a, c)
  const ea = Math.exp(a - m)
  const ec = Math.exp(c - m)
  const sum = ea + ec
  return {
    yesPrice: ea / sum,
    noPrice: ec / sum,
    cost: b * (m + Math.log(sum)),
  }
}

/** Cost (USD) to move quantities by (Δyes, Δno): C(q+Δ) − C(q). Positive for buys. */
export function lmsrCostToBuy(
  qYes: number,
  qNo: number,
  deltaYes: number,
  deltaNo: number,
  b: number,
): number {
  assertB(b)
  assertFinite(qYes, qNo, deltaYes, deltaNo)
  return lmsrCost(qYes + deltaYes, qNo + deltaNo, b) - lmsrCost(qYes, qNo, b)
}

/**
 * Reconstruct the quantity spread (qYes − qNo) from observed prices.
 * Because LMSR is translation-invariant, knowing the spread is sufficient to
 * price a marginal trade from only the current displayed prices + b.
 *   p_yes = 1 / (1 + e^-(d/b))  ⇒  d = b·ln(p_yes / p_no)
 */
export function spreadFromPrices(yesPrice: number, noPrice: number, b: number): number {
  assertB(b)
  if (!(yesPrice > 0) || !(noPrice > 0)) throw new Error('Prices must be positive to reconstruct spread')
  return b * Math.log(yesPrice / noPrice)
}

export interface BuyEstimate {
  /** Shares acquired for the given budget. */
  shares: number
  /** USD actually spent (== budget, by construction). */
  cost: number
  /** Effective average price per share (cost / shares). */
  avgPrice: number
  /** Marginal price after the purchase. */
  priceAfter: number
}

/**
 * Estimate how many YES/NO shares a USD budget buys at current prices, using a
 * true LMSR inversion (binary search on cost-to-buy). Reconstructs the
 * quantity spread from the displayed prices, so it only needs prices + b.
 * This reflects real slippage — unlike a naive `budget / price`.
 */
export function sharesForBudget(
  side: 'yes' | 'no',
  budgetUsd: number,
  yesPrice: number,
  noPrice: number,
  b: number,
): BuyEstimate {
  assertB(b)
  if (!(budgetUsd > 0)) return { shares: 0, cost: 0, avgPrice: side === 'yes' ? yesPrice : noPrice, priceAfter: side === 'yes' ? yesPrice : noPrice }
  // Anchor quantities so prices match: set qNo = 0, qYes = spread.
  const d = spreadFromPrices(yesPrice, noPrice, b)
  const qYes = side === 'yes' ? d : 0
  const qNo = side === 'yes' ? 0 : -d
  // Binary search for shares s.t. cost-to-buy ≈ budget.
  let lo = 0
  let hi = 1
  const costOf = (s: number) =>
    side === 'yes' ? lmsrCostToBuy(qYes, qNo, s, 0, b) : lmsrCostToBuy(qYes, qNo, 0, s, b)
  // Expand hi until it exceeds the budget.
  while (costOf(hi) < budgetUsd && hi < 1e12) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (costOf(mid) < budgetUsd) lo = mid
    else hi = mid
  }
  const shares = (lo + hi) / 2
  const cost = costOf(shares)
  const after = lmsrPrices(
    qYes + (side === 'yes' ? shares : 0),
    qNo + (side === 'no' ? shares : 0),
    b,
  )
  return {
    shares,
    cost,
    avgPrice: shares > 0 ? cost / shares : (side === 'yes' ? yesPrice : noPrice),
    priceAfter: side === 'yes' ? after.yesPrice : after.noPrice,
  }
}

/** Round a price to the 6 dp the DB stores (parity with lmsr_price ROUND(...,6)). */
export function roundPrice(p: number): number {
  return Math.round(p * 1e6) / 1e6
}
