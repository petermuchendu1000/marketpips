// app/portfolio/page.tsx — Portfolio (live mark-to-market)
// Institutional dashboard: KPI band + allocation donut + holdings book +
// activity. All figures are computed server-side against LIVE prices (never the
// stale positions.current_value_usd snapshot). Pure Pip system, no emoji.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { summarizePortfolio } from '@/lib/portfolio'
import { buildRatesMap, localToUsd } from '@/lib/currency'
import type { Position, Transaction, Wallet, CurrencyCode, MarketStatus } from '@/types'
import { SummaryCards } from '@/components/portfolio/summary-cards'
import { AllocationDonut, type AllocationSlice } from '@/components/portfolio/allocation-donut'
import { HoldingsTable, type HoldingRow } from '@/components/portfolio/holdings-table'
import { TransactionHistory } from '@/components/portfolio/transaction-history'

// Personal data — render dynamically per request, never prerender or index.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'My Portfolio', robots: { index: false, follow: false } }

type JoinedMarket = {
  id: string
  title: string
  slug: string
  yes_price: number
  no_price: number
  status: MarketStatus
  resolved_outcome: 'yes' | 'no' | null
  closes_at: string
}

const OUTCOME_LABEL: Record<string, string> = {
  active: 'Open',
  resolved_win: 'Won',
  resolved_loss: 'Lost',
  cancelled: 'Refunded',
}

async function PortfolioData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [positionsRes, transactionsRes, walletsRes, ratesRes] = await Promise.all([
    supabase
      .from('positions')
      .select(
        `*, market:markets(id, title, slug, yes_price, no_price, status, resolved_outcome, closes_at)`,
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('wallets').select('*').eq('user_id', user.id),
    supabase.from('exchange_rates').select('from_currency, rate').eq('to_currency', 'USD'),
  ])

  const positions = (positionsRes.data || []) as (Position & { market: JoinedMarket | null })[]
  const transactions = (transactionsRes.data || []) as Transaction[]
  const wallets = (walletsRes.data || []) as Wallet[]
  const rates = buildRatesMap(
    (ratesRes.data as { from_currency: string; rate: number | string | null }[]) ?? [],
  )

  // Live mark-to-market P&L (single source of truth).
  const { summary, positions: pnl } = summarizePortfolio(
    positions.map((p) => ({
      id: p.id,
      side: p.side,
      shares: p.shares,
      total_invested_usd: p.total_invested_usd,
      is_active: p.is_active,
      market: p.market ?? null,
    })),
  )
  const pnlById = new Map(pnl.map((c) => [c.positionId, c]))

  // Cash across wallets, normalized to USD.
  const cashUsd = wallets.reduce(
    (sum, w) => sum + localToUsd(w.available_balance, w.currency as CurrencyCode, rates),
    0,
  )

  // Open holdings (active, price-sensitive) drive the table + donut + weights.
  const openPositions = positions.filter((p) => {
    const c = pnlById.get(p.id)
    return c && !c.isSettled && p.market
  })
  const totalOpenValue = openPositions.reduce(
    (s, p) => s + (pnlById.get(p.id)?.currentValue ?? 0),
    0,
  )

  // Today's P&L: mark each held market at its first tick since 00:00 UTC and
  // sum the change in value. Markets with no tick today contribute nothing.
  let todayPnl = 0
  const marketIds = openPositions.map((p) => p.market!.id)
  if (marketIds.length > 0) {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const { data: history } = await supabase
      .from('price_history')
      .select('market_id, yes_price, no_price, recorded_at')
      .in('market_id', marketIds)
      .gte('recorded_at', startOfDay.toISOString())
      .order('recorded_at', { ascending: true })

    const dayOpen = new Map<string, { yes: number; no: number }>()
    for (const row of (history as { market_id: string; yes_price: number; no_price: number }[]) ?? []) {
      if (!dayOpen.has(row.market_id)) dayOpen.set(row.market_id, { yes: row.yes_price, no: row.no_price })
    }
    for (const p of openPositions) {
      const c = pnlById.get(p.id)
      const open = dayOpen.get(p.market!.id)
      if (!c || !open) continue
      const openPrice = p.side === 'yes' ? open.yes : open.no
      const openValue = p.shares * openPrice
      todayPnl += c.currentValue - openValue
    }
  }

  const totalValue = summary.totalCurrentValue + cashUsd

  const holdings: HoldingRow[] = openPositions
    .map((p) => {
      const c = pnlById.get(p.id)!
      return {
        id: p.id,
        title: p.market!.title,
        slug: p.market!.slug,
        side: p.side,
        shares: p.shares,
        avgCost: p.avg_entry_price,
        livePrice: c.markPrice,
        marketValue: c.currentValue,
        invested: c.invested,
        pnl: c.totalPnl,
        pnlPct: c.pnlPct,
        weight: totalOpenValue > 0 ? c.currentValue / totalOpenValue : 0,
        isSettled: c.isSettled,
        outcomeLabel: OUTCOME_LABEL[c.outcome] ?? 'Open',
      }
    })
    .sort((a, b) => b.marketValue - a.marketValue)

  const slices: AllocationSlice[] = holdings.map((h) => ({
    label: h.title,
    value: h.marketValue,
    side: h.side,
  }))

  return (
    <div className="space-y-6">
      <SummaryCards
        totalValue={totalValue}
        unrealizedPnl={summary.totalUnrealizedPnl}
        unrealizedPnlPct={summary.unrealizedPnlPct}
        todayPnl={todayPnl}
        cashUsd={cashUsd}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Holdings</h2>
          <HoldingsTable holdings={holdings} />
        </div>
        <div>
          <AllocationDonut slices={slices} />
          {summary.totalRealizedPnl !== 0 && (
            <div className="card mt-4 p-4">
              <p className="text-xs font-medium text-text-muted">Realized P&amp;L (settled)</p>
              <p
                className={`mt-1 font-mono text-lg font-bold ${
                  summary.totalRealizedPnl >= 0 ? 'text-yes' : 'text-no'
                }`}
              >
                {summary.totalRealizedPnl >= 0 ? '+' : ''}
                {summary.totalRealizedPnl.toFixed(2)} USD
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Across {summary.settledCount} settled position{summary.settledCount === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Recent activity</h2>
        <TransactionHistory transactions={transactions} />
      </section>
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">My Portfolio</h1>
      <PortfolioData />
    </div>
  )
}
