import { describe, it, expect } from 'vitest'
import { isSettling, hideSettling } from '@/lib/markets/settling'

const NOW = Date.UTC(2026, 6, 12, 12, 0, 0) // fixed clock for determinism
const future = new Date(NOW + 60_000).toISOString()
const past = new Date(NOW - 60_000).toISOString()

describe('isSettling', () => {
  it('flags active rows whose close time has passed', () => {
    expect(isSettling({ status: 'active', closes_at: past }, NOW)).toBe(true)
  })
  it('keeps active rows that are still open', () => {
    expect(isSettling({ status: 'active', closes_at: future }, NOW)).toBe(false)
  })
  it('treats the exact close boundary as settling', () => {
    expect(isSettling({ status: 'active', closes_at: new Date(NOW).toISOString() }, NOW)).toBe(true)
  })
  it('ignores non-active statuses even if past close', () => {
    expect(isSettling({ status: 'resolved', closes_at: past }, NOW)).toBe(false)
    expect(isSettling({ status: 'closed', closes_at: past }, NOW)).toBe(false)
  })
  it('is safe when closes_at is missing or invalid', () => {
    expect(isSettling({ status: 'active', closes_at: null }, NOW)).toBe(false)
    expect(isSettling({ status: 'active', closes_at: 'not-a-date' }, NOW)).toBe(false)
    expect(isSettling({ status: 'active' }, NOW)).toBe(false)
  })
})

describe('hideSettling', () => {
  it('removes only settling rows and preserves order', () => {
    const rows = [
      { id: 'a', status: 'active', closes_at: future },
      { id: 'b', status: 'active', closes_at: past }, // settling → dropped
      { id: 'c', status: 'resolved', closes_at: past },
      { id: 'd', status: 'active', closes_at: future },
    ]
    expect(hideSettling(rows, NOW).map((m) => m.id)).toEqual(['a', 'c', 'd'])
  })
  it('returns an empty list when everything is settling', () => {
    const rows = [
      { id: 'x', status: 'active', closes_at: past },
      { id: 'y', status: 'active', closes_at: past },
    ]
    expect(hideSettling(rows, NOW)).toEqual([])
  })
})
