'use client'

// components/layout/home-category-bar.tsx
// ------------------------------------------------------------
// The under-nav category rail on the landing page. A horizontally scrollable
// row of tab pills (Trending / New first, then the market domains), pinned
// directly beneath the sticky navbar. Purely navigational: each pill deep-links
// into the markets feed with the matching filter. Token-only styling — reuses
// the shared `.tab-pill` class so it tracks the Pip design system + dark mode.
import { useRef } from 'react'
import Link from 'next/link'
import { CATEGORY_LABELS } from '@/types'
import type { MarketCategory } from '@/types'
import {
  CategoryIcon, IconTrendUp, IconStar, IconMarkets,
  IconChevronLeft, IconChevronRight,
} from '@/components/ui/icons'

type Pill =
  | { kind: 'link'; key: string; label: string; href: string; icon: 'trending' | 'new' | 'all' }
  | { kind: 'category'; key: MarketCategory; label: string }

// Lead pills mirror the discovery-first ordering: live/trending, freshly
// listed, then every market domain the platform supports.
const LEAD: Pill[] = [
  { kind: 'link', key: 'trending', label: 'Trending', href: '/markets?sort=trending', icon: 'trending' },
  { kind: 'link', key: 'new', label: 'New', href: '/markets?sort=new', icon: 'new' },
]

const CATEGORY_PILLS: Pill[] = (
  Object.entries(CATEGORY_LABELS) as [MarketCategory, { label: string }][]
).map(([key, val]) => ({ kind: 'category', key, label: val.label }))

const PILLS: Pill[] = [...LEAD, ...CATEGORY_PILLS]

export function HomeCategoryBar() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })

  // Drive the in-place Explore feed (components/markets/home-explore.tsx) via a
  // decoupled window event — no navigation, so the choice filters the grid and
  // scrolls it into view without a server round-trip.
  const filterInPlace = (category: string) =>
    window.dispatchEvent(new CustomEvent('marketpips:home-category', { detail: { category } }))

  return (
    <div
      className="sticky z-40"
      style={{
        top: 'var(--nav-h, 56px)',
        background: 'color-mix(in srgb, var(--bg) 82%, transparent)',
        backdropFilter: 'saturate(1.2) blur(12px)',
        WebkitBackdropFilter: 'saturate(1.2) blur(12px)',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div className="max-w-[1350px] mx-auto px-4 lg:px-6 relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label="Scroll categories left"
          className="hidden sm:flex flex-none w-7 h-7 items-center justify-center rounded-[var(--r-sm)] transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--hairline)' }}
        >
          <IconChevronLeft size={14} />
        </button>

        {/* edge fades */}
        <div aria-hidden className="absolute inset-y-0 left-8 w-8 z-10 pointer-events-none hidden sm:block"
          style={{ background: 'linear-gradient(90deg, var(--bg), transparent)' }} />
        <div aria-hidden className="absolute inset-y-0 right-8 w-8 z-10 pointer-events-none hidden sm:block"
          style={{ background: 'linear-gradient(270deg, var(--bg), transparent)' }} />

        <nav
          ref={scrollRef}
          aria-label="Browse markets by category"
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-2.5 flex-1"
        >
          {PILLS.map((p) =>
            p.kind === 'link' ? (
              <Link
                key={p.key}
                href={p.href}
                className="tab-pill flex-none flex items-center gap-1.5"
              >
                {p.icon === 'trending' ? <IconTrendUp size={14} />
                  : p.icon === 'new' ? <IconStar size={14} />
                  : <IconMarkets size={14} />}
                <span>{p.label}</span>
              </Link>
            ) : (
              <button
                key={p.key}
                type="button"
                onClick={() => filterInPlace(p.key)}
                className="tab-pill flex-none flex items-center gap-1.5"
              >
                <CategoryIcon category={p.key} size={14} />
                <span>{p.label}</span>
              </button>
            ),
          )}
        </nav>

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
    </div>
  )
}
