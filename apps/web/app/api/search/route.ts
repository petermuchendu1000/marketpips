import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const query = searchParams.get('q') || ''
  const category = searchParams.get('category')
  const status = searchParams.get('status') || 'active'
  const sort = searchParams.get('sort') || 'volume'
  const page = parseInt(searchParams.get('page') || '1')
  const perPage = parseInt(searchParams.get('per_page') || '20')

  let queryBuilder = supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, avatar_url, username)
    `, { count: 'exact' })

  // Status filter
  if (status === 'all') {
    queryBuilder = queryBuilder.in('status', ['active', 'closed', 'resolved'])
  } else {
    queryBuilder = queryBuilder.eq('status', status)
  }

  // Category filter
  if (category && category !== 'all') {
    queryBuilder = queryBuilder.eq('category', category)
  }

  // Full-text search
  if (query.trim()) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,description.ilike.%${query}%`
    )
  }

  // Sort
  switch (sort) {
    case 'volume':
      queryBuilder = queryBuilder.order('total_volume_usd', { ascending: false })
      break
    case 'newest':
      queryBuilder = queryBuilder.order('created_at', { ascending: false })
      break
    case 'closing':
      queryBuilder = queryBuilder.order('closes_at', { ascending: true })
      break
    case 'bettors':
      queryBuilder = queryBuilder.order('unique_bettors', { ascending: false })
      break
    default:
      queryBuilder = queryBuilder.order('total_volume_usd', { ascending: false })
  }

  const offset = (page - 1) * perPage
  queryBuilder = queryBuilder.range(offset, offset + perPage - 1)

  const { data, error, count } = await queryBuilder

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalPages = Math.ceil((count || 0) / perPage)

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  })
}
