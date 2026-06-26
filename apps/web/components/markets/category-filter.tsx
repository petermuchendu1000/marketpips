'use client'

// components/markets/category-filter.tsx
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { MarketCategory } from '@/types'
import { CATEGORY_LABELS } from '@/types'

const ALL_CATEGORIES: Array<{ value: string; label: string; emoji: string }> = [
  { value: '', label: 'All', emoji: '🌐' },
  ...Object.entries(CATEGORY_LABELS).map(([value, info]) => ({
    value,
    label: info.label,
    emoji: info.emoji,
  })),
]

export function CategoryFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeCategory = searchParams.get('category') || ''

  const handleCategory = (category: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (category) {
      params.set('category', category)
    } else {
      params.delete('category')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
      {ALL_CATEGORIES.map(({ value, label, emoji }) => (
        <button
          key={value}
          onClick={() => handleCategory(value)}
          className={cn(
            'flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
            activeCategory === value
              ? 'bg-primary text-primary-foreground'
              : 'border hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <span>{emoji}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
