// app/api/markets/route.ts - Markets CRUD
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { Enums } from '@/types/supabase'

// GET - list markets with filters
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)

    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search')
    const featured = searchParams.get('featured')
    const trending = searchParams.get('trending')
    const sortBy = searchParams.get('sort_by') || 'total_volume_usd'
    const sortOrder = searchParams.get('sort_order') === 'asc'
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20'), 100)
    const offset = (page - 1) * perPage

    let query = supabase
      .from('markets')
      .select(
        `
        id, slug, title, description, category, status,
        yes_price, no_price, total_volume_usd, total_bets, unique_bettors,
        closes_at, resolves_at, resolved_at, resolved_outcome,
        is_featured, is_trending, tags, cover_image_url,
        creator:profiles!markets_creator_id_fkey(id, display_name, username)
        `,
        { count: 'exact' }
      )
      .in(
        'status',
        (status === 'all'
          ? ['active', 'closed', 'resolved']
          : [status]) as Enums<'market_status'>[]
      )

    if (category) query = query.eq('category', category as Enums<'market_category'>)
    if (featured === 'true') query = query.eq('is_featured', true)
    if (trending === 'true') query = query.eq('is_trending', true)

    if (search) {
      query = query.textSearch('title', search, { type: 'websearch' })
    }

    query = query
      .order(sortBy as 'total_volume_usd', { ascending: sortOrder })
      .range(offset, offset + perPage - 1)

    const { data: markets, count, error } = await query

    if (error) {
      console.error('Markets fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
    }

    return NextResponse.json({
      data: markets || [],
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
      has_next: offset + perPage < (count || 0),
      has_prev: page > 1,
    })

  } catch (error) {
    console.error('Markets route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const createMarketSchema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().min(20).max(2000),
  category: z.enum([
    'politics', 'sports', 'economics', 'crypto', 'technology',
    'entertainment', 'weather', 'governance', 'elections', 'business',
    'health', 'social', 'other'
  ]),
  resolution_criteria: z.string().min(20).max(1000),
  closes_at: z.string().datetime(),
  resolves_at: z.string().datetime().optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  cover_image_url: z.string().url().optional(),
})

// POST - create market
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_status, role, kyc_status')
      .eq('id', user.id)
      .single()

    if (profile?.account_status !== 'active') {
      return NextResponse.json({ error: 'Account not active' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createMarketSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Validate close date
    const closesAt = new Date(data.closes_at)
    if (closesAt <= new Date()) {
      return NextResponse.json({ error: 'Close date must be in the future' }, { status: 400 })
    }

    // Generate slug
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)
      + '-' + Date.now().toString(36)

    // Markets created by regular users go to 'pending' for admin review
    // Admin/moderators can go directly to 'active'
    const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator'
    const status = isAdmin ? 'active' : 'pending'

    const adminClient = await createAdminClient()
    const { data: market, error: createError } = await adminClient
      .from('markets')
      .insert({
        ...data,
        slug,
        creator_id: user.id,
        status,
        resolver_id: isAdmin ? user.id : null,
      })
      .select()
      .single()

    if (createError) {
      if (createError.code === '23505') { // unique violation
        return NextResponse.json({ error: 'Market with similar title already exists' }, { status: 409 })
      }
      console.error('Market creation error:', createError)
      return NextResponse.json({ error: 'Failed to create market' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: market }, { status: 201 })

  } catch (error) {
    console.error('Create market error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
