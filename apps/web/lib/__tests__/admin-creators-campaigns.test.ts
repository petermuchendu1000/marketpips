import { describe, it, expect } from 'vitest'
import {
  effectiveRewardPct,
  effectiveMaxOpenMarkets,
  formatRewardPct,
  parseCreatorListParams,
} from '@/lib/admin/creators'
import {
  campaignEligibility,
  campaignValueUsd,
  budgetUtilisation,
  type CampaignLike,
} from '@/lib/admin/campaigns'

const tier = { key: 'silver', reward_pct: 0.0035, max_open_markets: 15, auto_publish: false }

describe('creator effective values', () => {
  it('uses profile override when present', () => {
    const p = { tier: 'silver', reward_pct: 0.005, max_open_markets: 30, auto_publish: true }
    expect(effectiveRewardPct(p, tier)).toBe(0.005)
    expect(effectiveMaxOpenMarkets(p, tier)).toBe(30)
  })
  it('falls back to tier default when no override', () => {
    const p = { tier: 'silver', reward_pct: null, max_open_markets: null, auto_publish: false }
    expect(effectiveRewardPct(p, tier)).toBe(0.0035)
    expect(effectiveMaxOpenMarkets(p, tier)).toBe(15)
  })
  it('handles missing tier gracefully', () => {
    const p = { tier: 'x', reward_pct: null, max_open_markets: null, auto_publish: false }
    expect(effectiveRewardPct(p, null)).toBe(0)
    expect(effectiveMaxOpenMarkets(p, null)).toBe(0)
  })
})

describe('formatRewardPct', () => {
  it('renders fraction as trimmed percent', () => {
    expect(formatRewardPct(0.0025)).toBe('0.25%')
    expect(formatRewardPct(0.005)).toBe('0.5%')
    expect(formatRewardPct(0.01)).toBe('1%')
  })
})

describe('parseCreatorListParams', () => {
  it('validates status and lowercases tier', () => {
    const p = parseCreatorListParams({ status: 'suspended', tier: 'GOLD' })
    expect(p.status).toBe('suspended')
    expect(p.tier).toBe('gold')
  })
  it('defaults and clamps', () => {
    const p = parseCreatorListParams({ pageSize: '9999', status: 'bad' })
    expect(p.pageSize).toBe(200)
    expect(p.status).toBeNull()
  })
})

const baseCampaign: CampaignLike = {
  code: 'WELCOME',
  kind: 'deposit_bonus',
  value_pct: 10,
  max_value_usd: 20,
  budget_usd: 1000,
  spent_usd: 0,
  max_redemptions: 100,
  redemption_count: 0,
  per_user_limit: 1,
  starts_at: null,
  ends_at: null,
  status: 'active',
}
const now = new Date('2026-06-15T00:00:00Z')

describe('campaignEligibility', () => {
  it('ok for a fresh active campaign', () => {
    expect(campaignEligibility(baseCampaign, now, 0)).toEqual({ eligible: true, reason: 'ok' })
  })
  it('blocks when paused', () => {
    expect(campaignEligibility({ ...baseCampaign, status: 'paused' }, now).reason).toBe('not_active')
  })
  it('blocks before start and after end', () => {
    expect(campaignEligibility({ ...baseCampaign, starts_at: '2026-07-01T00:00:00Z' }, now).reason).toBe('not_started')
    expect(campaignEligibility({ ...baseCampaign, ends_at: '2026-06-01T00:00:00Z' }, now).reason).toBe('expired')
  })
  it('blocks when budget exhausted', () => {
    expect(campaignEligibility({ ...baseCampaign, spent_usd: 1000 }, now).reason).toBe('budget_exhausted')
  })
  it('blocks when total redemptions reached', () => {
    expect(campaignEligibility({ ...baseCampaign, redemption_count: 100 }, now).reason).toBe('redemptions_exhausted')
  })
  it('blocks when user limit reached', () => {
    expect(campaignEligibility(baseCampaign, now, 1).reason).toBe('user_limit_reached')
  })
})

describe('campaignValueUsd', () => {
  it('applies percent and per-redemption cap', () => {
    expect(campaignValueUsd(baseCampaign, 100, now)).toBe(10) // 10% of 100
    expect(campaignValueUsd(baseCampaign, 1000, now)).toBe(20) // capped at max_value_usd
  })
  it('caps by remaining budget', () => {
    expect(campaignValueUsd({ ...baseCampaign, spent_usd: 995, max_value_usd: null }, 200, now)).toBe(5)
  })
  it('returns 0 when not eligible', () => {
    expect(campaignValueUsd({ ...baseCampaign, status: 'ended' }, 100, now)).toBe(0)
  })
})

describe('budgetUtilisation', () => {
  it('fraction of budget spent', () => {
    expect(budgetUtilisation({ ...baseCampaign, spent_usd: 250 })).toBe(0.25)
  })
  it('0 when uncapped', () => {
    expect(budgetUtilisation({ ...baseCampaign, budget_usd: null })).toBe(0)
  })
  it('never exceeds 1', () => {
    expect(budgetUtilisation({ ...baseCampaign, spent_usd: 5000 })).toBe(1)
  })
})
