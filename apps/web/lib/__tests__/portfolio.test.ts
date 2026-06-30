import { describe, it, expect } from 'vitest'
import {
  positionValue,
  unrealizedPnl,
  resolvedPnl,
  classifyOutcome,
  computePositionPnl,
  summarizePortfolio,
  type MarketValuationInput,
  type PositionWithMarket,
} from '@/lib/portfolio'

function market(overrides: Partial<MarketValuationInput> = {}): MarketValuationInput {
  return {
    yes_price: 0.6,
    no_price: 0.4,
    status: 'active',
    resolved_outcome: null,
    ...overrides,
  }
}

describe('positionValue (mark-to-market)', () => {
  it('values a YES position at the live yes price', () => {
    expect(positionValue('yes', 100, 0.6, 0.4)).toBeCloseTo(60, 9)
  })
  it('values a NO position at the live no price', () => {
    expect(positionValue('no', 100, 0.6, 0.4)).toBeCloseTo(40, 9)
  })
  it('is zero for zero shares', () => {
    expect(positionValue('yes', 0, 0.6, 0.4)).toBe(0)
  })
})

describe('unrealizedPnl', () => {
  it('is currentValue minus invested', () => {
    expect(unrealizedPnl(60, 50)).toBeCloseTo(10, 9)
    expect(unrealizedPnl(40, 50)).toBeCloseTo(-10, 9)
  })
})

describe('resolvedPnl', () => {
  it('win pays $1/share minus cost', () => {
    expect(resolvedPnl('resolved_win', 100, 60)).toBeCloseTo(40, 9)
  })
  it('loss forfeits the full investment', () => {
    expect(resolvedPnl('resolved_loss', 100, 60)).toBeCloseTo(-60, 9)
  })
  it('cancelled/active are zero (refund / not settled)', () => {
    expect(resolvedPnl('cancelled', 100, 60)).toBe(0)
    expect(resolvedPnl('active', 100, 60)).toBe(0)
  })
})

describe('classifyOutcome', () => {
  it('active while market is open', () => {
    expect(classifyOutcome('yes', { status: 'active', resolved_outcome: null })).toBe('active')
  })
  it('win when side matches resolved outcome', () => {
    expect(classifyOutcome('yes', { status: 'resolved', resolved_outcome: 'yes' })).toBe('resolved_win')
  })
  it('loss when side differs from resolved outcome', () => {
    expect(classifyOutcome('no', { status: 'resolved', resolved_outcome: 'yes' })).toBe('resolved_loss')
  })
  it('cancelled market refunds', () => {
    expect(classifyOutcome('yes', { status: 'cancelled', resolved_outcome: null })).toBe('cancelled')
  })
  it('resolved without an outcome is treated as a refund', () => {
    expect(classifyOutcome('yes', { status: 'resolved', resolved_outcome: null })).toBe('cancelled')
  })
})

