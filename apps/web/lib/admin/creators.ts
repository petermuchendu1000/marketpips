// lib/admin/creators.ts — Creator console model (pure + server helpers).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const CREATOR_STATUSES = ['active', 'suspended', 'revoked'] as const
export type CreatorStatus = (typeof CREATOR_STATUSES)[number]

export interface TierLike {
  key: string
  reward_pct: number | string
  max_open_markets: number | string
  auto_publish: boolean
}
export interface CreatorProfileLike {
  tier: string
  reward_pct: number | string | null
  max_open_markets: number | string | null
  auto_publish: boolean
}

/** Effective reward pct = profile override, else the tier default. */
export function effectiveRewardPct(profile: CreatorProfileLike, tier?: TierLike | null): number {
  if (profile.reward_pct != null && profile.reward_pct !== '') return Number(profile.reward_pct)
  return tier ? Number(tier.reward_pct) : 0
}

/** Effective concurrent open-market cap = profile override, else tier default. */
export function effectiveMaxOpenMarkets(profile: CreatorProfileLike, tier?: TierLike | null): number {
  if (profile.max_open_markets != null && profile.max_open_markets !== '') return Number(profile.max_open_markets)
  return tier ? Number(tier.max_open_markets) : 0
}

/** Format a reward fraction (0.0025) as a percent string ("0.25%"). */
export function formatRewardPct(fraction: number): string {
  return `${(fraction * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

// ---- Directory params -------------------------------------------------------
export const CREATOR_SORTS = ['created_at', 'tier', 'status'] as const
export type CreatorSort = (typeof CREATOR_SORTS)[number]

export interface CreatorListParams {
  q: string | null
  status: CreatorStatus | null
  tier: string | null
  sort: CreatorSort
  dir: 'asc' | 'desc'
  page: number
  pageSize: number
}

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

export function parseCreatorListParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): CreatorListParams {
  const get = (k: string): string | null => {
    if (sp instanceof URLSearchParams) return sp.get(k)
    const v = sp[k]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  }
  const rawSort = get('sort')
  const sort: CreatorSort = (CREATOR_SORTS as readonly string[]).includes(rawSort ?? '')
    ? (rawSort as CreatorSort)
    : 'created_at'
  const dir = get('dir') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1)
  const rawSize = parseInt(get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize))
  const status = (['active', 'suspended', 'revoked'] as string[]).includes(get('status') ?? '')
    ? (get('status') as CreatorStatus)
    : null
  const tier = (get('tier') ?? '').trim().toLowerCase() || null
  return { q: (get('q') ?? '').trim() || null, status, tier, sort, dir, page, pageSize }
}

export const CREATOR_SELECT =
  'user_id, tier, reward_pct, auto_publish, max_open_markets, status, suspended_reason, approved_by, created_at, profiles!creator_profiles_user_id_fkey(username, display_name, country_code)'

export interface CreatorStats {
  marketsAuthored: number
  openMarkets: number
  lifetimeRewardUsd: number
}

/** Aggregate a creator's authored-market + reward stats. */
export async function fetchCreatorStats(
  supabase: SupabaseClient<Database>,
  creatorId: string
): Promise<CreatorStats> {
  const [{ data: markets }, { data: rewards }] = await Promise.all([
    supabase.from('markets').select('status').eq('creator_id', creatorId),
    supabase
      .from('transactions')
      .select('amount_usd')
      .eq('user_id', creatorId)
      .eq('type', 'creator_reward')
      .eq('status', 'completed'),
  ])
  const marketsAuthored = (markets ?? []).length
  const openMarkets = (markets ?? []).filter((m) => m.status === 'active' || m.status === 'closed').length
  const lifetimeRewardUsd = (rewards ?? []).reduce((s, r) => s + (Number(r.amount_usd) || 0), 0)
  return { marketsAuthored, openMarkets, lifetimeRewardUsd }
}
