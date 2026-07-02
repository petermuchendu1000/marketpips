// GET /api/admin/payouts/[id]/export — CSV statement of a payout run's items.
import { NextRequest, NextResponse } from 'next/server'
import { requireCapability } from '@/lib/auth'
import { toCsv } from '@/lib/admin/csv'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('payouts:run')
  if (!guard.ok) return guard.response

  const { data } = await guard.ctx.supabase
    .from('payout_items')
    .select(
      'user_id, amount_usd, settlement, status, eligible_at, tx_count, created_at, profiles!payout_items_user_id_fkey(username, display_name)'
    )
    .eq('run_id', id)
    .order('amount_usd', { ascending: false })

  type Row = {
    user_id: string
    username: string
    display_name: string
    amount_usd: number
    settlement: string
    status: string
    eligible_at: string | null
    tx_count: number
    created_at: string
  }
  const rows: Row[] = (data ?? []).map((r) => {
    const p = (r as { profiles?: { username?: string; display_name?: string } }).profiles
    return {
      user_id: r.user_id,
      username: p?.username ?? '',
      display_name: p?.display_name ?? '',
      amount_usd: r.amount_usd,
      settlement: r.settlement,
      status: r.status,
      eligible_at: r.eligible_at,
      tx_count: r.tx_count,
      created_at: r.created_at,
    }
  })

  const csv = toCsv<Row>(rows, [
    { key: 'user_id', header: 'User ID' },
    { key: 'username', header: 'Username' },
    { key: 'display_name', header: 'Display Name' },
    { key: 'amount_usd', header: 'Amount USD' },
    { key: 'settlement', header: 'Settlement' },
    { key: 'status', header: 'Status' },
    { key: 'eligible_at', header: 'Eligible At' },
    { key: 'tx_count', header: 'Source Txns' },
    { key: 'created_at', header: 'Created' },
  ])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payout-run-${id.slice(0, 8)}.csv"`,
    },
  })
}
