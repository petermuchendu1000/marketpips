// components/markets/market-card.tsx
import Link from 'next/link'
import { Clock, Users, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface MarketCardProps {
  market: Market
  featured?: boolean
  compact?: boolean
}

export function MarketCard({ market, featured = false, compact = false }: MarketCardProps) {
  const categoryInfo = CATEGORY_LABELS[market.category]
  const isClosingSoon = new Date(market.closes_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
  const timeLeft = formatDistanceToNow(new Date(market.closes_at), { addSuffix: true })

  const yesPercent = Math.round(market.yes_price * 100)
  const noPercent = 100 - yesPercent

  return (
    <Link
      href={`/markets/${market.slug}`}
      className={cn(
        'market-card block p-4',
        featured && 'ring-1 ring-primary/20',
        compact && 'p-3'
      )}
    >
      {/* Category + Featured badge */}
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', categoryInfo.color)}>
          {categoryInfo.emoji} {categoryInfo.label}
        </span>
        {featured && (
          <span className="text-xs text-primary font-medium">⭐ Featured</span>
        )}
        {isClosingSoon && !featured && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">⏰ Closing soon</span>
        )}
      </div>

      {/* Title */}
      <h3 className={cn(
        'font-semibold leading-snug line-clamp-2 mb-3',
        compact ? 'text-sm' : 'text-base'
      )}>
        {market.title}
      </h3>

      {/* YES / NO prices */}
      <div className="flex items-center gap-2 mb-2">
        <span className="price-yes text-sm">
          YES {yesPercent}%
        </span>
        <span className="price-no text-sm">
          NO {noPercent}%
        </span>
      </div>

      {/* Price bar */}
      <div className="price-bar mb-3">
        <div
          className="price-bar-yes"
          style={{ width: `${yesPercent}%` }}
        />
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            ${market.total_volume_usd >= 1000
              ? `${(market.total_volume_usd / 1000).toFixed(1)}K`
              : market.total_volume_usd.toFixed(0)
            }
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {market.unique_bettors}
          </span>
        </div>
        <span className={cn(
          'flex items-center gap-1',
          isClosingSoon ? 'text-amber-600 dark:text-amber-400' : ''
        )}>
          <Clock className="w-3 h-3" />
          {market.status === 'resolved' ? 'Resolved' : timeLeft}
        </span>
      </div>
    </Link>
  )
}
