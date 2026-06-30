// app/api/markets/[id]/route.ts — Fetch a single market by UUID or slug (public).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MARKET_SELECT = `
  id, slug, title, description, category, status, resolution_type,
  resolution_criteria, resolution_source,
  yes_price, no_price, liquidity_pool_usd, initial_liquidity_usd,
  total_volume_usd, yes_volume_usd, no_volume_usd, total_bets, unique_bettors,
  platform_fee_rate, creator_reward_rate,
  opens_at, closes_at, resolves_at, resolved_at, resolved_outcome, resolution_notes,
  is_featured, is_trending, tags, cover_image_url, allowed_countries,
  view_count, comment_count, share_count, created_at, updated_at,
  creator:profiles!markets_creator_id_fkey(id, display_name, username, avatar_url)
`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Market id or slug required' }, { status: 400 })

    const supabase = await createClient()
    const column = UUID_RE.test(id) ? 'id' : 'slug'

    const { data: market, error } = await supabase
      .from('markets')
      .select(MARKET_SELECT)
      .eq(column, id)
      .maybeSingle()

    if (error) {
      console.error('Market fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch market' }, { status: 500 })
    }
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    return NextResponse.json({ data: market })
  } catch (error) {
    console.error('Market GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
