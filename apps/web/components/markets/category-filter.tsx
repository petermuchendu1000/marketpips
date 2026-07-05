'use client'

// components/markets/category-filter.tsx
// Horizontally-scrollable category rail. Token-only, custom CategoryIcon (no
// emoji). Works both URL-driven (default: writes ?category) and controlled
// (pass `selected` + `onChange`, as markets-grid does).
import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORY_LABELS } from '@/types'
import type { MarketCategory } from '@/types'
import { CategoryIcon, IconMarkets, IconChevronLeft, IconChevronRight } from '@/components/ui/icons'

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  ...(Object.entries(CATEGORY_LABELS) as [MarketCategory, { label: string }][]).map(
    ([key, val]) => ({ key, label: val.label }),
  ),
]

interface CategoryFilterProps {
  /** Controlled selection. If omitted, derived from the `category` URL param. */
  selected?: string
  /** Change handler. If omitted, navigates to /markets?category=… */
  onChange?: (cat: string) => void
  counts?: Record<string, number>
}

export function CategoryFilter({ selected, onChange, counts = {} }: CategoryFilterProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeKey = selected ?? searchParams.get('category') ?? 'all'

  const handleChange =
    onChange ??
    ((cat: string) => {
      const sp = new URLSearchParams(Array.from(searchParams.entries()))
      if (cat === 'all') sp.delete('category')
      else sp.set('category', cat)
      sp.delete('page') // category change returns to first page
      const qs = sp.toString()
      router.replace(qs ? `/markets?${qs}` : '/markets', { scroll: false })
    })

  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' })

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label="Scroll categories left"
        className="hidden sm:flex flex-none w-7 h-7 items-center justify-center rounded-[var(--r-sm)] transition-colors"
        style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--hairline)' }}
      >
        <IconChevronLeft size={14} />
      </button>

      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Market categories"
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1"
      >
        {CATEGORIES.map((cat) => {
          const active = activeKey === cat.key
          const count = counts[cat.key]
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleChange(cat.key)}
              className={`tab-pill flex-none flex items-center gap-1.5 ${active ? 'active' : ''}`}
            >
              {cat.key === 'all' ? (
                <IconMarkets size={14} />
              ) : (
                <CategoryIcon category={cat.key} size={14} />
              )}
              <span>{cat.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5 font-mono"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--pip-500) 18%, transparent)' : 'var(--surface-2)',
                    color: active ? 'var(--pip-500)' : 'var(--text-3)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label="Scroll categories right"
        className="hidden sm:flex flex-none w-7 h-7 items-center justify-center rounded-[var(--r-sm)] transition-colors"
        style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--hairline)' }}
      >
        <IconChevronRight size={14} />
      </button>
    </div>
  )
}
