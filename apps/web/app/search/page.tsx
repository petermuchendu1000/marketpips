'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { splitHighlight } from '@/lib/search'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  return (
    <>
      {splitHighlight(text, query).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="bg-warning/40 text-inherit rounded px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

export default function SearchPage() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState('relevance')
  const [markets, setMarkets] = useState<Market[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          category,
          status,
          sort,
          per_page: '30',
        })
        const res = await window.fetch(`/api/search?${params}`, { signal: controller.signal })
        const json = await res.json()
        setMarkets(json.data || [])
        setTotal(json.total || 0)
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setMarkets([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [debouncedQuery, category, status, sort])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">🔍 Search Markets</h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" aria-hidden>
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            aria-label="Search markets"
            className="input input-bordered w-full pl-9"
            placeholder="Search elections, sports, crypto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs"
              onClick={() => setQuery('')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          className="select select-bordered select-sm"
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>
              {val.emoji} {val.label}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
          <option value="all">Any status</option>
        </select>
        <select
          className="select select-bordered select-sm"
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="relevance">Best match</option>
          <option value="volume">Most Volume</option>
          <option value="newest">Newest</option>
          <option value="closing">Closing Soon</option>
          <option value="bettors">Most Bettors</option>
        </select>
      </div>

      {/* Results count — always rendered (reserved height) so the
          loading -> loaded transition doesn't shift layout (CLS). */}
      <p className="text-sm text-base-content/50 mb-4 min-h-[1.25rem]" aria-live="polite">
        {!loading && (
          <>
            {total} market{total !== 1 ? 's' : ''} found
            {debouncedQuery ? ` for "${debouncedQuery}"` : ''}
          </>
        )}
      </p>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16 text-base-content/50">
          <div className="text-5xl mb-4">🔮</div>
          <p className="font-medium">No markets found</p>
          {query && <p className="text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {markets.map((market) => {
            const cat = CATEGORY_LABELS[market.category]
            return (
              <li key={market.id}>
                <Link href={`/markets/${market.slug}`} className="block">
                  <div className="card bg-base-200 hover:bg-base-300 transition-colors">
                    <div className="card-body py-3 px-4 flex flex-row items-center gap-4">
                      <div className="text-2xl" aria-hidden>
                        {cat?.emoji || '🔮'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          <Highlighted text={market.title} query={debouncedQuery} />
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className={`badge badge-sm ${cat?.color || ''}`}>{cat?.label}</span>
                          <span className="text-xs text-base-content/50">
                            Vol: ${market.total_volume_usd.toFixed(0)}
                          </span>
                          <span className="text-xs text-base-content/50">
                            {market.unique_bettors} bettors
                          </span>
                          <span className="text-xs text-base-content/50">
                            Closes {new Date(market.closes_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-success">
                          {Math.round(market.yes_price * 100)}%
                        </div>
                        <div className="text-xs text-base-content/50">YES</div>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
