// app/markets/page.tsx - Markets browser
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MarketCard } from '@/components/markets/market-card'
import { MarketCardSkeleton } from '@/components/markets/market-card-skeleton'
import { CategoryFilter } from '@/components/markets/category-filter'
import type { Market, MarketCategory, MarketStatus } from '@/types'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Markets' }

interface SearchParams {
  category?: MarketCategory
  status?: MarketStatus
  search?: string
  sort?: string
  page?: string
}

interface MarketsPageProps {
  searchParams: Promise<SearchParams>
}

async function MarketsList({ searchParams }: MarketsPageProps) {
  const supabase = await createClient()
  const sp = await searchParams
  const page = parseInt(sp.page || '1')
  const perPage = 24
  const offset = (page - 1) * perPage

  let query = supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, username)
    `, { count: 'exact' })
    .in('status', sp.status ? [sp.status] : ['active'])
    .range(offset, offset + perPage - 1)

  if (sp.category) {
    query = query.eq('category', sp.category)
  }

  const sortMap: Record<string, { col: string; asc: boolean }> = {
    volume: { col: 'total_volume_usd', asc: false },
    new: { col: 'created_at', asc: false },
    closing: { col: 'closes_at', asc: true },
    bettors: { col: 'unique_bettors', asc: false },
  }
  const sort = sortMap[sp.sort || 'volume'] || sortMap.volume
  query = query.order(sort.col, { ascending: sort.asc })

  const { data: markets, count } = await query

  const totalPages = Math.ceil((count || 0) / perPage)

  return (
    <div>
      {/* Results info */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {count || 0} market{count !== 1 ? 's' : ''}
          {sp.category && ` in ${sp.category}`}
        </p>
        <SortDropdown current={sp.sort} />
      </div>

      {!markets?.length ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🔮</div>
          <h3 className="font-semibold text-lg mb-1">No markets found</h3>
          <p className="text-muted-foreground text-sm">Try a different category or check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market as Market} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1
            const params = new URLSearchParams()
            if (sp.category) params.set('category', sp.category)
            if (sp.sort) params.set('sort', sp.sort)
            params.set('page', String(p))
            return (
              <a
                key={p}
                href={`/markets?${params.toString()}`}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-medium transition-colors ${
                  p === page
                    ? 'bg-primary text-primary-foreground'
                    : 'border hover:bg-muted'
                }`}
              >
                {p}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SortDropdown({ current }: { current?: string }) {
  // Client component needed for this in production, simplified here
  return (
    <div className="flex gap-2 text-xs">
      {[
        { key: 'volume', label: '📊 Volume' },
        { key: 'new', label: '🆕 Newest' },
        { key: 'closing', label: '⏰ Closing' },
        { key: 'bettors', label: '👥 Popular' },
      ].map(({ key, label }) => (
        <a
          key={key}
          href={`?sort=${key}${current ? '' : ''}`}
          className={`px-2.5 py-1 rounded-lg border transition-colors ${
            (current || 'volume') === key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-muted'
          }`}
        >
          {label}
        </a>
      ))}
    </div>
  )
}

export default function MarketsPage({ searchParams }: MarketsPageProps) {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black">Markets</h1>
        <Link
          href="/markets/create"
          className="text-sm font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Create Market
        </Link>
      </div>

      <CategoryFilter />

      <Suspense fallback={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      }>
        <MarketsList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
