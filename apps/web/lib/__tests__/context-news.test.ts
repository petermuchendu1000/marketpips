import { describe, it, expect } from 'vitest'
import { formatMove, deriveVerb, type OutcomeMove } from '@/lib/markets/context-news'

function makeMove(overrides: Partial<OutcomeMove> = {}): OutcomeMove {
  return {
    outcomeLabel: 'JD Vance',
    verb: 'jumps to',
    newProbPct: 28,
    deltaPct: 9,
    ...overrides,
  }
}

describe('formatMove', () => {
  it('composes text from label, verb, and rounded probability', () => {
    expect(formatMove(makeMove()).text).toBe('JD Vance jumps to 28%')
  })

  it('uses the provided verb, not a derived one', () => {
    expect(formatMove(makeMove({ verb: 'jumps to', deltaPct: 2 })).text).toBe('JD Vance jumps to 28%')
  })

  it('rounds fractional newProbPct up (27.6 -> 28)', () => {
    expect(formatMove(makeMove({ newProbPct: 27.6 })).text).toBe('JD Vance jumps to 28%')
  })

  it('rounds fractional newProbPct down (27.4 -> 27)', () => {
    expect(formatMove(makeMove({ newProbPct: 27.4 })).text).toBe('JD Vance jumps to 27%')
  })

  describe('deltaLabel sign and rounding', () => {
    it('positive delta -> "+N%" (9 -> "+9%")', () => {
      expect(formatMove(makeMove({ deltaPct: 9 })).deltaLabel).toBe('+9%')
    })
    it('negative delta -> "-N%" (-3 -> "-3%")', () => {
      expect(formatMove(makeMove({ deltaPct: -3 })).deltaLabel).toBe('-3%')
    })
    it('zero delta -> "+0%"', () => {
      expect(formatMove(makeMove({ deltaPct: 0 })).deltaLabel).toBe('+0%')
    })
    it('positive fractional delta rounds (2.4 -> "+2%")', () => {
      expect(formatMove(makeMove({ deltaPct: 2.4 })).deltaLabel).toBe('+2%')
    })
    it('negative fractional delta rounds by magnitude (-3.5 -> "-4%")', () => {
      expect(formatMove(makeMove({ deltaPct: -3.5 })).deltaLabel).toBe('-4%')
    })
  })

  describe('isUp boundary', () => {
    it('is true for positive delta', () => {
      expect(formatMove(makeMove({ deltaPct: 5 })).isUp).toBe(true)
    })
    it('is true at exactly 0 (>=0 is up)', () => {
      expect(formatMove(makeMove({ deltaPct: 0 })).isUp).toBe(true)
    })
    it('is false for negative delta', () => {
      expect(formatMove(makeMove({ deltaPct: -0.1 })).isUp).toBe(false)
    })
  })
})

describe('deriveVerb', () => {
  it('returns "dips to" for negative delta (-1)', () => {
    expect(deriveVerb(-1)).toBe('dips to')
  })
  it('returns "rises to" at 0', () => {
    expect(deriveVerb(0)).toBe('rises to')
  })
  it('returns "rises to" just below the jump threshold (7.9)', () => {
    expect(deriveVerb(7.9)).toBe('rises to')
  })
  it('returns "jumps to" at exactly 8', () => {
    expect(deriveVerb(8)).toBe('jumps to')
  })
  it('returns "jumps to" for large delta (20)', () => {
    expect(deriveVerb(20)).toBe('jumps to')
  })
})
