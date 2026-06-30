// app/portfolio/page.tsx - User portfolio
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { summarizePortfolio, type PositionPnl } from '@/lib/portfolio'
import type { Position, Transaction, Wallet } from '@/types'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

export const metadata = { title: 'My Portfolio' }

async function PortfolioData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [positionsRes, transactionsRes, walletsRes] = await Promise.all([
    supabase
      .from('positions')
      .select(`
        *,
        market:markets(id, title, slug, yes_price, no_price, status, resolved_outcome, closes_at)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id),
  ])

  const positions = (positionsRes.data || []) as Position[]
  const transactions = (transactionsRes.data || []) as Transaction[]
  const wallets = (walletsRes.data || []) as Wallet[]

  // Live mark-to-market P&L — do NOT use the stale positions.current_value_usd
  // snapshot. summarizePortfolio values open positions at current market prices.
  const { summary, positions: pnl } = summarizePortfolio(
    positions.map((p) => ({
      id: p.id,
      side: p.side,
      shares: p.shares,
      total_invested_usd: p.total_invested_usd,
      is_active: p.is_active,
      market: (p as any).market ?? null,
    })),
  )
  const pnlById = new Map(pnl.map((c) => [c.positionId, c]))

  const activePositions = positions.filter((p) => p.is_active)
  const totalInvested = summary.totalInvested
  const totalCurrentValue = summary.totalCurrentValue
  const totalPnl = summary.totalUnrealizedPnl

  return (
    <div className="space-y-6">
      {/* Wallet balances */}
      <section>
        <h2 className="text-lg font-semibold mb-3">💰 Balances</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {wallets.map((w) => (
            <div key={w.id} className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{w.currency}</p>
              <p className="text-2xl font-bold">
                {w.available_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              {w.reserved_balance > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  +{w.reserved_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} reserved
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* P&L summary */}
      {activePositions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">📊 Open Positions</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Invested</p>
              <p className="font-bold text-lg">${totalInvested.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Current Value</p>
              <p className="font-bold text-lg">${totalCurrentValue.toFixed(2)}</p>
            </div>
            <div className={`rounded-2xl border bg-card p-4 ${totalPnl >= 0 ? 'border-yes/30' : 'border-no/30'}`}>
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <p className={`font-bold text-lg ${totalPnl >= 0 ? 'text-yes' : 'text-no'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {activePositions.map((pos) => (
              <PositionRow key={pos.id} position={pos} pnl={pnlById.get(pos.id) ?? null} />
            ))}
          </div>
        </section>
      )}

      {/* Transaction history */}
      <section>
        <h2 className="text-lg font-semibold mb-3">📋 Recent Activity</h2>
        <div className="rounded-2xl border bg-card divide-y">
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No activity yet</p>
          ) : (
            transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
          )}
        </div>
      </section>
    </div>
  )
}

function PositionRow({ position, pnl: computed }: { position: Position; pnl: PositionPnl | null }) {
  const market = (position as any).market
  if (!market) return null

  const isYes = position.side === 'yes'
  // Live values from the shared P&L module (falls back if not supplied).
  const currentValue = computed?.currentValue ?? position.shares * (isYes ? market.yes_price : market.no_price)
  const pnl = computed?.totalPnl ?? currentValue - position.total_invested_usd

  return (
    <a href={`/markets/${market.slug}`} className="flex items-center justify-between p-4 rounded-2xl border bg-card hover:bg-muted/50 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{market.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isYes ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no'}`}>
            {position.side.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">
            {position.shares.toFixed(2)} shares @ {(position.avg_entry_price * 100).toFixed(0)}¢
          </span>
        </div>
      </div>
      <div className="text-right ml-4">
        <p className="font-medium text-sm">${currentValue.toFixed(2)}</p>
        <p className={`text-xs ${pnl >= 0 ? 'text-yes' : 'text-no'}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
        </p>
      </div>
    </a>
  )
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const icons: Record<string, string> = {
    deposit: '💰', withdrawal: '💸', bet_placed: '🎯',
    bet_won: '🏆', bet_lost: '📉', bet_refunded: '↩️',
  }
  const isCredit = ['deposit', 'bet_won', 'bet_refunded', 'bonus'].includes(tx.type)

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icons[tx.type] || '📝'}</span>
        <div>
          <p className="text-sm font-medium capitalize">{tx.type.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-medium text-sm ${isCredit ? 'text-yes' : 'text-muted-foreground'}`}>
          {isCredit ? '+' : '-'}{tx.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} {tx.currency}
        </p>
        <p className="text-xs text-muted-foreground capitalize">{tx.status}</p>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-black mb-6">My Portfolio</h1>
      <PortfolioData />
    </div>
  )
}
