// lib/__tests__/chart-domain.test.ts
// ------------------------------------------------------------
// Regression guard for the probability-chart y-axis domain (niceDomain).
//
// Context: a prior session chased a "binary endpoint doesn't match the legend"
// ghost that turned out to be stale Next.js dev-fetch cache — the DB series and
// the domain math were correct. While confirming that, an exhaustive scan
// surfaced a REAL latent bug: the old niceDomain could pick hi < max, clamping
// the top of a line (and its endpoint dot) flat against the top gridline in 240
// input ranges. These tests lock the fixed invariants so neither issue recurs.
import { describe, it, expect } from 'vitest'
import { niceDomain } from '@/lib/markets/chart-domain'

describe('niceDomain — structural invariants', () => {
  it('always returns exactly 5 strictly-increasing ticks in [0,1]', () => {
    for (let a = 0; a < 100; a++) {
      for (let s = 0; s <= 60; s++) {
        const min = a / 100
        const max = min + s / 100
        if (max > 1) continue
        const { lo, hi, ticks } = niceDomain(min, max)
        expect(ticks).toHaveLength(5)
        expect(lo).toBeGreaterThanOrEqual(0)
        expect(hi).toBeLessThanOrEqual(1)
        expect(hi).toBeGreaterThan(lo)
        for (let k = 0; k < 4; k++) expect(ticks[k + 1]).toBeGreaterThan(ticks[k])
        expect(ticks[0]).toBeCloseTo(lo, 6)
        expect(ticks[4]).toBeCloseTo(hi, 6)
      }
    }
  })

  it('FULLY CONTAINS the data range for every input (no clipping) — the core fix', () => {
    const failures: Array<[number, number, number, number]> = []
    for (let a = 0; a < 100; a++) {
      for (let s = 0; s <= 60; s++) {
        const min = a / 100
        const max = min + s / 100
        if (max > 1) continue
        const { lo, hi } = niceDomain(min, max)
        if (lo > min + 1e-9 || hi < max - 1e-9) failures.push([min, max, lo, hi])
      }
    }
    expect(failures).toEqual([])
  })

  it('covers the exact cases the OLD implementation clipped', () => {
    // e.g. min=0.07 max=0.21 used to yield [0,0.20], clipping the 0.21 peak.
    for (const [min, max] of [
      [0.07, 0.21],
      [0.09, 0.41],
      [0.12, 0.44],
      [0.13, 0.44],
    ] as const) {
      const { lo, hi } = niceDomain(min, max)
      expect(lo).toBeLessThanOrEqual(min + 1e-9)
      expect(hi).toBeGreaterThanOrEqual(max - 1e-9)
    }
  })
})

describe('niceDomain — behaviour parity on known-good cases', () => {
  it('keeps the live Ruto binary series on a 40–80% axis', () => {
    // Series min 0.46 / max 0.71618 (verified against Supabase). The endpoint
    // (yes_price 0.46 = legend value) must sit strictly inside this band.
    const { lo, hi, ticks } = niceDomain(0.46, 0.71618)
    expect(ticks.map((t) => Math.round(t * 100))).toEqual([40, 50, 60, 70, 80])
    const endpoint = 0.46
    expect(endpoint).toBeGreaterThan(lo)
    expect(endpoint).toBeLessThan(hi)
  })

  it('gives near-flat data a readable, centred-ish band rather than a zero-height line', () => {
    const { lo, hi } = niceDomain(0.5, 0.5)
    expect(hi - lo).toBeGreaterThanOrEqual(0.15)
    expect(0.5).toBeGreaterThan(lo)
    expect(0.5).toBeLessThan(hi)
  })

  it('handles the extremes (near-0 and near-1) without leaving [0,1]', () => {
    const near0 = niceDomain(0.0, 0.02)
    expect(near0.lo).toBe(0)
    expect(near0.hi).toBeLessThanOrEqual(1)
    const near1 = niceDomain(0.95, 0.99)
    expect(near1.hi).toBe(1)
    expect(near1.lo).toBeGreaterThanOrEqual(0)
    expect(0.99).toBeLessThanOrEqual(near1.hi + 1e-9)
  })
})
