// lib/admin/marketers.ts — Marketer console model (pure + server helpers).
//
// Commission math here MIRRORS the SQL `marketer_commission_usd()` in
// migration 013 exactly, so the UI's live preview and the DB's payout compute
// never disagree. Pure functions are unit-tested (lib/__tests__/admin-marketers).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export type CommissionModel = 'cpa' | 'revshare' | 'hybrid'

export interface CommissionPlan {
  model: CommissionModel
  cpa_usd: number
  revshare_pct: number
  hold_days?: number
}

export const MARKETER_STATUSES = ['active', 'suspended', 'revoked'] as const
export type MarketerStatus = (typeof MARKETER_STATUSES)[number]

/** Round to 6 dp with half-away-from-zero, matching Postgres ROUND(numeric). */
export function round6(n: number): number {
  const f = 1_000_000
  return Math.sign(n) * Math.round(Math.abs(n) * f) / f
}

/** Coerce an arbitrary JSON blob into a safe, fully-populated CommissionPlan. */
export function normalizePlan(raw: unknown): CommissionPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const model = o.model === 'cpa' || o.model === 'revshare' || o.model === 'hybrid' ? o.model : 'hybrid'
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
    return Number.isFinite(n) ? n : 0
  }
  return {
    model: model as CommissionModel,
    cpa_usd: Math.max(0, num(o.cpa_usd)),
    revshare_pct: Math.max(0, num(o.revshare_pct)),
    hold_days: Math.max(0, Math.trunc(num(o.hold_days))),
  }
}

/**
 * Commission in USD for a period. Mirrors SQL:
 *   cpa_usd*activations (if model in cpa,hybrid)
 * + revenue_base*revshare_pct/100 (if model in revshare,hybrid)
 * rounded to 6 dp. Negative inputs are clamped to 0.
 */
export function commissionUsd(planRaw: unknown, activations: number, revenueBase: number): number {
  const plan = normalizePlan(planRaw)
  const act = Math.max(0, Math.trunc(activations || 0))
  const rev = Math.max(0, revenueBase || 0)
  const cpa = plan.model === 'cpa' || plan.model === 'hybrid' ? plan.cpa_usd * act : 0
  const share = plan.model === 'revshare' || plan.model === 'hybrid' ? (rev * plan.revshare_pct) / 100 : 0
  return round6(cpa + share)
}

/** Human summary of a plan for badges/tooltips. */
export function describePlan(planRaw: unknown): string {
  const p = normalizePlan(planRaw)
  const parts: string[] = []
  if (p.model === 'cpa' || p.model === 'hybrid') parts.push(`$${p.cpa_usd}/activation`)
  if (p.model === 'revshare' || p.model === 'hybrid') parts.push(`${p.revshare_pct}% rev-share`)
  const base = parts.length ? parts.join(' + ') : 'no commission'
  return p.hold_days ? `${base} · ${p.hold_days}d hold` : base
}

// ---- Directory params -------------------------------------------------------
export const MARKETER_SORTS = ['created_at', 'tracking_code', 'status'] as const
export type MarketerSort = (typeof MARKETER_SORTS)[number]

export interface MarketerListParams {
  q: string | null
  status: MarketerStatus | null
  sort: MarketerSort
  dir: 'asc' | 'desc'
  page: number
  pageSize: number
}

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

export function parseMarketerListParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): MarketerListParams {
  const get = (k: string): string | null => {
    if (sp instanceof URLSearchParams) return sp.get(k)
    const v = sp[k]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  }
  const rawSort = get('sort')
  const sort: MarketerSort = (MARKETER_SORTS as readonly string[]).includes(rawSort ?? '')
    ? (rawSort as MarketerSort)
    : 'created_at'
  const dir = get('dir') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1)
  const rawSize = parseInt(get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize))
  const status = (['active', 'suspended', 'revoked'] as string[]).includes(get('status') ?? '')
    ? (get('status') as MarketerStatus)
    : null
  return { q: (get('q') ?? '').trim() || null, status, sort, dir, page, pageSize }
}

export const MARKETER_SELECT =
  'user_id, tracking_code, plan_key, commission_plan, hold_days, status, suspended_reason, approved_by, created_at, profiles!marketer_profiles_user_id_fkey(username, display_name, country_code, referral_count)'

export interface MarketerAttribution {
  referredUsers: number
  activations: number
  revenueBaseUsd: number
}

/** Aggregate a marketer's lifetime/period attribution from referred users. */
export async function fetchMarketerAttribution(
  supabase: SupabaseClient<Database>,
  marketerId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<MarketerAttribution> {
  const { data: referred } = await supabase
    .from('profiles')
    .select('id')
    .eq('referred_by', marketerId)
  const ids = (referred ?? []).map((r) => r.id)
  if (ids.length === 0) return { referredUsers: 0, activations: 0, revenueBaseUsd: 0 }

  let depQ = supabase
    .from('transactions')
    .select('user_id, created_at')
    .in('user_id', ids)
    .eq('type', 'deposit')
    .eq('status', 'completed')
  let betQ = supabase
    .from('transactions')
    .select('fee_amount, exchange_rate_to_usd')
    .in('user_id', ids)
    .eq('type', 'bet_placed')
    .eq('status', 'completed')
  if (periodStart) {
    depQ = depQ.gte('created_at', periodStart)
    betQ = betQ.gte('created_at', periodStart)
  }
  if (periodEnd) {
    depQ = depQ.lte('created_at', periodEnd)
    betQ = betQ.lte('created_at', periodEnd)
  }
  const [{ data: deps }, { data: bets }] = await Promise.all([depQ, betQ])
  const activations = new Set((deps ?? []).map((d) => d.user_id)).size
  const revenueBaseUsd = (bets ?? []).reduce(
    (s, b) => s + (Number(b.fee_amount) || 0) * (Number(b.exchange_rate_to_usd) || 0),
    0
  )
  return { referredUsers: ids.length, activations, revenueBaseUsd: round6(revenueBaseUsd) }
}
