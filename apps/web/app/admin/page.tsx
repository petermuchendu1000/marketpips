// app/admin/page.tsx — Admin overview / operational cockpit.
//
// Access is enforced by app/admin/layout.tsx (portal gate) + middleware + RLS.
// KPIs and queues are filtered by the operator's capabilities so each role sees
// only what it may act on. superadmin sees everything (god-mode).
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { roleHasCapability, isSuperadmin } from '@/lib/admin/rbac'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Overview' }

type CountableTable = 'profiles' | 'markets' | 'withdrawals' | 'deposits'

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: CountableTable,
  build?: (q: any) => any
): Promise<number> {
  let q: any = supabase.from(table).select('id', { count: 'exact', head: true })
  if (build) q = build(q)
  const { count } = await q
  return count ?? 0
}

export default async function AdminOverviewPage() {
  const ctx = await getAuthContext()
  // Layout already guards; this is belt-and-suspenders + gives us the role.
  if (!ctx) return null
  const role = ctx.role
  const supabase = ctx.supabase

  const can = (c: Parameters<typeof roleHasCapability>[1]) => roleHasCapability(role, c)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Build the KPI set the operator is allowed to see.
  const kpis: { label: string; value: number; emoji: string; alert?: boolean; href?: string }[] = []

  const [
    totalUsers,
    activeMarkets,
    pendingMarkets,
    pendingKyc,
    pendingWithdrawals,
    depositsToday,
  ] = await Promise.all([
    can('users:read') ? count(supabase, 'profiles') : Promise.resolve(0),
    count(supabase, 'markets', (q) => q.eq('status', 'active')),
    can('markets:approve') ? count(supabase, 'markets', (q) => q.eq('status', 'pending')) : Promise.resolve(0),
    can('kyc:review') ? count(supabase, 'profiles', (q) => q.eq('kyc_status', 'pending')) : Promise.resolve(0),
    can('finance:withdrawals')
      ? count(supabase, 'withdrawals', (q) => q.eq('status', 'pending'))
      : Promise.resolve(0),
    can('finance:deposits')
      ? count(supabase, 'deposits', (q) => q.gte('created_at', startOfToday.toISOString()))
      : Promise.resolve(0),
  ])

  if (can('users:read')) kpis.push({ label: 'Total Users', value: totalUsers, emoji: '👥', href: '/admin/users' })
  kpis.push({ label: 'Active Markets', value: activeMarkets, emoji: '🏪', href: '/admin/markets' })
  if (can('markets:approve'))
    kpis.push({ label: 'Pending Markets', value: pendingMarkets, emoji: '⏳', alert: pendingMarkets > 0, href: '/admin/markets' })
  if (can('kyc:review'))
    kpis.push({ label: 'Pending KYC', value: pendingKyc, emoji: '🪪', alert: pendingKyc > 0, href: '/admin/kyc' })
  if (can('finance:withdrawals'))
    kpis.push({ label: 'Pending Withdrawals', value: pendingWithdrawals, emoji: '💸', alert: pendingWithdrawals > 0, href: '/admin/finance/withdrawals' })
  if (can('finance:deposits'))
    kpis.push({ label: 'Deposits Today', value: depositsToday, emoji: '💰', href: '/admin/finance/deposits' })

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-black">Overview</h1>
        {isSuperadmin(role) && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            👑 Full control
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((stat) => {
          const card = (
            <div
              className={
                'h-full rounded-2xl border bg-card p-4 transition-colors ' +
                (stat.alert ? 'border-amber-500/50' : 'hover:bg-muted')
              }
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-2xl">{stat.emoji}</span>
                {stat.alert && <span className="text-xs font-medium text-amber-500">Attention</span>}
              </div>
              <p className="text-3xl font-black">{stat.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          )
          return stat.href ? (
            <Link key={stat.label} href={stat.href}>
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          )
        })}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Use the navigation to manage users, creators, marketers, markets, finance, gateways,
        settings, compliance, and audit. Sections you can see are scoped to your role.
      </p>
    </div>
  )
}
