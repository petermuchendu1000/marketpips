// app/api/bets/route.ts - Place a bet
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isFeatureEnabled } from '@/lib/flags'
import { clobOrderSchema, clobErrorFor, clampPriceCents } from '@/lib/clob'
import { z } from 'zod'
import { nanoid } from 'nanoid'

const placeBetSchema = z.object({
  market_id: z.string().uuid(),
  // Trading targets (see routing below):
  //   • binary market                → side only
  //   • simplex multiple_choice      → market_option_id only
  //   • independent multiple_choice  → market_option_id + side (per-candidate Yes/No)
  side: z.enum(['yes', 'no']).optional(),
  market_option_id: z.string().uuid().optional(),
  amount_local: z.number().positive().min(0.01),
  currency: z.enum(['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD']),
  order_type: z.enum(['market', 'limit']).default('market'),
  limit_price: z.number().min(0.01).max(0.99).optional(),
})
  .refine((d) => d.order_type !== 'limit' || d.limit_price != null, {
    message: 'limit_price is required for limit orders',
    path: ['limit_price'],
  })
  // Must identify a target: a side (binary) and/or an option (multiple choice).
  .refine((d) => !!d.side || !!d.market_option_id, {
    message: 'Provide a side (binary) and/or a market_option_id (multiple choice)',
    path: ['side'],
  })
  // Any option order (simplex or independent) is a market order only.
  .refine((d) => !d.market_option_id || d.order_type === 'market', {
    message: 'Multiple-choice orders must be market orders',
    path: ['order_type'],
  })

