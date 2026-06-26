// app/api/bets/route.ts - Place a bet
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'

const placeBetSchema = z.object({
  market_id: z.string().uuid(),
  side: z.enum(['yes', 'no']),
  amount_local: z.number().positive().min(0.01),
  currency: z.enum(['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD']),
  order_type: z.enum(['market', 'limit']).default('market'),
  limit_price: z.number().min(0.01).max(0.99).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = await createAdminClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check account status
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_status, kyc_status')
      .eq('id', user.id)
      .single()

    if (profile?.account_status !== 'active') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
    }

    // Parse body
    const body = await req.json()
    const parsed = placeBetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { market_id, side, amount_local, currency, order_type, limit_price } = parsed.data
    const clientOrderId = `bet_${user.id.slice(0, 8)}_${nanoid(8)}`

    // Call the atomic place_bet database function
    const { data: result, error: betError } = await adminClient.rpc('place_bet', {
      p_user_id: user.id,
      p_market_id: market_id,
      p_side: side,
      p_amount_local: amount_local,
      p_currency: currency,
      p_order_type: order_type,
      p_limit_price: limit_price || null,
      p_client_order_id: clientOrderId,
    })

    if (betError) {
      // Parse Postgres error codes
      if (betError.message.includes('P0001')) {
        return NextResponse.json({ error: 'Market not found or not active' }, { status: 404 })
      }
      if (betError.message.includes('P0006')) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
      }
      if (betError.message.includes('P0002')) {
        return NextResponse.json({ error: 'Market is closed for betting' }, { status: 409 })
      }
      console.error('Bet placement error:', betError)
      return NextResponse.json({ error: 'Failed to place bet' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: result,
    })

  } catch (error) {
    console.error('Bet route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const marketId = searchParams.get('market_id')
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = parseInt(searchParams.get('per_page') || '20')
    const offset = (page - 1) * perPage

    let query = supabase
      .from('orders')
      .select('*, market:markets(id, title, slug, yes_price, no_price, status)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (marketId) {
      query = query.eq('market_id', marketId)
    }

    const { data: orders, count } = await query

    return NextResponse.json({
      data: orders || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    })

  } catch (error) {
    console.error('Get bets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
