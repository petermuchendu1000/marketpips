// ============================================================
// MarketPips — Trading economics (fees, bet preview)
// ------------------------------------------------------------
// Mirrors the authoritative place_bet RPC so the UI can preview a bet's fee,
// creator reward, net stake, shares and slippage WITHOUT a round-trip, and the
// preview matches on-chain execution. Share math is delegated to lib/lmsr.
//
// FEE MODEL (matches migration 004)
//   feeUsd          = amountUsd · platform_fee_rate          (default 2%)
//   creatorRewardUsd= min(amountUsd · creator_reward_rate, feeUsd)  (default 0.25%)
//   platformNetUsd  = feeUsd − creatorRewardUsd
//   netStakeUsd     = amountUsd − feeUsd        (this enters the LMSR)
// ============================================================
import { getUsdRate, type RatesMap } from '@/lib/currency'
import { sharesForBudget, bFromLiquidity } from '@/lib/lmsr'
import type { CurrencyCode } from '@/types'

export const DEFAULT_PLATFORM_FEE_RATE = 0.02
export const DEFAULT_CREATOR_REWARD_RATE = 0.0025
export const MIN_BET_USD = 0.1

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8
}

export interface BetEconomics {
  amountUsd: number
  /** Total platform fee collected. */
  feeUsd: number
  /** Creator's cut, carved out of the platform fee. */
  creatorRewardUsd: number
  /** Platform's net after paying the creator reward. */
  platformNetUsd: number
  /** Stake that actually enters the LMSR. */
  netStakeUsd: number
}

export function computeBetEconomics(
  amountUsd: number,
  platformFeeRate: number = DEFAULT_PLATFORM_FEE_RATE,
  creatorRewardRate: number = DEFAULT_CREATOR_REWARD_RATE,
): BetEconomics {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error('amountUsd must be a non-negative number')
  const feeUsd = round8(amountUsd * platformFeeRate)
  const creatorRewardUsd = Math.min(round8(amountUsd * creatorRewardRate), feeUsd)
  return {
    amountUsd,
    feeUsd,
    creatorRewardUsd,
    platformNetUsd: round8(feeUsd - creatorRewardUsd),
    netStakeUsd: round8(amountUsd - feeUsd),
  }
}

/** Full-precision local→USD (matches place_bet, which does NOT round to cents). */
function toUsd(amountLocal: number, currency: CurrencyCode, rates?: RatesMap): number {
  return amountLocal * getUsdRate(currency, rates)
}

/** Whether a local-currency stake meets the global minimum bet (USD). */
export function meetsMinBet(amountLocal: number, currency: CurrencyCode, rates?: RatesMap): boolean {
  return toUsd(amountLocal, currency, rates) >= MIN_BET_USD
}

export interface BetPreview extends BetEconomics {
  side: 'yes' | 'no'
  shares: number
  /** Effective average fill price (incl. slippage). */
  avgPrice: number
  /** Marginal price after the trade. */
  priceAfter: number
  /** Max payout if this side wins ($1 per share). */
  potentialPayoutUsd: number
}

export interface PreviewArgs {
  amountLocal: number
  currency: CurrencyCode
  side: 'yes' | 'no'
  yesPrice: number
  noPrice: number
  /** Market liquidity pool (USD); b is derived as in place_bet. */
  liquidityPoolUsd: number
  rates?: RatesMap
  platformFeeRate?: number
  creatorRewardRate?: number
}

/** Minimum option probability used for share sizing (mirrors place_bet_option). */
export const MIN_OPTION_PRICE = 0.01

export interface OptionBetPreview extends BetEconomics {
  optionId: string
  /** Shares acquired = net stake / pre-trade option price. */
  shares: number
  /** Pre-trade option price the fill is sized at (>= MIN_OPTION_PRICE). */
  price: number
  /** Max payout if this option wins ($1 per share). */
  potentialPayoutUsd: number
}

export interface OptionPreviewArgs {
  amountLocal: number
  currency: CurrencyCode
  optionId: string
  /** Current option probability in [0,1]. */
  optionPrice: number
  rates?: RatesMap
  platformFeeRate?: number
  creatorRewardRate?: number
}

/**
 * Bet preview for ONE option of a multiple_choice market, mirroring the
 * authoritative `place_bet_option` RPC: convert to USD, take the platform fee,
 * then size shares against the pre-trade option price (floored at 0.01), which
 * is exactly how the RPC computes `v_shares := v_net_usd / v_price_before`.
 * There is no LMSR inversion here because the RPC itself sizes at the pre-trade
 * price — so this preview equals on-chain execution.
 */
export function previewOptionBet(args: OptionPreviewArgs): OptionBetPreview {
  const { amountLocal, currency, optionId, optionPrice, rates, platformFeeRate, creatorRewardRate } = args
  const amountUsd = toUsd(amountLocal, currency, rates)
  const econ = computeBetEconomics(amountUsd, platformFeeRate, creatorRewardRate)
  const price = Math.max(optionPrice, MIN_OPTION_PRICE)
  const shares = price > 0 ? econ.netStakeUsd / price : 0
  return {
    ...econ,
    optionId,
    shares,
    price,
    potentialPayoutUsd: shares, // $1 per winning share
  }
}

