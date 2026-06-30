import { describe, it, expect } from 'vitest'
import {
  lmsrCost,
  lmsrPrices,
  lmsrCostToBuy,
  spreadFromPrices,
  sharesForBudget,
  bFromLiquidity,
  MIN_LIQUIDITY_B,
} from '@/lib/lmsr'

// Reference values captured directly from the Postgres lmsr_price /
// lmsr_cost_to_buy functions (the execution-authoritative implementation).
// The TS module must match these so client previews equal server execution.
const TOL = 1e-6

describe('lmsrPrices — parity with DB reference values', () => {
  it('50/50 at equal quantities, cost = b·ln2', () => {
    const p = lmsrPrices(0, 0, 100)
    expect(p.yesPrice).toBeCloseTo(0.5, 9)
    expect(p.noPrice).toBeCloseTo(0.5, 9)
    expect(p.cost).toBeCloseTo(69.314718, TOL) // 100·ln2
  })

  it('q_yes=100, q_no=0, b=100', () => {
    const p = lmsrPrices(100, 0, 100)
    expect(p.yesPrice).toBeCloseTo(0.7310585786, 9)
    expect(p.noPrice).toBeCloseTo(0.2689414214, 9)
  })

  it('q_yes=200, q_no=50, b=100', () => {
    const p = lmsrPrices(200, 50, 100)
    expect(p.yesPrice).toBeCloseTo(0.8175744762, 9)
    expect(p.noPrice).toBeCloseTo(0.1824255238, 9)
  })

  it('q_yes=30, q_no=10, b=50', () => {
    const p = lmsrPrices(30, 10, 50)
    expect(p.yesPrice).toBeCloseTo(0.5986876601, 9)
    expect(p.noPrice).toBeCloseTo(0.4013123399, 9)
  })

  it('prices always sum to 1', () => {
    for (const [qy, qn, b] of [[0, 0, 100], [123, 45, 80], [999, 1, 50]] as const) {
      const p = lmsrPrices(qy, qn, b)
      expect(p.yesPrice + p.noPrice).toBeCloseTo(1, 12)
    }
  })
})

describe('lmsrCost — parity with DB reference values', () => {
  it('matches C(0,0)=b·ln2 and C(10,0)', () => {
    expect(lmsrCost(0, 0, 100)).toBeCloseTo(69.314718, TOL)
    expect(lmsrCost(10, 0, 100)).toBeCloseTo(74.439666, TOL)
  })
})

describe('lmsrCostToBuy — parity with DB reference values', () => {
  it('buy 10 YES from (0,0,b=100) ≈ 5.124948', () => {
    expect(lmsrCostToBuy(0, 0, 10, 0, 100)).toBeCloseTo(5.124948, TOL)
  })
  it('buy 25 YES from (100,50,b=100) ≈ 16.279402', () => {
    expect(lmsrCostToBuy(100, 50, 25, 0, 100)).toBeCloseTo(16.279402, TOL)
  })
  it('buy 1 YES from (0,0,b=100) ≈ 0.501250', () => {
    expect(lmsrCostToBuy(0, 0, 1, 0, 100)).toBeCloseTo(0.50125, TOL)
  })
  it('buy 100 YES from (0,0,b=100) ≈ 62.011451', () => {
    expect(lmsrCostToBuy(0, 0, 100, 0, 100)).toBeCloseTo(62.011451, TOL)
  })

  it('cost is positive and convex (increasing marginal cost)', () => {
    const first = lmsrCostToBuy(0, 0, 10, 0, 100)
    const second = lmsrCostToBuy(10, 0, 10, 0, 100)
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first) // buying YES pushes its price up
  })
})

describe('monotonicity', () => {
  it('more YES inventory raises the YES price', () => {
    const a = lmsrPrices(0, 0, 100).yesPrice
    const b = lmsrPrices(50, 0, 100).yesPrice
    const c = lmsrPrices(150, 0, 100).yesPrice
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})

describe('numerical stability (log-sum-exp)', () => {
  it('does not overflow to NaN/Infinity for extreme quantities', () => {
    const p = lmsrPrices(100_000, 0, 50) // naive EXP would be Infinity → NaN
    expect(Number.isFinite(p.yesPrice)).toBe(true)
    expect(Number.isFinite(p.cost)).toBe(true)
    expect(p.yesPrice).toBeCloseTo(1, 9)
    expect(p.noPrice).toBeCloseTo(0, 9)
  })
})

describe('bFromLiquidity (mirrors place_bet)', () => {
  it('floors at MIN_LIQUIDITY_B and scales as pool/2', () => {
    expect(bFromLiquidity(0)).toBe(MIN_LIQUIDITY_B)
    expect(bFromLiquidity(100)).toBe(50)
    expect(bFromLiquidity(200)).toBe(100)
    expect(bFromLiquidity(1000)).toBe(500)
    expect(bFromLiquidity(-5)).toBe(MIN_LIQUIDITY_B)
  })
})

describe('spreadFromPrices', () => {
  it('round-trips: prices→spread recovers the quantity delta', () => {
    const b = 100
    const p = lmsrPrices(150, 0, b) // spread = 150
    expect(spreadFromPrices(p.yesPrice, p.noPrice, b)).toBeCloseTo(150, 6)
  })
})

describe('sharesForBudget (true LMSR inversion w/ slippage)', () => {
  it('spends ≈ budget and reflects slippage above spot', () => {
    const { yesPrice, noPrice } = lmsrPrices(0, 0, 100) // 0.5 / 0.5
    const est = sharesForBudget('yes', 10, yesPrice, noPrice, 100)
    expect(est.cost).toBeCloseTo(10, 4)
    expect(est.shares).toBeGreaterThan(0)
    // Average price paid must exceed the 0.5 spot (buying pushes price up).
    expect(est.avgPrice).toBeGreaterThan(0.5)
    expect(est.priceAfter).toBeGreaterThan(0.5)
  })

  it('matches the closed-form cost-to-buy for the shares it returns', () => {
    const { yesPrice, noPrice } = lmsrPrices(0, 0, 100)
    const est = sharesForBudget('yes', 25, yesPrice, noPrice, 100)
    const recomputed = lmsrCostToBuy(0, 0, est.shares, 0, 100)
    expect(recomputed).toBeCloseTo(25, 3)
  })

  it('returns zero shares for a non-positive budget', () => {
    expect(sharesForBudget('yes', 0, 0.5, 0.5, 100).shares).toBe(0)
  })
})
