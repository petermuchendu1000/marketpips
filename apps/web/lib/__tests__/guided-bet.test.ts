import { describe, it, expect } from 'vitest'
import {
  guidedStakePresets,
  guidedProgress,
  guidedStakeGate,
} from '@/lib/guided-bet'

describe('guidedStakePresets', () => {
  it('seeds local starters from the minimum when the wallet is empty', () => {
    expect(guidedStakePresets(0, 100)).toEqual([100, 500, 1000, 2000])
  })

  it('scales to a balance (10/25/50/100%) and stays sorted + unique', () => {
    expect(guidedStakePresets(1000, 100)).toEqual([100, 250, 500, 1000])
  })

  it('never emits a chip below one unit and de-duplicates', () => {
    // A tiny balance collapses the fractions toward the floor; result stays unique.
    const chips = guidedStakePresets(3, 100)
    expect(chips.every((c) => c >= 1)).toBe(true)
    expect(new Set(chips).size).toBe(chips.length)
    expect([...chips]).toEqual([...chips].sort((a, b) => a - b))
  })

  it('tolerates a zero/blank minimum without producing NaN or zero chips', () => {
    const chips = guidedStakePresets(0, 0)
    expect(chips.every((c) => Number.isFinite(c) && c > 0)).toBe(true)
  })
})

describe('guidedProgress', () => {
  it('is low before a side is chosen (endowed progress not yet earned)', () => {
    expect(guidedProgress('stake', false)).toBe(15)
  })
  it('jumps once a side is chosen, then again at confirm', () => {
    expect(guidedProgress('stake', true)).toBe(45)
    expect(guidedProgress('confirm', true)).toBe(85)
  })
})

describe('guidedStakeGate', () => {
  const base = {
    isOpen: true,
    hasSelection: true,
    amount: 100,
    belowMin: false,
    overBalance: false,
    minLabel: 'KES 10',
    balanceLabel: 'KES 1,500',
  }

  it('passes a valid stake', () => {
    expect(guidedStakeGate(base)).toEqual({ ok: true })
  })

  it('blocks a closed market first', () => {
    const g = guidedStakeGate({ ...base, isOpen: false, amount: 0, belowMin: true })
    expect(g).toEqual({ ok: false, reason: 'This market is closed for trading.' })
  })

  it('requires a selection', () => {
    expect(guidedStakeGate({ ...base, hasSelection: false })).toMatchObject({ ok: false })
  })

  it('requires a positive amount', () => {
    expect(guidedStakeGate({ ...base, amount: 0 })).toMatchObject({
      ok: false,
      reason: 'Enter how much you want to bet.',
    })
  })

  it('surfaces the minimum and balance reasons with their labels', () => {
    expect(guidedStakeGate({ ...base, belowMin: true }).ok).toBe(false)
    expect(guidedStakeGate({ ...base, belowMin: true })).toMatchObject({
      reason: 'Minimum bet is KES 10.',
    })
    expect(guidedStakeGate({ ...base, overBalance: true })).toMatchObject({
      reason: 'You only have KES 1,500. Top up or lower the stake.',
    })
  })
})
