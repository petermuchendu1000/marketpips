// app/admin/finance/ledger/page.tsx — Unified transactions ledger + reconciliation + export.
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import {
  parseLedgerParams,
  fetchLedger,
  summariseLedger,
  type LedgerParams,
} from '@/lib/admin/finance'
import { TxnStatusBadge, ProviderBadge } from '@/components/admin/finance/FinanceBadges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Ledger' }

const TYPE_OPTIONS = ['', 'deposit', 'withdrawal', 'bet_placed', 'bet_won', 'bet_lost', 'bet_refunded', 'fee', 'bonus', 'referral_bonus', 'creator_reward']
const STATUS_OPTIONS = ['', 'pending', 'processing', 'completed', 'failed', 'refunded']

function qs(p: LedgerParams, o: Partial<LedgerParams>): string {
  const m = { ...p, ...o }
  const sp = new URLSearchParams()
  if (m.type) sp.set('type', m.type)
  if (m.status) sp.set('status', m.status)
  if (m.from) sp.set('from', m.from)
  if (m.to) sp.set('to', m.to)
  if (m.q) sp.set('q', m.q)
  sp.set('page', String(m.page))
  return sp.toString()
}

function usd(v: number): string {
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePageCapability('finance:ledger')
  const params = parseLedgerParams(await searchParams)
  const { rows, total } = await fetchLedger(ctx.supabase, params)
  const summary = summariseLedger(rows as never)
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize))

  const kpis = [
    { label: 'Deposits (completed)', value: usd(summary.deposits_usd) },
    { label: 'Withdrawals (completed)', value: usd(summary.withdrawals_usd) },
    { label: 'Net flow', value: usd(summary.net_flow_usd) },
    { label: 'Fees', value: usd(summary.fees_usd) },
    { label: 'Creator rewards', value: usd(summary.creator_rewards_usd) },
    { label: 'Referral bonus', value: usd(summary.referral_bonus_usd) },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/finance" className="text-sm text-muted-foreground hover:underline">← Finance</Link>
          <h1 className="text-2xl font-black">Ledger</h1>
        </div>
        <a href={`/api/admin/finance/ledger/export?${qs(params, { page: 1 })}`} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">⬇ Export CSV</a>
      </div>

      {/* Reconciliation summary over the current page window */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border p-3">
            <div className="text-xs uppercase text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-lg font-black tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Summary covers the {summary.count} rows currently loaded. Narrow the date range for period reconciliation, then export.</p>

      <form method="get" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input type="search" name="q" defaultValue={params.q ?? ''} placeholder="Reference…" className="rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2" />
        <select name="type" defaultValue={params.type ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s === '' ? 'Any type' : s}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === '' ? 'Any status' : s}</option>)}
        </select>
        <input type="date" name="from" defaultValue={params.from ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={params.to ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:col-span-2 lg:col-span-1">Filter</button>
      </form>

      <div className="table-wrapper overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">USD</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No transactions match.</td></tr>}
            {rows.map((t: any) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td className="px-3 py-2 font-medium">{t.type}</td>
                <td className="px-3 py-2"><TxnStatusBadge status={t.status} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(t.amount ?? 0).toLocaleString()} {t.currency}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(Number(t.amount_usd ?? 0))}</td>
                <td className="px-3 py-2"><ProviderBadge provider={t.payment_provider} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.payment_reference ?? t.provider_reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{total.toLocaleString()} total</span>
        <div className="flex gap-2">
          {params.page > 1 && <Link href={`/admin/finance/ledger?${qs(params, { page: params.page - 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">← Prev</Link>}
          <span className="px-2 py-1.5 text-muted-foreground">Page {params.page} / {totalPages}</span>
          {params.page < totalPages && <Link href={`/admin/finance/ledger?${qs(params, { page: params.page + 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">Next →</Link>}
        </div>
      </div>
    </div>
  )
}
