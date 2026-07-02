// lib/admin/campaigns.ts — Promo campaign model (pure + eligibility engine).
export const CAMPAIGN_KINDS = ['deposit_bonus', 'fee_discount'] as const
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number]

export const CAMPAIGN_STATUSES = ['active', 'paused', 'ended'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export interface CampaignLike {
  code: string
  kind: CampaignKind
  value_pct: number | string
  max_value_usd: number | string | null
  budget_usd: number | string | null
  spent_usd: number | string
  max_redemptions: number | string | null
  redemption_count: number | string
  per_user_limit: number | string
  starts_at: string | null
  ends_at: string | null
  status: CampaignStatus
}

export type EligibilityReason =
  | 'ok'
  | 'not_active'
  | 'not_started'
  | 'expired'
  | 'budget_exhausted'
  | 'redemptions_exhausted'
  | 'user_limit_reached'

export interface EligibilityResult {
  eligible: boolean
  reason: EligibilityReason
}

/**
 * Can `userRedemptions`-so-far user redeem this campaign right now?
 * Pure: all inputs passed in, deterministic given `now`.
 */
export function campaignEligibility(
  c: CampaignLike,
  now: Date = new Date(),
  userRedemptions = 0
): EligibilityResult {
  const r = (reason: EligibilityReason): EligibilityResult => ({ eligible: reason === 'ok', reason })
  if (c.status !== 'active') return r('not_active')
  if (c.starts_at && new Date(c.starts_at).getTime() > now.getTime()) return r('not_started')
  if (c.ends_at && new Date(c.ends_at).getTime() < now.getTime()) return r('expired')
  const budget = c.budget_usd == null ? null : Number(c.budget_usd)
  if (budget != null && Number(c.spent_usd) >= budget) return r('budget_exhausted')
  const maxR = c.max_redemptions == null ? null : Number(c.max_redemptions)
  if (maxR != null && Number(c.redemption_count) >= maxR) return r('redemptions_exhausted')
  if (Number(c.per_user_limit) > 0 && userRedemptions >= Number(c.per_user_limit)) return r('user_limit_reached')
  return r('ok')
}

/**
 * Value (USD) the campaign yields on a given base amount:
 *   value_pct% of baseUsd, capped by max_value_usd, and by remaining budget.
 * Returns 0 for a non-actionable campaign.
 */
export function campaignValueUsd(c: CampaignLike, baseUsd: number, now: Date = new Date()): number {
  if (!campaignEligibility(c, now).eligible) return 0
  const base = Math.max(0, baseUsd || 0)
  let value = (base * Number(c.value_pct)) / 100
  const cap = c.max_value_usd == null ? null : Number(c.max_value_usd)
  if (cap != null) value = Math.min(value, cap)
  const budget = c.budget_usd == null ? null : Number(c.budget_usd)
  if (budget != null) value = Math.min(value, Math.max(0, budget - Number(c.spent_usd)))
  return Math.round(value * 1_000_000) / 1_000_000
}

/** Budget utilisation as a 0..1 fraction (0 when uncapped). */
export function budgetUtilisation(c: CampaignLike): number {
  const budget = c.budget_usd == null ? null : Number(c.budget_usd)
  if (!budget || budget <= 0) return 0
  return Math.min(1, Number(c.spent_usd) / budget)
}
