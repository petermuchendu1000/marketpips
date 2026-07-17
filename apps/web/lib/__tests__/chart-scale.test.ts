// lib/__tests__/chart-scale.test.ts
// ------------------------------------------------------------
// Locks the market-detail chart Y-axis to the values MEASURED LIVE on Polymarket
// (2026-07). PM does not pin the probability axis to 0–100%; it zooms to the
// series' historical max with headroom and lands on nice round ticks:
//   • multi-outcome board, leader hist-max ~22%  -> 0 / 10 / 20 / 30%
//   • binary market ("24% chance"), hist-max ~45% -> 0 / 15 / 30 / 45 / 60%
// If niceProbScale regresses, these fail.
import { describe, it, expect } from 'vitest'
import { niceProbScale, CHART_GRID_DASH } from '../markets/chart-scale'

describe('CHART_GRID_DASH (Polymarket-parity dotted gridline)', () => {
  it('is the fine 1-on/3-off dotted cadence observed on PM (stroke-dasharray 1 3)', () => {
    expect(CHART_GRID_DASH).toBe('1 3')
  })
})

describe('niceProbScale (Polymarket-parity dynamic axis)', () => {
  it('multi-outcome leader ~22% -> 0/10/20/30%', () => {
    const { max, ticks } = niceProbScale(0.22)
    expect(max).toBeCloseTo(0.3, 6)
    expect(ticks).toEqual([0, 0.1, 0.2, 0.3])
  })

  it('binary hist-max ~45% -> 0/15/30/45/60%', () => {
    const { max, ticks } = niceProbScale(0.45)
    expect(max).toBeCloseTo(0.6, 6)
    expect(ticks).toEqual([0, 0.15, 0.3, 0.45, 0.6])
  })

  it('two-line binary (~100%) -> clean 0/20/40/60/80/100%', () => {
    const { max, ticks } = niceProbScale(0.99)
    expect(max).toBeCloseTo(1, 6)
    expect(ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('never exceeds 100% and always starts at 0', () => {
    for (const v of [0, 0.01, 0.5, 0.8, 1]) {
      const { max, ticks } = niceProbScale(v)
      expect(ticks[0]).toBe(0)
      expect(max).toBeLessThanOrEqual(1)
      expect(ticks[ticks.length - 1]).toBeCloseTo(max, 6)
    }
  })
})