describe('computePositionPnl — the core "bet shows up with correct P&L" guarantee', () => {
  it('open position is marked to LIVE price, not the stale snapshot', () => {
    // Bought 100 YES @ 0.50 ($50). Price has since risen to 0.60.
    const pos = { id: 'p1', side: 'yes' as const, shares: 100, total_invested_usd: 50 }
    const r = computePositionPnl(pos, market({ yes_price: 0.6, no_price: 0.4 }))
    expect(r.outcome).toBe('active')
    expect(r.isSettled).toBe(false)
    expect(r.currentValue).toBeCloseTo(60, 9) // 100 · 0.60 — live, not $50
    expect(r.unrealizedPnl).toBeCloseTo(10, 9)
    expect(r.realizedPnl).toBe(0)
    expect(r.totalPnl).toBeCloseTo(10, 9)
    expect(r.pnlPct).toBeCloseTo(0.2, 9)
  })

  it('open position shows a loss when price falls', () => {
    const pos = { id: 'p2', side: 'yes' as const, shares: 100, total_invested_usd: 50 }
    const r = computePositionPnl(pos, market({ yes_price: 0.3, no_price: 0.7 }))
    expect(r.currentValue).toBeCloseTo(30, 9)
    expect(r.unrealizedPnl).toBeCloseTo(-20, 9)
    expect(r.totalPnl).toBeCloseTo(-20, 9)
  })

  it('resolved WIN settles at $1/share with realized P&L', () => {
    const pos = { id: 'p3', side: 'yes' as const, shares: 100, total_invested_usd: 60 }
    const r = computePositionPnl(pos, market({ status: 'resolved', resolved_outcome: 'yes' }))
    expect(r.outcome).toBe('resolved_win')
    expect(r.isSettled).toBe(true)
    expect(r.currentValue).toBeCloseTo(100, 9)
    expect(r.realizedPnl).toBeCloseTo(40, 9)
    expect(r.unrealizedPnl).toBe(0)
    expect(r.totalPnl).toBeCloseTo(40, 9)
  })

  it('resolved LOSS forfeits the stake', () => {
    const pos = { id: 'p4', side: 'no' as const, shares: 100, total_invested_usd: 60 }
    const r = computePositionPnl(pos, market({ status: 'resolved', resolved_outcome: 'yes' }))
    expect(r.outcome).toBe('resolved_loss')
    expect(r.currentValue).toBe(0)
    expect(r.realizedPnl).toBeCloseTo(-60, 9)
    expect(r.totalPnl).toBeCloseTo(-60, 9)
  })

  it('cancelled market refunds the investment with zero P&L', () => {
    const pos = { id: 'p5', side: 'yes' as const, shares: 100, total_invested_usd: 60 }
    const r = computePositionPnl(pos, market({ status: 'cancelled' }))
    expect(r.outcome).toBe('cancelled')
    expect(r.currentValue).toBeCloseTo(60, 9)
    expect(r.totalPnl).toBe(0)
  })

  it('falls back to cost basis when no market is joined', () => {
    const pos = { id: 'p6', side: 'yes' as const, shares: 100, total_invested_usd: 60 }
    const r = computePositionPnl(pos, null)
    expect(r.currentValue).toBeCloseTo(60, 9)
    expect(r.totalPnl).toBe(0)
  })

  it('handles zero invested without dividing by zero', () => {
    const pos = { id: 'p7', side: 'yes' as const, shares: 0, total_invested_usd: 0 }
    const r = computePositionPnl(pos, market())
    expect(r.pnlPct).toBe(0)
    expect(Number.isFinite(r.markPrice)).toBe(true)
  })
})

describe('summarizePortfolio', () => {
  const positions: PositionWithMarket[] = [
    // open winner: 100 YES @0.50 now 0.60 → value 60, unreal +10
    { id: 'a', side: 'yes', shares: 100, total_invested_usd: 50, market: market({ yes_price: 0.6, no_price: 0.4 }) },
    // open loser: 100 NO @0.50 now 0.40 → value 40, unreal -10
    { id: 'b', side: 'no', shares: 100, total_invested_usd: 50, market: market({ yes_price: 0.6, no_price: 0.4 }) },
    // resolved win: realized +40
    { id: 'c', side: 'yes', shares: 100, total_invested_usd: 60, market: market({ status: 'resolved', resolved_outcome: 'yes' }) },
    // resolved loss: realized -30
    { id: 'd', side: 'no', shares: 50, total_invested_usd: 30, market: market({ status: 'resolved', resolved_outcome: 'yes' }) },
  ]

  it('separates open exposure from settled realized P&L', () => {
    const { summary } = summarizePortfolio(positions)
    expect(summary.openCount).toBe(2)
    expect(summary.settledCount).toBe(2)
    expect(summary.totalInvested).toBeCloseTo(100, 9) // 50 + 50 open only
    expect(summary.totalCurrentValue).toBeCloseTo(100, 9) // 60 + 40
    expect(summary.totalUnrealizedPnl).toBeCloseTo(0, 9) // +10 - 10
    expect(summary.totalRealizedPnl).toBeCloseTo(10, 9) // +40 - 30
    expect(summary.totalPnl).toBeCloseTo(10, 9)
  })

  it('returns a computed entry per position, in order', () => {
    const { positions: computed } = summarizePortfolio(positions)
    expect(computed.map((c) => c.positionId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is empty-safe', () => {
    const { summary } = summarizePortfolio([])
    expect(summary.totalPnl).toBe(0)
    expect(summary.unrealizedPnlPct).toBe(0)
  })
})
