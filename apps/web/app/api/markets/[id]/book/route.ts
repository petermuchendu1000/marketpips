// app/api/markets/[id]/book/route.ts — public CLOB order-book depth.
// Aggregated depth for one (market, candidate, side) book via the SECURITY
// DEFINER clob_get_book RPC (no counterparty identity leaks). Response is
// shaped with PM's cumulative TOTAL column + depth-bar ratios (lib/clob).
// Cached briefly at the edge — books move fast but 1–2s of staleness is fine.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { shapeBook, type RawClobBook } from '@/lib/clob'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const option = searchParams.get('option')
    const side = (searchParams.get('side') || 'yes').toLowerCase()

    if (side !== 'yes' && side !== 'no') {
      return NextResponse.json({ error: 'side must be yes or no' }, { status: 400 })
    }
    if (!option || !UUID_RE.test(option)) {
      return NextResponse.json({ error: 'option (market_option_id) is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Resolve market by UUID or slug; verify it is an order-book market.
    const sel = supabase.from('markets').select('id, pricing_engine')
    const { data: mkt } = await (UUID_RE.test(id)
      ? sel.eq('id', id)
      : sel.eq('slug', id)
    ).maybeSingle()
    if (!mkt) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    if (mkt.pricing_engine !== 'clob') {
      return NextResponse.json({ error: 'This market is not an order-book market' }, { status: 409 })
    }

    const { data: raw, error } = await supabase.rpc('clob_get_book', {
      p_market_id: mkt.id,
      p_market_option_id: option,
      p_outcome_side: side,
    })
    if (error) {
      console.error('clob_get_book error:', error)
      return NextResponse.json({ error: 'Failed to load order book' }, { status: 500 })
    }

    const book = shapeBook(raw as unknown as RawClobBook)
    return NextResponse.json(book, {
      headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=5' },
    })
  } catch (error) {
    console.error('Book route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
