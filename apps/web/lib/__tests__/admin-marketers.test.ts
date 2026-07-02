import { describe, it, expect } from 'vitest'
import {
  normalizePlan,
  commissionUsd,
  describePlan,
  round6,
  parseMarketerListParams,
} from '@/lib/admin/marketers'

describe('normalizePlan', () => {
  it('fills defaults for empty/garbage input', () => {
    expect(normalizePlan(null)).toEqual({ model: 'hybrid', cpa_usd: 0, revshare_pct: 0, hold_days: 0 })
    expect(normalizePlan('nope')).toEqual({ model: 'hybrid', cpa_usd: 0, revshare_pct: 0, hold_days: 0 })
  })
  it('coerces string numbers and clamps negatives', () => {
    const p = normalizePlan({ model: 'cpa', cpa_usd: '2.5', revshare_pct: '-3', hold_days: '7.9' })
    expect(p).toEqual({ model: 'cpa', cpa_usd: 2.5, revshare_pct: 0, hold_days: 7 })
  })
  it('rejects unknown model -> hybrid', () => {
    expect(normalizePlan({ model: 'weird' }).model).toBe('hybrid')
  })
})

describe('commissionUsd (mirrors SQL marketer_commission_usd)', () => {
  it('cpa model: only counts activations', () => {
    const plan = { model: 'cpa', cpa_usd: 2, revshare_pct: 10 }
    expect(commissionUsd(plan, 5, 1000)).toBe(10) // 2*5, revshare ignored
  })
  it('revshare model: only counts revenue base', () => {
    const plan = { model: 'revshare', cpa_usd: 2, revshare_pct: 10 }
    expect(commissionUsd(plan, 5, 1000)).toBe(100) // 1000*10%, cpa ignored
  })
  it('hybrid model: both components', () => {
    const plan = { model: 'hybrid', cpa_usd: 1, revshare_pct: 5 }
    expect(commissionUsd(plan, 4, 200)).toBe(14) // 1*4 + 200*5%
  })
  it('clamps negative inputs to zero', () => {
    const plan = { model: 'hybrid', cpa_usd: 1, revshare_pct: 5 }
    expect(commissionUsd(plan, -3, -100)).toBe(0)
  })
  it('rounds to 6 dp', () => {
    const plan = { model: 'revshare', cpa_usd: 0, revshare_pct: 33.3333 }
    expect(commissionUsd(plan, 0, 1)).toBe(round6(0.333333))
  })
  it('zero when no rates', () => {
    expect(commissionUsd({ model: 'hybrid', cpa_usd: 0, revshare_pct: 0 }, 100, 100000)).toBe(0)
  })
})

describe('round6', () => {
  it('half away from zero at 6dp', () => {
    expect(round6(0.0000005)).toBe(0.000001)
    expect(round6(-0.0000005)).toBe(-0.000001)
    expect(round6(1.2345678)).toBe(1.234568)
  })
})

describe('describePlan', () => {
  it('summarises hybrid with hold', () => {
    expect(describePlan({ model: 'hybrid', cpa_usd: 1, revshare_pct: 5, hold_days: 7 })).toBe(
      '$1/activation + 5% rev-share · 7d hold'
    )
  })
  it('summarises cpa only', () => {
    expect(describePlan({ model: 'cpa', cpa_usd: 2, revshare_pct: 0 })).toBe('$2/activation')
  })
})

describe('parseMarketerListParams', () => {
  it('applies defaults and clamps page size', () => {
    const p = parseMarketerListParams({})
    expect(p.sort).toBe('created_at')
    expect(p.dir).toBe('desc')
    expect(p.page).toBe(1)
    expect(p.pageSize).toBe(25)
  })
  it('validates status and passes q', () => {
    expect(parseMarketerListParams({ status: 'suspended', q: ' abc ' })).toMatchObject({
      status: 'suspended',
      q: 'abc',
    })
    expect(parseMarketerListParams({ status: 'bogus' }).status).toBeNull()
  })
  it('clamps pageSize to max', () => {
    expect(parseMarketerListParams({ pageSize: '9999' }).pageSize).toBe(200)
  })
})
