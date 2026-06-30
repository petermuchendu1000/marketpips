// app/api/portfolio/route.ts — Authenticated portfolio with LIVE mark-to-market P&L.
//
// Positions store a stale `current_value_usd` snapshot (written once by
// place_bet). This endpoint instead values open positions at the current
// market price via lib/portfolio, so a freshly placed bet — and every
// subsequent price move — is reflected immediately. RLS on `positions`
// (auth.uid() = user_id) scopes rows to the caller; we use the user-session
// client (NOT the admin client) so that enforcement is preserved.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { summarizePortfolio, type PositionWithMarket } from '@/lib/portfolio'
import type { Position, Transaction, Wallet } from '@/types'

export const dynamic = 'force-dynamic'

const POSITION_SELECT = `
  id, user_id, market_id, side, shares, total_invested_usd, avg_entry_price,
  current_value_usd, unrealized_pnl_usd, realized_pnl_usd, total_payout_usd,
  is_active, created_at, updated_at,
  market:markets(id, title, slug, yes_price, no_price, status, resolved_outcome, closes_at)
`

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const txLimit = Math.min(Math.max(parseInt(searchParams.get('tx_limit') || '20', 10) || 20, 1), 100)

    const [positionsRes, transactionsRes, walletsRes] = await Promise.all([
      supabase
        .from('positions')
        .select(POSITION_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(txLimit),
      supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id),
    ])

    if (positionsRes.error) {
      console.error('Portfolio positions error:', positionsRes.error)
      return NextResponse.json({ error: 'Failed to load positions' }, { status: 500 })
    }

    const rawPositions = (positionsRes.data || []) as unknown as (Position & {
      market: PositionWithMarket['market']
    })[]
    const transactions = (transactionsRes.data || []) as Transaction[]
    const wallets = (walletsRes.data || []) as Wallet[]

    // Live mark-to-market P&L (ignores the stale current_value_usd column).
    const { summary, positions: pnl } = summarizePortfolio(
      rawPositions.map((p) => ({
        id: p.id,
        side: p.side,
        shares: p.shares,
        total_invested_usd: p.total_invested_usd,
        is_active: p.is_active,
        market: (p as any).market ?? null,
      })),
    )

    // Merge computed P&L back onto each position row for the client.
    const pnlById = new Map(pnl.map((c) => [c.positionId, c]))
    const positions = rawPositions.map((p) => ({
      ...p,
      pnl: pnlById.get(p.id) ?? null,
    }))

    return NextResponse.json({
      data: {
        summary,
        positions,
        wallets,
        transactions,
      },
    })
  } catch (error) {
    console.error('Portfolio GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
