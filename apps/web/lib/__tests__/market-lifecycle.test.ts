import { describe, it, expect } from 'vitest'
import {
  canTransition,
  validateTransition,
  isTerminalStatus,
  ALLOWED_TRANSITIONS,
  MARKET_STATUSES,
  TERMINAL_STATUSES,
} from '@/lib/market-lifecycle'

describe('market lifecycle — allowed transitions', () => {
  it('permits the canonical happy path', () => {
    expect(canTransition('draft', 'pending')).toBe(true)
    expect(canTransition('pending', 'active')).toBe(true)
    expect(canTransition('active', 'closed')).toBe(true)
    expect(canTransition('closed', 'resolved')).toBe(true)
  })

  it('permits admin shortcuts and review paths', () => {
    expect(canTransition('draft', 'active')).toBe(true)
    expect(canTransition('pending', 'draft')).toBe(true)
    expect(canTransition('active', 'disputed')).toBe(true)
    expect(canTransition('disputed', 'resolved')).toBe(true)
  })

  it('allows cancellation from non-terminal states', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true)
    expect(canTransition('pending', 'cancelled')).toBe(true)
    expect(canTransition('active', 'cancelled')).toBe(true)
    expect(canTransition('closed', 'cancelled')).toBe(true)
  })
})

describe('market lifecycle — forbidden transitions', () => {
  it('rejects skipping the lifecycle', () => {
    expect(canTransition('draft', 'resolved')).toBe(false)
    expect(canTransition('draft', 'closed')).toBe(false)
    expect(canTransition('active', 'resolved')).toBe(false) // must close first
    expect(canTransition('pending', 'closed')).toBe(false)
  })

  it('treats same-status as a non-transition', () => {
    expect(canTransition('active', 'active')).toBe(false)
  })

  it('blocks any change out of a terminal state', () => {
    expect(isTerminalStatus('resolved')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(canTransition('resolved', 'active')).toBe(false)
    expect(canTransition('cancelled', 'active')).toBe(false)
    expect(ALLOWED_TRANSITIONS.resolved).toHaveLength(0)
    expect(ALLOWED_TRANSITIONS.cancelled).toHaveLength(0)
  })
})

describe('validateTransition — structured results', () => {
  it('returns ok for a legal move', () => {
    expect(validateTransition('pending', 'active')).toEqual({ ok: true })
  })
  it('explains illegal moves', () => {
    expect(validateTransition('active', 'resolved')).toMatchObject({ ok: false })
    expect(validateTransition('resolved', 'active').error).toMatch(/cannot change a resolved/i)
    expect(validateTransition('active', 'active').error).toMatch(/already active/i)
  })
  it('rejects unknown target statuses', () => {
    // @ts-expect-error — deliberately invalid status
    expect(validateTransition('active', 'frozen').ok).toBe(false)
  })
})

describe('lifecycle invariants', () => {
  it('every status has a transition list and terminal states are a subset', () => {
    for (const s of MARKET_STATUSES) {
      expect(Array.isArray(ALLOWED_TRANSITIONS[s])).toBe(true)
    }
    for (const t of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[t]).toHaveLength(0)
    }
  })
})
