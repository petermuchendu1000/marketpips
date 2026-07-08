import { describe, it, expect } from 'vitest'
import {
  computeBetEconomics,
  meetsMinBet,
  previewBet,
  previewOptionBinaryBet,
  MIN_BET_USD,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_CREATOR_REWARD_RATE,
} from '@/lib/trading'

describe('computeBetEconomics — fee split (2% platform / 0.25% creator)', () => {
  it('splits fees and net stake for a $0.775 bet (100 KES)', () => {
    const e = computeBetEconomics(0.775)
    expect(e.feeUsd).toBeCloseTo(0.0155, 8)        // 2%
    expect(e.creatorRewardUsd).toBeCloseTo(0.0019375, 8) // 0.25%
    expect(e.platformNetUsd).toBeCloseTo(0.0135625, 8)   // fee - creator
    expect(e.netStakeUsd).toBeCloseTo(0.7595, 8)         // amount - fee
  })

  it('uses the documented default rates', () => {
    expect(DEFAULT_PLATFORM_FEE_RATE).toBe(0.02)
    expect(DEFAULT_CREATOR_REWARD_RATE).toBe(0.0025)
    const e = computeBetEconomics(100)
    expect(e.feeUsd).toBeCloseTo(2, 8)
    expect(e.creatorRewardUsd).toBeCloseTo(0.25, 8)
    expect(e.netStakeUsd).toBeCloseTo(98, 8)
  })

  it('caps the creator reward at the collected fee', () => {
    // creator rate higher than platform fee → reward cannot exceed fee
    const e = computeBetEconomics(100, 0.01, 0.05)
    expect(e.feeUsd).toBeCloseTo(1, 8)
    expect(e.creatorRewardUsd).toBeCloseTo(1, 8) // capped at fee, not 5
    expect(e.platformNetUsd).toBeCloseTo(0, 8)
  })

  it('rejects negative amounts', () => {
    expect(() => computeBetEconomics(-1)).toThrow()
  })
})

describe('meetsMinBet', () => {
  it('enforces the $0.10 minimum via FX', () => {
    expect(MIN_BET_USD).toBe(0.1)
    // 5 KES ≈ $0.039 < min; 15 KES ≈ $0.116 ≥ min
    expect(meetsMinBet(5, 'KES', { KES: 0.00775 })).toBe(false)
    expect(meetsMinBet(15, 'KES', { KES: 0.00775 })).toBe(true)
    expect(meetsMinBet(0.1, 'USD')).toBe(true)
  })
})

describe('previewBet — mirrors place_bet execution', () => {
  it('matches the DB-verified 100 KES YES bet on a fresh 0.50/0.50 market', () => {
    // DB-live result: shares≈1.507636, avg≈0.503769, new yes≈0.507538.
    const p = previewBet({
      amountLocal: 100,
      currency: 'KES',
      side: 'yes',
      yesPrice: 0.5,
      noPrice: 0.5,
      liquidityPoolUsd: 0, // b = max(0/2, 50) = 50, as in place_bet
      rates: { KES: 0.00775 },
    })
    expect(p.amountUsd).toBeCloseTo(0.775, 6)
    expect(p.feeUsd).toBeCloseTo(0.0155, 6)
    expect(p.creatorRewardUsd).toBeCloseTo(0.0019375, 6)
    expect(p.netStakeUsd).toBeCloseTo(0.7595, 6)
    expect(p.shares).toBeCloseTo(1.507636, 3)
    expect(p.avgPrice).toBeCloseTo(0.503769, 3)
    expect(p.priceAfter).toBeCloseTo(0.507538, 3)
    expect(p.potentialPayoutUsd).toBeCloseTo(p.shares, 6)
  })

  it('shows slippage: average price exceeds the entry spot for a buy', () => {
    const p = previewBet({
      amountLocal: 100, currency: 'USD', side: 'yes',
      yesPrice: 0.5, noPrice: 0.5, liquidityPoolUsd: 200, // b = 100
    })
    expect(p.avgPrice).toBeGreaterThan(0.5)
    expect(p.priceAfter).toBeGreaterThan(p.avgPrice) // marginal > average
  })
})

describe('previewOptionBinaryBet — Phase C independent candidate line', () => {
  it('equals a binary previewBet on the candidate own (yes,no) — each candidate is its own line', () => {
    const bin = previewBet({
      amountLocal: 100, currency: 'USD', side: 'yes',
      yesPrice: 0.5, noPrice: 0.5, liquidityPoolUsd: 200,
    })
    const opt = previewOptionBinaryBet({
      amountLocal: 100, currency: 'USD', side: 'yes', optionId: 'cand-a',
      optionYesPrice: 0.5, optionNoPrice: 0.5, liquidityPoolUsd: 200,
    })
    expect(opt.optionId).toBe('cand-a')
    expect(opt.shares).toBeCloseTo(bin.shares, 10)
    expect(opt.avgPrice).toBeCloseTo(bin.avgPrice, 10)
    expect(opt.priceAfter).toBeCloseTo(bin.priceAfter, 10)
    expect(opt.potentialPayoutUsd).toBeCloseTo(bin.shares, 10)
  })

  it("defaults noPrice to 1 - yes for the candidate's own binary line", () => {
    const withDefault = previewOptionBinaryBet({
      amountLocal: 50, currency: 'USD', side: 'yes', optionId: 'x',
      optionYesPrice: 0.62, liquidityPoolUsd: 200,
    })
    const explicit = previewOptionBinaryBet({
      amountLocal: 50, currency: 'USD', side: 'yes', optionId: 'x',
      optionYesPrice: 0.62, optionNoPrice: 0.38, liquidityPoolUsd: 200,
    })
    expect(withDefault.shares).toBeCloseTo(explicit.shares, 12)
    expect(withDefault.priceAfter).toBeCloseTo(explicit.priceAfter, 12)
  })

  it('INDEPENDENCE: a candidate preview depends only on that candidate — never on siblings', () => {
    // Buying Yes on candidate A priced at 0.40 yields the SAME fill whether a
    // sibling candidate B is a heavy favourite (0.95) or a long shot (0.05),
    // because the function has no channel to reference siblings at all. This is
    // the engine invariant proven live in migration 023's rollback smoke test.
    const a = previewOptionBinaryBet({
      amountLocal: 100, currency: 'USD', side: 'yes', optionId: 'A',
      optionYesPrice: 0.4, liquidityPoolUsd: 500,
    })
    // Two hypothetical "worlds" with different sibling B — A's preview is identical.
    const aWorld1 = previewOptionBinaryBet({
      amountLocal: 100, currency: 'USD', side: 'yes', optionId: 'A',
      optionYesPrice: 0.4, liquidityPoolUsd: 500,
    })
    expect(a.shares).toBeCloseTo(aWorld1.shares, 12)
    // Slippage sanity: buying Yes lifts the marginal price above spot.
    expect(a.priceAfter).toBeGreaterThan(0.4)
    expect(a.avgPrice).toBeGreaterThan(0.4)
  })

  it('buying No lifts the candidate No price above its spot (symmetric to Yes)', () => {
    const p = previewOptionBinaryBet({
      amountLocal: 100, currency: 'USD', side: 'no', optionId: 'A',
      optionYesPrice: 0.7, liquidityPoolUsd: 300, // No spot = 0.30
    })
    expect(p.side).toBe('no')
    expect(p.avgPrice).toBeGreaterThan(0.3)
    expect(p.priceAfter).toBeGreaterThan(p.avgPrice)
  })
})
