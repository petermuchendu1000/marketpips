// GET /api/admin/finance/ledger/export — CSV export of the current ledger filter.
import { NextRequest, NextResponse } from 'next/server'
import { requireCapability } from '@/lib/auth'
import { parseLedgerParams, fetchLedger, MAX_PAGE_SIZE } from '@/lib/admin/finance'
import { toCsv } from '@/lib/admin/csv'

export async function GET(req: NextRequest) {
  const guard = await requireCapability('finance:ledger')
  if (!guard.ok) return guard.response

  const params = parseLedgerParams(req.nextUrl.searchParams)
  const { rows } = await fetchLedger(guard.ctx.supabase, { ...params, page: 1, pageSize: MAX_PAGE_SIZE })

  const csv = toCsv<Record<string, unknown>>(rows as Record<string, unknown>[], [
    { key: 'id', header: 'ID' },
    { key: 'created_at', header: 'Date' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'amount', header: 'Amount' },
    { key: 'currency', header: 'Currency' },
    { key: 'amount_usd', header: 'Amount USD' },
    { key: 'fee_amount', header: 'Fee' },
    { key: 'balance_before', header: 'Balance Before' },
    { key: 'balance_after', header: 'Balance After' },
    { key: 'payment_provider', header: 'Provider' },
    { key: 'payment_reference', header: 'Payment Ref' },
    { key: 'provider_reference', header: 'Provider Ref' },
    { key: 'description', header: 'Description' },
  ])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
