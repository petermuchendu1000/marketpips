// app/admin/finance/withdrawals/page.tsx — Withdrawals console (approve/reject/retry/complete).
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import { parsePaymentListParams, fetchWithdrawals, type PaymentListParams } from '@/lib/admin/finance'
import { TxnStatusBadge, ProviderBadge } from '@/components/admin/finance/FinanceBadges'
import { WithdrawalActions } from '@/components/admin/finance/WithdrawalActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Withdrawals' }

const STATUS_OPTIONS = ['', 'pending', 'processing', 'completed', 'failed', 'refunded']
const PROVIDER_OPTIONS = ['', 'mpesa', 'mtn_momo', 'airtel_money', 'pesapal', 'bank_transfer', 'internal']

function qs(p: PaymentListParams, o: Partial<PaymentListParams>): string {
  const m = { ...p, ...o }
  const sp = new URLSearchParams()
  if (m.status) sp.set('status', m.status)
  if (m.provider) sp.set('provider', m.provider)
  if (m.q) sp.set('q', m.q)
  sp.set('page', String(m.page))
  return sp.toString()
}

export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePageCapability('finance:withdrawals')
  const params = parsePaymentListParams(await searchParams)
  const { rows, total } = await fetchWithdrawals(ctx.supabase, params)
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize))

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/finance" className="text-sm text-muted-foreground hover:underline">← Finance</Link>
        <h1 className="text-2xl font-black">Withdrawals</h1>
      </div>

      <form method="get" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="Phone…" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <select name="status" defaultValue={params.status ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === '' ? 'Any status' : s}</option>)}
        </select>
        <select name="provider" defaultValue={params.provider ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {PROVIDER_OPTIONS.map((s) => <option key={s} value={s}>{s === '' ? 'Any provider' : s}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Filter</button>
      </form>

      <div className="table-wrapper overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No withdrawals match.</td></tr>}
            {rows.map((w: any) => (
              <tr key={w.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 text-xs text-muted-foreground">{w.created_at ? new Date(w.created_at).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${w.user_id}`} className="text-primary hover:underline">{w.user?.username ?? '—'}</Link>
                  <div className="text-xs text-muted-foreground">{w.phone_number}{w.requires_review ? ' · ⚠ review' : ''}</div>
                </td>
                <td className="px-3 py-2"><ProviderBadge provider={w.provider} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(w.amount ?? 0).toLocaleString()} {w.currency}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(w.net_amount ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2"><TxnStatusBadge status={w.status} /></td>
                <td className="px-3 py-2"><WithdrawalActions id={w.id} status={w.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{total.toLocaleString()} total</span>
        <div className="flex gap-2">
          {params.page > 1 && <Link href={`/admin/finance/withdrawals?${qs(params, { page: params.page - 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">← Prev</Link>}
          <span className="px-2 py-1.5 text-muted-foreground">Page {params.page} / {totalPages}</span>
          {params.page < totalPages && <Link href={`/admin/finance/withdrawals?${qs(params, { page: params.page + 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">Next →</Link>}
        </div>
      </div>
    </div>
  )
}
