import { describe, it, expect } from 'vitest'
import {
  canTransition,
  runActions,
  isItemEligible,
  summariseRun,
  defaultPeriod,
  type ItemLike,
} from '@/lib/admin/payouts'

describe('run state machine', () => {
  it('allows the happy path draft->computed->approved->disbursed', () => {
    expect(canTransition('draft', 'computed')).toBe(true)
    expect(canTransition('computed', 'approved')).toBe(true)
    expect(canTransition('approved', 'disbursed')).toBe(true)
  })
  it('allows recompute while computed', () => {
    expect(canTransition('computed', 'computed')).toBe(true)
  })
  it('forbids skipping states', () => {
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('draft', 'disbursed')).toBe(false)
    expect(canTransition('computed', 'disbursed')).toBe(false)
  })
  it('disbursed and cancelled are terminal', () => {
    expect(canTransition('disbursed', 'cancelled')).toBe(false)
    expect(canTransition('cancelled', 'computed')).toBe(false)
  })
  it('cancel allowed before disbursement only', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true)
    expect(canTransition('approved', 'cancelled')).toBe(true)
    expect(canTransition('disbursed', 'cancelled')).toBe(false)
  })
})

describe('runActions', () => {
  it('draft: compute + cancel only', () => {
    expect(runActions('draft')).toEqual({ canCompute: true, canApprove: false, canDisburse: false, canCancel: true })
  })
  it('computed: compute + approve + cancel', () => {
    expect(runActions('computed')).toEqual({ canCompute: true, canApprove: true, canDisburse: false, canCancel: true })
  })
  it('approved: disburse + cancel', () => {
    expect(runActions('approved')).toEqual({ canCompute: false, canApprove: false, canDisburse: true, canCancel: true })
  })
  it('disbursed: nothing', () => {
    expect(runActions('disbursed')).toEqual({ canCompute: false, canApprove: false, canDisburse: false, canCancel: false })
  })
})

describe('isItemEligible', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  it('statement_only always eligible', () => {
    expect(isItemEligible('statement_only', '2027-01-01T00:00:00Z', now)).toBe(true)
  })
  it('credited: eligible when hold cleared', () => {
    expect(isItemEligible('credited', '2026-06-10T00:00:00Z', now)).toBe(true)
    expect(isItemEligible('credited', null, now)).toBe(true)
  })
  it('credited: held when eligible_at in future', () => {
    expect(isItemEligible('credited', '2026-06-20T00:00:00Z', now)).toBe(false)
  })
})

describe('summariseRun', () => {
  it('buckets amounts by status and excludes failed/clawed from payable', () => {
    const items: ItemLike[] = [
      { amount_usd: 10, status: 'paid', settlement: 'credited' },
      { amount_usd: 5, status: 'held', settlement: 'credited' },
      { amount_usd: 3, status: 'pending', settlement: 'credited' },
      { amount_usd: 7, status: 'clawed_back', settlement: 'credited' },
      { amount_usd: 2, status: 'failed', settlement: 'credited' },
    ]
    const s = summariseRun(items)
    expect(s.itemCount).toBe(5)
    expect(s.paidUsd).toBe(10)
    expect(s.heldUsd).toBe(5)
    expect(s.pendingUsd).toBe(3)
    expect(s.clawedBackUsd).toBe(7)
    expect(s.payableUsd).toBe(18) // 10+5+3, excludes clawed(7)+failed(2)
  })
  it('handles string amounts', () => {
    expect(summariseRun([{ amount_usd: '2.5', status: 'paid', settlement: 'credited' }]).paidUsd).toBe(2.5)
  })
})

describe('defaultPeriod', () => {
  it('returns previous calendar month', () => {
    const { start, end } = defaultPeriod(new Date('2026-07-02T00:00:00Z'))
    expect(start).toBe('2026-06-01')
    expect(end).toBe('2026-06-30')
  })
  it('handles January -> previous December', () => {
    const { start, end } = defaultPeriod(new Date('2026-01-10T00:00:00Z'))
    expect(start).toBe('2025-12-01')
    expect(end).toBe('2025-12-31')
  })
})
