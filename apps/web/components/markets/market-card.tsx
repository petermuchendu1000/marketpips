'use client'

import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { IconClock, IconUser, IconTrendUp, CategoryIcon } from '@/components/ui/icons'

interface MarketCardProps {
  market: Market
  compact?: boolean
}

function timeLeft(closes: string) {
  const ms = new Date(closes).getTime() - Date.now()
  if (ms < 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function MarketCard({ market, compact = false }: MarketCardProps) {
  const cat = CATEGORY_LABELS[market.category] ?? { emoji: '', label: 'Other', color: '' }
  const yesPct = Math.round(market.yes_price * 100)
  const noPct = 100 - yesPct
  const isClosingSoon = new Date(market.closes_at).getTime() - Date.now() < 86400000 * 2

  return (
    <Link href={`/markets/${market.slug}`} className="market-card group block" aria-label={market.title}>
      {/* Top row: category + time */}
      <div className="flex items-center justify-between mb-3">
        <span className="badge badge-muted gap-1.5">
          <CategoryIcon category={market.category} size={12} />
          <span>{cat.label}</span>
        </span>
        <span
          className={`flex items-center gap-1 text-[11px] font-medium ${
            isClosingSoon ? 'text-amber-light' : ''
          }`}
          style={{ color: isClosingSoon ? 'var(--amber)' : 'var(--text-muted)' }}
        >
          <IconClock size={11} />
          {timeLeft(market.closes_at)}
        </span>
      </div>

      {/* Title */}
      <h3
        className={`font-semibold leading-snug mb-3 transition-colors group-hover:text-[var(--pip-500)] ${
          compact ? 'text-sm line-clamp-2' : 'text-[15px] line-clamp-3'
        }`}
        style={{ color: 'var(--text-primary)' }}
      >
        {market.title}
      </h3>

      {/* Probability bar + YES/NO chips */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold price-yes">{yesPct}%</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Yes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No</span>
            <span className="text-xs font-bold price-no">{noPct}%</span>
          </div>
        </div>
        <div className="prob-bar">
          <div className="prob-bar-fill" style={{ width: `${yesPct}%` }} />
        </div>
      </div>

      {/* Bottom row: volume + bettors */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <IconTrendUp size={11} />
            ${market.total_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <IconUser size={11} />
            {market.unique_bettors.toLocaleString()}
          </span>
        </div>

        {/* Status badge */}
        {market.status === 'resolved' ? (
          <span className="badge badge-muted">Resolved</span>
        ) : market.status === 'closed' ? (
          <span className="badge badge-amber">Pending</span>
        ) : market.is_featured ? (
          <span className="badge" style={{ background: 'var(--pip-100)', color: 'var(--pip-500)' }}>Featured</span>
        ) : null}
      </div>
    </Link>
  )
}

// Skeleton loader
export function MarketCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-12 rounded-full" />
      </div>
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-3/4 rounded" />
      <div className="skeleton h-2 w-full rounded-full mt-2" />
      <div className="flex justify-between mt-2">
        <div className="skeleton h-4 w-16 rounded" />
        <div className="skeleton h-4 w-12 rounded" />
      </div>
    </div>
  )
}
