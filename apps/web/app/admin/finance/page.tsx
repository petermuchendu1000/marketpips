// app/admin/finance/page.tsx — Financial overview + console links.
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import { roleHasCapability } from '@/lib/admin/rbac'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Finance' }

async function count(supabase: any, table: string, build: (q: any) => any): Promise<number> {
  const { count } = await build(supabase.from(table).select('id', { count: 'exact', head: true }))
  return count ?? 0
}

export default async function FinancePage() {
  const ctx = await requirePageCapability(['finance:ledger', 'finance:deposits', 'finance:withdrawals'])
  const sb = ctx.supabase

  const [pendingWd, reviewWd, failedWd, pendingDep] = await Promise.all([
    count(sb, 'withdrawals', (q) => q.in('status', ['pending', 'processing'])),
    count(sb, 'withdrawals', (q) => q.eq('requires_review', true).in('status', ['pending', 'processing'])),
    count(sb, 'withdrawals', (q) => q.eq('status', 'failed')),
    count(sb, 'deposits', (q) => q.in('status', ['pending', 'processing'])),
  ])

  const cards = [
    { label: 'Withdrawals in flight', value: pendingWd, href: '/admin/finance/withdrawals?status=processing', cap: 'finance:withdrawals' },
    { label: 'Awaiting review', value: reviewWd, href: '/admin/finance/withdrawals', cap: 'finance:withdrawals', alert: reviewWd > 0 },
    { label: 'Failed withdrawals', value: failedWd, href: '/admin/finance/withdrawals?status=failed', cap: 'finance:withdrawals', alert: failedWd > 0 },
    { label: 'Deposits in flight', value: pendingDep, href: '/admin/finance/deposits?status=processing', cap: 'finance:deposits' },
  ].filter((c) => roleHasCapability(ctx.role, c.cap as never))

  const consoles = [
    { label: 'Deposits', desc: 'Inspect & reconcile deposits', href: '/admin/finance/deposits', cap: 'finance:deposits' },
    { label: 'Withdrawals', desc: 'Approve / reject / retry payouts', href: '/admin/finance/withdrawals', cap: 'finance:withdrawals' },
    { label: 'Ledger', desc: 'Unified transactions + reconciliation + export', href: '/admin/finance/ledger', cap: 'finance:ledger' },
  ].filter((c) => roleHasCapability(ctx.role, c.cap as never))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-black">Finance</h1>

      <div className="card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className={'rounded-xl border p-4 hover:bg-muted/40 ' + (c.alert ? 'border-red-500/40' : '')}>
            <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
            <div className={'mt-1 text-3xl font-black ' + (c.alert ? 'text-red-600 dark:text-red-400' : '')}>
              {c.value.toLocaleString()}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {consoles.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-xl border p-4 hover:bg-muted/40">
            <div className="font-bold">{c.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
