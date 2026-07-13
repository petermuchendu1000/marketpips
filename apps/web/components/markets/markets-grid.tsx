'use client'

import { useState, useEffect, useCallback } from 'react'
import { MarketCard, MarketCardSkeleton, type CardLeadingOption } from '@/components/markets/market-card'
import { CategoryFilter } from '@/components/markets/category-filter'
import type { Market } from '@/types'
import { IconSearch, IconFilter, IconX } from '@/components/ui/icons'

/** Search rows may carry the multiple_choice front-runner (see /api/search). */
type MarketRow = Market & { leading_option?: CardLeadingOption; option_count?: number | null }

const SORTS = [
  { value: 'volume',  label: 'Most Volume' },
  { value: 'newest',  label: 'Newest' },
  { value: 'closing', label: 'Closing Soon' },
  { value: 'bettors', label: 'Most Bettors' },
]

export function MarketsGrid({ initialMarkets = [] }: { initialMarkets?: Market[] }) {
  const [markets, setMarkets] = useState<MarketRow[]>(initialMarkets)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('volume')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchMarkets = useCallback(async (pageToLoad: number, reset: boolean) => {
    setLoading(true)
    const params = new URLSearchParams({ q: query, category, sort, page: String(pageToLoad), per_page: '12' })
    const res = await window.fetch(`/api/search?${params}`)
    const data = await res.json()
    setMarkets(prev => reset ? data.data : [...prev, ...data.data])
    setHasMore(data.has_next)
    setPage(pageToLoad)
    setLoading(false)
  }, [query, category, sort])

  useEffect(() => {
    fetchMarkets(1, true)
  }, [fetchMarkets])

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }} />
          <input
            className="input pl-9 text-sm"
            placeholder="Search markets…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => setQuery('')}
              style={{ color: 'var(--text-muted)' }}
            >
              <IconX size={13} />
            </button>
          )}
        </div>

        {/* Sort */}
        <select
          className="input text-sm"
          style={{ maxWidth: 160 }}
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Category pills */}
      <div className="mb-6">
        <CategoryFilter selected={category} onChange={c => { setCategory(c); setPage(1) }} />
      </div>

      {/* Grid */}
      {loading && markets.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-4xl mb-3">🔮</div>
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No markets found</p>
          {query && <p className="text-sm">Try a different search term</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {markets.map(m => (
              <MarketCard
                key={m.id}
                market={m}
                leadingOption={m.leading_option}
                optionCount={m.option_count ?? undefined}
              />
            ))}
            {loading && Array.from({ length: 4 }).map((_, i) => <MarketCardSkeleton key={`sk-${i}`} />)}
          </div>

          {hasMore && !loading && (
            <div className="text-center mt-8">
              <button
                className="btn btn-secondary"
                onClick={() => fetchMarkets(page + 1, false)}
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
