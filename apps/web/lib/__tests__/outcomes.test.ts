import { describe, it, expect } from 'vitest'
import {
  normalizeOutcomes,
  isMultiOutcome,
  isIndependentOptions,
  optionsPricingMode,
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

describe('Phase C — independent option pricing (migration 023)', () => {
  const opts: MarketOptionRow[] = [
    { id: 'a', label: 'Alice', price: 0.47, yes_price: 0.47, no_price: 0.53, display_order: 0 },
    { id: 'b', label: 'Bob', price: 0.38, yes_price: 0.38, no_price: 0.62, display_order: 1 },
    { id: 'c', label: 'Carol', price: 0.20, yes_price: 0.20, no_price: 0.80, display_order: 2 },
  ]

  it('optionsPricingMode defaults to simplex and reads independent', () => {
    expect(optionsPricingMode({})).toBe('simplex')
    expect(optionsPricingMode({ options_pricing_mode: 'simplex' })).toBe('simplex')
    expect(optionsPricingMode({ options_pricing_mode: 'independent' })).toBe('independent')
    // Unknown/garbage falls back to simplex (fail-safe).
    expect(optionsPricingMode({ options_pricing_mode: 'weird' })).toBe('simplex')
  })

  it('isIndependentOptions requires BOTH independent mode and multi-outcome', () => {
    const m: MarketOutcomeSource = { resolution_type: 'multiple_choice', options_pricing_mode: 'independent' }
    expect(isIndependentOptions(m, opts)).toBe(true)
    expect(isIndependentOptions({ resolution_type: 'multiple_choice' }, opts)).toBe(false) // simplex
    expect(isIndependentOptions({ resolution_type: 'binary', options_pricing_mode: 'independent' }, [])).toBe(false)
  })

  it('exposes per-candidate yes/no lines; each candidate yes+no === 1', () => {
    const m: MarketOutcomeSource = { resolution_type: 'multiple_choice', options_pricing_mode: 'independent' }
    const outs = normalizeOutcomes(m, opts)
    expect(outs).toHaveLength(3)
    for (const o of outs) {
      expect(o.yesPrice).not.toBeNull()
      expect(o.noPrice).not.toBeNull()
      expect((o.yesPrice as number) + (o.noPrice as number)).toBeCloseTo(1, 6)
      // `price` mirrors the candidate Yes probability in independent mode.
      expect(o.price).toBeCloseTo(o.yesPrice as number, 6)
    }
  })

  it('INDEPENDENCE: yes-prices need NOT sum to 1 across candidates', () => {
    const m: MarketOutcomeSource = { resolution_type: 'multiple_choice', options_pricing_mode: 'independent' }
    const outs = normalizeOutcomes(m, opts)
    const sumYes = outs.reduce((s, o) => s + (o.yesPrice as number), 0)
    // 0.47 + 0.38 + 0.20 = 1.05 — the Polymarket/Kalshi behaviour, not a simplex.
    expect(sumYes).toBeCloseTo(1.05, 6)
    expect(sumYes).not.toBeCloseTo(1, 3)
  })

  it('derives no_price = 1 - yes when only yes_price is stored', () => {
    const m: MarketOutcomeSource = { resolution_type: 'multiple_choice', options_pricing_mode: 'independent' }
    const partial: MarketOptionRow[] = [
      { id: 'a', label: 'A', yes_price: 0.6, display_order: 0 },
      { id: 'b', label: 'B', yes_price: 0.3, display_order: 1 },
    ]
    const outs = normalizeOutcomes(m, partial)
    expect(outs[0].noPrice).toBeCloseTo(0.4, 6)
    expect(outs[1].noPrice).toBeCloseTo(0.7, 6)
  })

  it('simplex markets keep yesPrice/noPrice null (no behavioural change)', () => {
    const m: MarketOutcomeSource = { resolution_type: 'multiple_choice' }
    const outs = normalizeOutcomes(m, opts)
    for (const o of outs) {
      expect(o.yesPrice).toBeNull()
      expect(o.noPrice).toBeNull()
    }
  })

  it('binary markets are unaffected (yesPrice/noPrice null)', () => {
    const outs = normalizeOutcomes({ resolution_type: 'binary', yes_price: 0.6, no_price: 0.4 })
    expect(outs.map((o) => o.label)).toEqual(['Yes', 'No'])
    expect(outs[0].yesPrice).toBeNull()
    expect(outs[1].noPrice).toBeNull()
  })
})
