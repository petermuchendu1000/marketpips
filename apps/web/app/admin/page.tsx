// app/admin/page.tsx - Admin dashboard
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Admin Dashboard' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'moderator'].includes(profile?.role || '')) redirect('/')

  const [
    pendingMarketsRes,
    totalUsersRes,
    activeMarketsRes,
    pendingDepositsRes,
    recentTransactionsRes,
  ] = await Promise.all([
    supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('transactions').select('*').eq('status', 'completed').eq('type', 'bet_placed').order('created_at', { ascending: false }).limit(10),
  ])

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <h1 className="text-2xl font-black mb-6">🛠️ Admin Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Users', value: totalUsersRes.count || 0, emoji: '👥' },
          { label: 'Active Markets', value: activeMarketsRes.count || 0, emoji: '🏪' },
          { label: 'Pending Markets', value: pendingMarketsRes.count || 0, emoji: '⏳', alert: (pendingMarketsRes.count || 0) > 0 },
          { label: 'Pending Deposits', value: pendingDepositsRes.count || 0, emoji: '💰', alert: (pendingDepositsRes.count || 0) > 0 },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-2xl border bg-card p-4 ${stat.alert ? 'border-amber-500/50 bg-amber-50/5' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">{stat.emoji}</span>
              {stat.alert && <span className="text-xs text-amber-500 font-medium">Needs attention</span>}
            </div>
            <p className="text-3xl font-black">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Admin actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a href="/admin/markets" className="flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted transition-colors">
          <span className="text-2xl">🏪</span>
          <div>
            <p className="font-semibold">Markets</p>
            <p className="text-xs text-muted-foreground">Review, approve, resolve</p>
          </div>
        </a>
        <a href="/admin/users" className="flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted transition-colors">
          <span className="text-2xl">👥</span>
          <div>
            <p className="font-semibold">Users</p>
            <p className="text-xs text-muted-foreground">KYC, roles, accounts</p>
          </div>
        </a>
        <a href="/admin/transactions" className="flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted transition-colors">
          <span className="text-2xl">💸</span>
          <div>
            <p className="font-semibold">Transactions</p>
            <p className="text-xs text-muted-foreground">Deposits, withdrawals</p>
          </div>
        </a>
      </div>

      {/* Recent bets */}
      <section>
        <h2 className="font-semibold mb-3">Recent Bets</h2>
        <div className="rounded-2xl border bg-card divide-y">
          {recentTransactionsRes.data?.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted-foreground">{tx.user_id.slice(0, 8)}...</span>
              <span>{tx.description}</span>
              <span className="font-medium">${tx.amount_usd.toFixed(2)}</span>
              <span className="text-muted-foreground text-xs">
                {tx.created_at ? new Date(tx.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
