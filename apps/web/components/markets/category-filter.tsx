'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CATEGORY_LABELS } from '@/types'
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons'

const CATEGORIES = [
  { key: 'all', emoji: '⚡', label: 'All' },
  ...Object.entries(CATEGORY_LABELS).map(([key, val]) => ({ key, ...val })),
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
      const qs = sp.toString()
      router.push(qs ? `/markets?${qs}` : '/markets')
    })

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' })
  }

  return (
    <div className="relative flex items-center gap-1">
      {/* Left arrow */}
      <button
        onClick={() => scroll('left')}
        className="hidden sm:flex flex-shrink-0 w-7 h-7 items-center justify-center rounded-lg transition-colors"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
      >
        <IconChevronLeft size={14} />
      </button>

      {/* Scrollable pills */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1"
      >
        {CATEGORIES.map(cat => {
          const count = counts[cat.key]
          const active = activeKey === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => handleChange(cat.key)}
              className={`tab-pill flex-shrink-0 flex items-center gap-1.5 ${active ? 'active' : ''}`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5"
                  style={{
                    background: active ? 'rgba(34,197,94,0.2)' : 'var(--bg-tertiary)',
                    color: active ? 'var(--green)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll('right')}
        className="hidden sm:flex flex-shrink-0 w-7 h-7 items-center justify-center rounded-lg transition-colors"
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
      >
        <IconChevronRight size={14} />
      </button>
    </div>
  )
}
