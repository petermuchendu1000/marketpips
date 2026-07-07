import { describe, it, expect } from 'vitest'
import {
  normalizeOutcomes,
  isMultiOutcome,
  impliedProbabilities,
  favoriteOutcome,
  validateOutcomeLabels,
  clamp01,
  MAX_OUTCOMES,
  type MarketOutcomeSource,
  type MarketOptionRow,
} from '@/lib/markets/outcomes'

describe('clamp01', () => {
  it('bounds values to [0,1] and handles junk', () => {
    expect(clamp01(0.42)).toBe(0.42)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(null)).toBe(0)
    expect(clamp01(NaN)).toBe(0)
  })
})

describe('isMultiOutcome', () => {
  it('is true for multiple_choice, false for binary', () => {
    expect(isMultiOutcome({ resolution_type: 'multiple_choice' })).toBe(true)
    expect(isMultiOutcome({ resolution_type: 'binary' })).toBe(false)
  })
  it('falls back to option count when type is unset', () => {
    const opts: MarketOptionRow[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]
    expect(isMultiOutcome({}, opts)).toBe(true)
    expect(isMultiOutcome({}, [{ id: 'a', label: 'A' }])).toBe(false)
  })
})

describe('normalizeOutcomes — binary', () => {
  const market: MarketOutcomeSource = {
    resolution_type: 'binary',
    yes_price: 0.62,
    no_price: 0.38,
    yes_volume_usd: 1000,
    no_volume_usd: 400,
    resolved_outcome: null,
  }

  it('synthesizes Yes/No from prices', () => {
    const o = normalizeOutcomes(market)
    expect(o.map((x) => x.label)).toEqual(['Yes', 'No'])
    expect(o[0].price).toBe(0.62)
    expect(o[1].price).toBe(0.38)
    expect(o[0].volumeUsd).toBe(1000)
    expect(o[0].isWinner).toBeNull()
  })

  it('defaults missing prices to 0.5', () => {
    const o = normalizeOutcomes({ resolution_type: 'binary' })
    expect(o[0].price).toBe(0.5)
    expect(o[1].price).toBe(0.5)
  })

  it('marks the resolved winner/loser', () => {
    const o = normalizeOutcomes({ ...market, resolved_outcome: 'yes' })
    expect(o[0].isWinner).toBe(true)
    expect(o[1].isWinner).toBe(false)
  })
})

describe('normalizeOutcomes — multiple_choice', () => {
  const options: MarketOptionRow[] = [
    { id: 'c', label: 'Charlie', price: 0.2, volume_usd: 50, display_order: 2 },
    { id: 'a', label: 'Alpha', price: 0.5, volume_usd: 200, display_order: 0 },
    { id: 'b', label: 'Bravo', price: 0.3, volume_usd: 90, display_order: 1 },
  ]
  const market: MarketOutcomeSource = { resolution_type: 'multiple_choice', resolved_option_id: null }

  it('maps options ordered by display_order', () => {
    const o = normalizeOutcomes(market, options)
    expect(o.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(o.map((x) => x.label)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(o[0].price).toBe(0.5)
  })

  it('derives winner from resolved_option_id when is_winner absent', () => {
    const o = normalizeOutcomes({ ...market, resolved_option_id: 'b' }, options)
    expect(o.find((x) => x.id === 'b')!.isWinner).toBe(true)
    expect(o.find((x) => x.id === 'a')!.isWinner).toBe(false)
  })

  it('prefers explicit is_winner flags', () => {
    const withFlags = options.map((o) => ({ ...o, is_winner: o.id === 'c' }))
    const o = normalizeOutcomes(market, withFlags)
    expect(o.find((x) => x.id === 'c')!.isWinner).toBe(true)
    expect(o.find((x) => x.id === 'a')!.isWinner).toBe(false)
  })

  it('clamps out-of-range option prices', () => {
    const o = normalizeOutcomes(market, [{ id: 'x', label: 'X', price: 1.5, display_order: 0 }, { id: 'y', label: 'Y', price: -0.2, display_order: 1 }])
    expect(o[0].price).toBe(1)
    expect(o[1].price).toBe(0)
  })
})

describe('impliedProbabilities', () => {
  it('normalizes to sum 1', () => {
    const o = normalizeOutcomes({ resolution_type: 'multiple_choice' }, [
      { id: 'a', label: 'A', price: 0.5, display_order: 0 },
      { id: 'b', label: 'B', price: 0.3, display_order: 1 },
      { id: 'c', label: 'C', price: 0.4, display_order: 2 },
    ])
    const p = impliedProbabilities(o)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(p[0]).toBeCloseTo(0.5 / 1.2, 6)
  })

  it('falls back to a uniform distribution when all prices are 0', () => {
    const o = normalizeOutcomes({ resolution_type: 'multiple_choice' }, [
      { id: 'a', label: 'A', price: 0, display_order: 0 },
      { id: 'b', label: 'B', price: 0, display_order: 1 },
    ])
    expect(impliedProbabilities(o)).toEqual([0.5, 0.5])
  })
})

describe('favoriteOutcome', () => {
  it('returns the highest-priced outcome', () => {
    const o = normalizeOutcomes({ resolution_type: 'binary', yes_price: 0.7, no_price: 0.3 })
    expect(favoriteOutcome(o)!.label).toBe('Yes')
  })
  it('returns null for an empty set', () => {
    expect(favoriteOutcome([])).toBeNull()
  })
})

describe('validateOutcomeLabels', () => {
  it('accepts a clean 2..N set and trims', () => {
    const r = validateOutcomeLabels([' Red ', 'Green', 'Blue'])
    expect(r.ok).toBe(true)
    expect(r.labels).toEqual(['Red', 'Green', 'Blue'])
  })
  it('rejects fewer than 2 non-empty labels', () => {
    expect(validateOutcomeLabels(['Only', '   ']).ok).toBe(false)
  })
  it('rejects more than the max', () => {
    const many = Array.from({ length: MAX_OUTCOMES + 1 }, (_, i) => `Opt ${i}`)
    expect(validateOutcomeLabels(many).ok).toBe(false)
  })
  it('rejects case-insensitive duplicates', () => {
    const r = validateOutcomeLabels(['Yes', 'yes'])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Duplicate/)
  })
  it('rejects over-long labels', () => {
    const r = validateOutcomeLabels(['ok', 'x'.repeat(200)])
    expect(r.ok).toBe(false)
  })
})
