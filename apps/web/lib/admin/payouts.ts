// lib/admin/payouts.ts — Payout-run engine model (pure + server helpers).
//
// The run state machine here MIRRORS the RPC guards in migration 013 so the UI
// can enable/disable actions without a round-trip and stay honest with the DB.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const RUN_STATUSES = ['draft', 'computed', 'approved', 'disbursed', 'cancelled', 'failed'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const ITEM_STATUSES = ['pending', 'paid', 'held', 'failed', 'clawed_back'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export type RunKind = 'creator' | 'marketer'
export type Settlement = 'credited' | 'statement_only'

/** Allowed run transitions (source -> targets), matching the RPCs. */
const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ['computed', 'cancelled'],
  computed: ['computed', 'approved', 'cancelled'], // recompute stays in computed
  approved: ['disbursed', 'cancelled'],
  disbursed: [], // terminal (item-level clawback only)
  cancelled: [],
  failed: [],
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

/** Which operator actions are available for a run in this status. */
export interface RunActions {
  canCompute: boolean
  canApprove: boolean
  canDisburse: boolean
  canCancel: boolean
}
export function runActions(status: RunStatus): RunActions {
  return {
    canCompute: status === 'draft' || status === 'computed',
    canApprove: status === 'computed',
    canDisburse: status === 'approved',
    canCancel: status !== 'disbursed' && status !== 'cancelled' && status !== 'failed',
  }
}

/**
 * Is a credited item eligible to pay now (hold gate cleared)?
 * statement_only items are always eligible (no money moves).
 */
export function isItemEligible(
  settlement: Settlement,
  eligibleAt: string | null,
  now: Date = new Date()
): boolean {
  if (settlement === 'statement_only') return true
  if (!eligibleAt) return true
  return new Date(eligibleAt).getTime() <= now.getTime()
}

export interface ItemLike {
  amount_usd: number | string
  status: ItemStatus
  settlement: Settlement
}

export interface RunSummary {
  itemCount: number
  payableUsd: number // pending+held+paid, excludes failed/clawed_back
  paidUsd: number
  heldUsd: number
  pendingUsd: number
  clawedBackUsd: number
}

/** Aggregate item amounts by status for a run's summary cards. */
export function summariseRun(items: ItemLike[]): RunSummary {
  const s: RunSummary = {
    itemCount: items.length,
    payableUsd: 0,
    paidUsd: 0,
    heldUsd: 0,
    pendingUsd: 0,
    clawedBackUsd: 0,
  }
  for (const it of items) {
    const amt = Number(it.amount_usd) || 0
    if (it.status === 'paid') s.paidUsd += amt
    else if (it.status === 'held') s.heldUsd += amt
    else if (it.status === 'pending') s.pendingUsd += amt
    else if (it.status === 'clawed_back') s.clawedBackUsd += amt
    if (it.status !== 'failed' && it.status !== 'clawed_back') s.payableUsd += amt
  }
  return s
}

/** Default period = the previous calendar month, as ISO date strings. */
export function defaultPeriod(now: Date = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0)) // day 0 of this month = last day of prev
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

export const RUN_SELECT =
  'id, kind, period_start, period_end, status, total_usd, notes, created_by, computed_at, approved_by, approved_at, disbursed_at, created_at'

export const ITEM_SELECT =
  'id, run_id, user_id, amount_usd, settlement, status, eligible_at, tx_count, transaction_id, detail, created_at, profiles!payout_items_user_id_fkey(username, display_name)'

export async function fetchRun(supabase: SupabaseClient<Database>, id: string) {
  return supabase.from('payout_runs').select(RUN_SELECT).eq('id', id).single()
}