export interface OptionBinaryPreviewArgs {
  amountLocal: number
  currency: CurrencyCode
  optionId: string
  side: 'yes' | 'no'
  /** This candidate's INDEPENDENT Yes probability in [0,1]. */
  optionYesPrice: number
  /** This candidate's INDEPENDENT No probability (defaults to 1 - yes). */
  optionNoPrice?: number
  /** Market liquidity pool (USD); b is derived as in place_bet_option_binary. */
  liquidityPoolUsd: number
  rates?: RatesMap
  platformFeeRate?: number
  creatorRewardRate?: number
}

export interface OptionBinaryBetPreview extends BetPreview {
  optionId: string
}

/**
 * Bet preview for ONE candidate line of an INDEPENDENT multi-outcome market,
 * mirroring the authoritative `place_bet_option_binary` RPC. Because each
 * candidate is its own binary Yes/No LMSR line, this is exactly `previewBet`
 * applied to the candidate's own (yesPrice, noPrice) + the market's liquidity —
 * so the tested LMSR inversion holds and preview == on-chain execution. The
 * RPC only reprices THIS candidate, so no sibling prices are referenced here.
 */
export function previewOptionBinaryBet(args: OptionBinaryPreviewArgs): OptionBinaryBetPreview {
  const {
    amountLocal, currency, optionId, side, optionYesPrice, optionNoPrice,
    liquidityPoolUsd, rates, platformFeeRate, creatorRewardRate,
  } = args
  const yesPrice = optionYesPrice
  const noPrice = optionNoPrice ?? 1 - optionYesPrice
  const base = previewBet({
    amountLocal, currency, side, yesPrice, noPrice, liquidityPoolUsd,
    rates, platformFeeRate, creatorRewardRate,
  })
  return { ...base, optionId }
}

/** The trading-target fields of a POST /api/orders body. */
export type OrderTarget =
  | { side: 'yes' | 'no' }
  | { market_option_id: string }
  | { market_option_id: string; side: 'yes' | 'no' }

export interface OrderTargetArgs {
  /** Is this a multiple_choice market? */
  isMulti: boolean
  /** Independent per-candidate Yes/No mode (Phase C) — implies isMulti. */
  independent: boolean
  /** Selected candidate id (required for any multiple_choice order). */
  optionId?: string | null
  /** Chosen side (used by binary + independent; ignored by simplex). */
  side: 'yes' | 'no'
}

/**
 * Shape the trading-target fields of an order request, the single source of
 * truth the ticket UI uses so it always matches the /api/orders zod schema +
 * routing:
 *   • binary market                → { side }
 *   • simplex multiple_choice      → { market_option_id }
 *   • independent multiple_choice  → { market_option_id, side }  (Phase C)
 * Keeping this pure (and unit-tested) guarantees the client can never send an
 * independent option order WITHOUT a side (which the API rejects with 400).
 */
export function orderTarget(args: OrderTargetArgs): OrderTarget {
  const { isMulti, independent, optionId, side } = args
  if (!isMulti) return { side }
  if (!optionId) throw new Error('optionId is required for a multiple-choice order')
  return independent ? { market_option_id: optionId, side } : { market_option_id: optionId }
}

/**
 * The multiple_choice SETTLEMENT RPC that matches a market's pricing engine.
 * Choosing the wrong one silently mis-settles funds:
 *   • simplex      → *_resolve_market_options        (pays winning-option holders)
 *   • independent  → *_resolve_market_options_binary (pays winning-Yes AND losing-No)
 * Pass `admin: true` for the capability-guarded admin-console wrappers. This is
 * the single source of truth both resolve routes use, so the binary path can
 * never be skipped for an independent market.
 */
export function optionsResolverRpc(
  pricingMode: string | null | undefined,
  admin = false,
): 'resolve_market_options' | 'resolve_market_options_binary'
  | 'admin_resolve_market_options' | 'admin_resolve_market_options_binary' {
  const independent = pricingMode === 'independent'
  if (admin) {
    return independent ? 'admin_resolve_market_options_binary' : 'admin_resolve_market_options'
  }
  return independent ? 'resolve_market_options_binary' : 'resolve_market_options'
}

/**
 * Full bet preview mirroring place_bet: convert to USD, take fees, run the
 * net stake through the LMSR inversion for slippage-aware shares & price impact.
 */
export function previewBet(args: PreviewArgs): BetPreview {
  const {
    amountLocal, currency, side, yesPrice, noPrice, liquidityPoolUsd,
    rates, platformFeeRate, creatorRewardRate,
  } = args
  const amountUsd = toUsd(amountLocal, currency, rates)
  const econ = computeBetEconomics(amountUsd, platformFeeRate, creatorRewardRate)
  const b = bFromLiquidity(liquidityPoolUsd)
  const est = sharesForBudget(side, econ.netStakeUsd, yesPrice, noPrice, b)
  return {
    ...econ,
    side,
    shares: est.shares,
    avgPrice: est.avgPrice,
    priceAfter: est.priceAfter,
    potentialPayoutUsd: est.shares, // $1 per winning share
  }
}
