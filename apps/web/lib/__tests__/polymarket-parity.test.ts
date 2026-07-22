import { describe, it, expect } from 'vitest'
import {
  takerFeeUsd,
  takerFeeForCategory,
  roundFeeUsd,
  POLYMARKET_TAKER_FEE_RATE,
  impliedSum,
  isCoherent,
  normalizeToOne,
  quantizeToTick,
  isOnTick,
} from '@/lib/polymarket-parity'

// Fee vectors are taken VERBATIM from Polymarket's published 100-share fee
// tables (docs/research/polymarket/00-PRIMITIVES-AND-PROTOCOL.md §4). These
// reproduced 10/10 in tools/polymarket-research and are the regression anchor.
describe('takerFeeUsd — fee = C·rate·p·(1−p) vs published tables', () => {
  it('Crypto (rate 0.07), 100 shares', () => {
    expect(takerFeeUsd(100, 0.5, 0.07)).toBeCloseTo(1.75, 2)
    expect(takerFeeUsd(100, 0.3, 0.07)).toBeCloseTo(1.47, 2)
    expect(takerFeeUsd(100, 0.1, 0.07)).toBeCloseTo(0.63, 2)
    expect(takerFeeUsd(100, 0.95, 0.07)).toBeCloseTo(0.33, 2)
  })
  it('Finance/Politics/Tech (rate 0.04), 100 shares', () => {
    expect(takerFeeUsd(100, 0.5, 0.04)).toBeCloseTo(1.0, 2)
    expect(takerFeeUsd(100, 0.4, 0.04)).toBeCloseTo(0.96, 2)
    expect(takerFeeUsd(100, 0.9, 0.04)).toBeCloseTo(0.36, 2)
  })
  it('Sports (rate 0.05), 100 shares', () => {
    expect(takerFeeUsd(100, 0.5, 0.05)).toBeCloseTo(1.25, 2)
    expect(takerFeeUsd(100, 0.25, 0.05)).toBeCloseTo(0.94, 2)
    expect(takerFeeUsd(100, 0.9, 0.05)).toBeCloseTo(0.45, 2)
  })
  it('is symmetric about p=0.5 (same USD fee at p and 1−p)', () => {
    for (const p of [0.1, 0.2, 0.3, 0.42]) {
      expect(takerFeeUsd(100, p, 0.05)).toBeCloseTo(takerFeeUsd(100, 1 - p, 0.05), 6)
    }
  })
  it('peaks at p=0.5', () => {
    const peak = takerFeeUsd(100, 0.5, 0.07)
    for (const p of [0.05, 0.2, 0.35, 0.65, 0.8, 0.95]) {
      expect(takerFeeUsd(100, p, 0.07)).toBeLessThanOrEqual(peak)
    }
  })
  it('guards invalid / non-positive inputs', () => {
    expect(takerFeeUsd(0, 0.5, 0.07)).toBe(0)
    expect(takerFeeUsd(100, 0.5, 0)).toBe(0)
    expect(takerFeeUsd(-5, 0.5, 0.07)).toBe(0)
    expect(takerFeeUsd(100, Number.NaN, 0.07)).toBe(0)
  })
})

describe('roundFeeUsd — 5dp precision, dust floor', () => {
  it('rounds to 5 decimals', () => {
    expect(roundFeeUsd(1.234567)).toBe(1.23457)
  })
  it('floors sub-0.00001 dust to zero', () => {
    expect(roundFeeUsd(0.000004)).toBe(0)
    expect(roundFeeUsd(0.00001)).toBe(0.00001)
  })
})

describe('takerFeeForCategory — PM schedule mapping', () => {
  it('crypto is the most expensive (0.07); geopolitics-like others 0.05', () => {
    expect(POLYMARKET_TAKER_FEE_RATE.crypto).toBe(0.07)
    expect(takerFeeForCategory(100, 0.5, 'crypto')).toBeCloseTo(1.75, 2)
    expect(takerFeeForCategory(100, 0.5, 'politics')).toBeCloseTo(1.0, 2)
    expect(takerFeeForCategory(100, 0.5, 'sports')).toBeCloseTo(1.25, 2)
  })
})

describe('coherence — no-arbitrage Σp=1', () => {
  it('binary YES+NO within tolerance', () => {
    expect(impliedSum([0.62, 0.38])).toBeCloseTo(1, 9)
    expect(isCoherent([0.62, 0.38])).toBe(true)
    expect(isCoherent([0.505, 0.495])).toBe(true)
  })
  it('multi-outcome Σp=1', () => {
    expect(isCoherent([0.2, 0.3, 0.5])).toBe(true)
    expect(isCoherent([0.25, 0.25, 0.25, 0.25])).toBe(true)
  })
  it('flags incoherent vectors (crossed / stale book)', () => {
    expect(isCoherent([0.6, 0.6])).toBe(false)
    expect(isCoherent([0.3, 0.3])).toBe(false)
    expect(isCoherent([])).toBe(false)
  })
  it('tolerance band matches measured book coherence (~1%)', () => {
    expect(isCoherent([0.5, 0.505], 0.01)).toBe(true) // 0.5% off → within 1%
    expect(isCoherent([0.5, 0.52], 0.01)).toBe(false) // 2% off → flagged
  })
})

describe('normalizeToOne — de-vig', () => {
  it('scales to Σ=1', () => {
    expect(normalizeToOne([2, 2])).toEqual([0.5, 0.5])
    const n = normalizeToOne([0.6, 0.6])
    expect(n[0]).toBeCloseTo(0.5, 9)
    expect(n[0] + n[1]).toBeCloseTo(1, 9)
  })
  it('all-zero → uniform prior', () => {
    expect(normalizeToOne([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3])
  })
})

describe('quantizeToTick / isOnTick — {0.001, 0.01} lattice', () => {
  it('snaps to 0.001 tick', () => {
    expect(quantizeToTick(0.5054, 0.001)).toBe(0.505)
    expect(quantizeToTick(0.0854, 0.001)).toBe(0.085)
  })
  it('snaps to 0.01 tick', () => {
    expect(quantizeToTick(0.4999, 0.01)).toBe(0.5)
    expect(quantizeToTick(0.123, 0.01)).toBe(0.12)
  })
  it('clamps into the tradable band', () => {
    expect(quantizeToTick(0.00001, 0.01)).toBe(0.01)
    expect(quantizeToTick(0.99999, 0.001)).toBe(0.999)
    expect(quantizeToTick(1.5, 0.01)).toBe(0.99)
  })
  it('no binary float dust', () => {
    expect(quantizeToTick(0.3, 0.001)).toBe(0.3)
    expect(Number.isInteger(quantizeToTick(0.3, 0.001) * 1000)).toBe(true)
  })
  it('isOnTick recognises lattice points', () => {
    expect(isOnTick(0.505, 0.001)).toBe(true)
    expect(isOnTick(0.5051, 0.001)).toBe(false)
    expect(isOnTick(0.12, 0.01)).toBe(true)
  })
})