// Map place_bet SQLSTATE codes -> HTTP responses (single source of truth).
const BET_ERRORS: Record<string, { status: number; error: string }> = {
  P0001: { status: 404, error: 'Market not found or not active' },
  P0002: { status: 409, error: 'Market is closed for betting' },
  P0003: { status: 400, error: 'Unsupported currency' },
  P0004: { status: 400, error: 'Minimum bet is 0.10 USD equivalent' },
  P0005: { status: 400, error: 'Wallet not found for this currency' },
  P0006: { status: 402, error: 'Insufficient balance' },
  P0007: { status: 400, error: 'Selected option was not found for this market' },
  P0008: { status: 422, error: 'Could not compute a valid trade size' },
  P0009: { status: 409, error: 'This market is not open for per-candidate Yes/No trading' },
}

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

    // CLOB order-book markets use a distinct payload + atomic RPC. Route early
    // so the AMM (place_bet*) path is never touched for order-book trades.
    if (body?.engine === 'clob') {
      return handleClobOrder({ supabase, adminClient, user, body })
    }

    const parsed = placeBetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { market_id, side, market_option_id, amount_local, currency, order_type, limit_price } =
      parsed.data
    const clientOrderId = `bet_${user.id.slice(0, 8)}_${nanoid(8)}`

    // Determine the market's option-pricing mode to route option orders. The
    // independent (per-candidate Yes/No) path is gated by BOTH the market being
    // migrated to 'independent' mode AND the feature flag (instant kill-switch).
    let independentActive = false
    if (market_option_id) {
      const { data: mkt } = await adminClient
        .from('markets')
        .select('options_pricing_mode')
        .eq('id', market_id)
        .maybeSingle()
      const isIndependentMarket = mkt?.options_pricing_mode === 'independent'
      const flagOn = await isFeatureEnabled(supabase, 'flags.independent_options')
      independentActive = isIndependentMarket && flagOn

      // Guard: a migrated (independent) market must not fall back to the simplex
      // engine (its per-candidate prices are incompatible). If the flag is the
      // only thing off, refuse cleanly rather than mis-pricing the trade.
      if (isIndependentMarket && !flagOn) {
        return NextResponse.json(
          { error: 'Per-candidate Yes/No trading is temporarily unavailable' },
          { status: 503 },
        )
      }
      // Independent markets require an explicit Yes/No side per candidate.
      if (independentActive && !side) {
        return NextResponse.json(
          { error: 'Select Yes or No for this candidate' },
          { status: 400 },
        )
      }
    }

    // Route to the correct atomic RPC. All three mirror the same
    // wallet/fee/accounting guardrails.
    //   • independent option → place_bet_option_binary (per-candidate Yes/No line)
    //   • simplex option     → place_bet_option (shared LMSR, buy the option)
    //   • binary market      → place_bet (side-based)
    const dispatch = independentActive && market_option_id
      ? adminClient.rpc('place_bet_option_binary', {
          p_user_id: user.id,
          p_market_id: market_id,
          p_option_id: market_option_id,
          p_side: side!,
          p_amount_local: amount_local,
          p_currency: currency,
          p_client_order_id: clientOrderId,
        })
      : market_option_id
      ? adminClient.rpc('place_bet_option', {
          p_user_id: user.id,
          p_market_id: market_id,
          p_option_id: market_option_id,
          p_amount_local: amount_local,
          p_currency: currency,
          p_client_order_id: clientOrderId,
        })
      : adminClient.rpc('place_bet', {
          p_user_id: user.id,
          p_market_id: market_id,
          p_side: side!,
          p_amount_local: amount_local,
          p_currency: currency,
          p_order_type: order_type,
          p_limit_price: limit_price || null,
          p_client_order_id: clientOrderId,
        })

    const { data: result, error: betError } = await dispatch

    if (betError) {
      // Map known SQLSTATE codes from place_bet to precise HTTP responses.
      const code = Object.keys(BET_ERRORS).find((c) => betError.message.includes(c))
      if (code) {
        const { status, error } = BET_ERRORS[code]
        return NextResponse.json({ error }, { status })
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

/**
 * CLOB order-book order placement. Gated by the `flags.clob` kill-switch and
 * the market's `pricing_engine='clob'`. Buy-side only in phase 1b (the RPC
 * rejects sells with P0100). Market buys may be dollar-denominated: we convert
 * amount_local → size (shares) via the current best ask (conservative — never
 * overspends), while limit orders are share-denominated. All accounting is
 * atomic inside clob_place_order (escrow, positions, transactions, fills).
 */
async function handleClobOrder({
  supabase,
  adminClient,
  user,
  body,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  adminClient: Awaited<ReturnType<typeof createAdminClient>>
  user: { id: string }
  body: unknown
}) {
  // Kill-switch: deploy ≠ release. Off by default; flip via env or settings.
  if (!(await isFeatureEnabled(supabase, 'flags.clob'))) {
    return NextResponse.json(
      { error: 'Order-book trading is temporarily unavailable' },
      { status: 503 },
    )
  }

  const parsed = clobOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const o = parsed.data

  // Authoritative engine check — never mis-route an AMM market into the CLOB.
  const { data: mkt } = await adminClient
    .from('markets')
    .select('pricing_engine')
    .eq('id', o.market_id)
    .maybeSingle()
  if (!mkt) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  if (mkt.pricing_engine !== 'clob') {
    return NextResponse.json({ error: 'This market is not an order-book market' }, { status: 409 })
  }

  // Resolve order size (shares).
  let size = o.size ?? null
  if (o.order_type === 'market' && size == null && o.amount_local != null) {
    // Convert $ → shares via the best ask (best-effort, single-level estimate).
    const { data: book } = await adminClient.rpc('clob_get_book', {
      p_market_id: o.market_id,
      p_market_option_id: o.market_option_id,
      p_outcome_side: o.outcome_side,
    })
    const bestAsk = (book as { best_ask: number | null } | null)?.best_ask ?? null
    if (!bestAsk || bestAsk <= 0) {
      return NextResponse.json(
        { error: 'No resting liquidity to fill a market order right now' },
        { status: 409 },
      )
    }
    const { data: fx } = await adminClient
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', o.currency)
      .eq('to_currency', 'USD')
      .maybeSingle()
    const rate = (fx as { rate: number } | null)?.rate
    if (!rate) return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 })
    const amountUsd = o.amount_local * rate
    size = Math.floor((amountUsd / (bestAsk / 100)) * 1e6) / 1e6
    if (size <= 0) {
      return NextResponse.json({ error: 'Amount too small to buy any shares' }, { status: 400 })
    }
  }
  if (size == null || size <= 0) {
    return NextResponse.json({ error: 'Order size must be greater than zero' }, { status: 400 })
  }

  const clientOrderId = o.client_order_id ?? `clob_${user.id.slice(0, 8)}_${nanoid(8)}`
  const priceCents = o.order_type === 'limit' ? clampPriceCents(o.price_cents!) : null

  const { data: result, error: rpcError } = await adminClient.rpc('clob_place_order', {
    p_user_id: user.id,
    p_market_id: o.market_id,
    p_market_option_id: o.market_option_id,
    p_outcome_side: o.outcome_side,
    p_action: o.action,
    p_order_type: o.order_type,
    p_price_cents: priceCents,
    p_size: size,
    p_currency: o.currency,
    p_client_order_id: clientOrderId,
    p_expires_at: o.expires_at ?? null,
  })

  if (rpcError) {
    const mapped = clobErrorFor(rpcError.message)
    if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    console.error('CLOB order error:', rpcError)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: result })
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
