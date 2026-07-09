import { describe, it, expect } from 'vitest'
import {
  serializePendingBet,
  parsePendingBet,
  PENDING_BET_TTL_MS,
  type PendingBetInput,
} from '@/lib/pending-bet'

const NOW = 1_700_000_000_000

const baseInput: PendingBetInput = {
  marketId: 'm-123',
  slug: 'will-x-happen',
  side: 'yes',
  amount: 250,
  currency: 'KES',
  independent: false,
}

describe('serializePendingBet', () => {
  it('stamps version + timestamp and round-trips through parse', () => {
    const raw = serializePendingBet(baseInput, NOW)
    const parsed = parsePendingBet(raw, { nowMs: NOW })
    expect(parsed).toEqual({ v: 1, ts: NOW, ...baseInput })
  })

  it('omits optionId when not provided, includes it when set', () => {
    expect(parsePendingBet(serializePendingBet(baseInput, NOW), { nowMs: NOW })?.optionId).toBeUndefined()
    const withOpt = serializePendingBet({ ...baseInput, optionId: 'opt-9' }, NOW)
    expect(parsePendingBet(withOpt, { nowMs: NOW })?.optionId).toBe('opt-9')
  })

  it('coerces independent to a real boolean', () => {
    const raw = serializePendingBet({ ...baseInput, independent: true }, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW })?.independent).toBe(true)
  })
})

describe('parsePendingBet — freshness', () => {
  it('accepts a snapshot within the TTL window', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW + PENDING_BET_TTL_MS - 1 })).not.toBeNull()
  })

  it('rejects a snapshot past the TTL', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW + PENDING_BET_TTL_MS + 1 })).toBeNull()
  })

  it('rejects a future timestamp (clock skew)', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW - 1 })).toBeNull()
  })

  it('honors a custom ttlMs', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW + 5000, ttlMs: 1000 })).toBeNull()
    expect(parsePendingBet(raw, { nowMs: NOW + 500, ttlMs: 1000 })).not.toBeNull()
  })
})

describe('parsePendingBet — market scoping', () => {
  it('returns the bet when marketId matches', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW, marketId: 'm-123' })?.marketId).toBe('m-123')
  })

  it('rejects a bet built on a different market', () => {
    const raw = serializePendingBet(baseInput, NOW)
    expect(parsePendingBet(raw, { nowMs: NOW, marketId: 'other' })).toBeNull()
  })
})

describe('parsePendingBet — validation (fail-safe)', () => {
  it('rejects empty / non-string / non-object input', () => {
    expect(parsePendingBet('', { nowMs: NOW })).toBeNull()
    expect(parsePendingBet('not json', { nowMs: NOW })).toBeNull()
    expect(parsePendingBet(null, { nowMs: NOW })).toBeNull()
    expect(parsePendingBet(42, { nowMs: NOW })).toBeNull()
  })

  it('rejects an unknown/absent version', () => {
    expect(parsePendingBet(JSON.stringify({ ...baseInput, ts: NOW }), { nowMs: NOW })).toBeNull()
    expect(parsePendingBet(JSON.stringify({ v: 2, ts: NOW, ...baseInput }), { nowMs: NOW })).toBeNull()
  })

  it('rejects a bad side', () => {
    const bad = JSON.stringify({ v: 1, ts: NOW, ...baseInput, side: 'maybe' })
    expect(parsePendingBet(bad, { nowMs: NOW })).toBeNull()
  })

  it('rejects a non-positive or non-finite amount', () => {
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bad = JSON.stringify({ v: 1, ts: NOW, ...baseInput, amount })
      expect(parsePendingBet(bad, { nowMs: NOW })).toBeNull()
    }
  })

  it('rejects missing marketId / slug / currency', () => {
    expect(parsePendingBet(JSON.stringify({ v: 1, ts: NOW, ...baseInput, marketId: '' }), { nowMs: NOW })).toBeNull()
    expect(parsePendingBet(JSON.stringify({ v: 1, ts: NOW, ...baseInput, slug: '' }), { nowMs: NOW })).toBeNull()
    expect(parsePendingBet(JSON.stringify({ v: 1, ts: NOW, ...baseInput, currency: '' }), { nowMs: NOW })).toBeNull()
  })

  it('rejects a non-boolean independent flag', () => {
    const bad = JSON.stringify({ v: 1, ts: NOW, ...baseInput, independent: 'yes' })
    expect(parsePendingBet(bad, { nowMs: NOW })).toBeNull()
  })
})
