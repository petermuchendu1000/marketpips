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
