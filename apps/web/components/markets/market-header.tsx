'use client'

// components/markets/market-header.tsx
import Image from 'next/image'
import { Share2, Bookmark, ExternalLink } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface MarketHeaderProps {
  market: Market
}

export function MarketHeader({ market }: MarketHeaderProps) {
  const categoryInfo = CATEGORY_LABELS[market.category]
  const yesPercent = Math.round(market.yes_price * 100)
  const noPercent = 100 - yesPercent
  const isResolved = market.status === 'resolved'

  const handleShare = async () => {
    const url = `${window.location.origin}/markets/${market.slug}`
    if (navigator.share) {
      await navigator.share({ title: market.title, url })
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
    }
  }

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Cover image */}
      {market.cover_image_url && (
        <div className="relative h-40 w-full">
          <Image
            src={market.cover_image_url}
            alt={market.title}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>
      )}

      <div className="p-5">
        {/* Category + Status */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', categoryInfo.color)}>
            {categoryInfo.emoji} {categoryInfo.label}
          </span>
          <span className={cn(
            'text-xs px-2.5 py-1 rounded-full font-medium border',
            market.status === 'active' && 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
            market.status === 'resolved' && 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
            market.status === 'closed' && 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400',
          )}>
            {market.status === 'active' && '🟢 Active'}
            {market.status === 'closed' && '🟡 Awaiting Resolution'}
            {market.status === 'resolved' && '⚪ Resolved'}
          </span>
          {market.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold leading-snug mb-4">{market.title}</h1>

        {/* Big probability display */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-end gap-2 mb-1">
              <span className={cn(
                'text-4xl font-black',
                isResolved
                  ? market.resolved_outcome === 'yes' ? 'text-yes' : 'text-muted-foreground'
                  : 'text-yes'
              )}>
                {yesPercent}%
              </span>
              <span className="text-sm text-muted-foreground mb-1.5">chance YES</span>
            </div>
            <div className="price-bar h-3">
              <div className="price-bar-yes" style={{ width: `${yesPercent}%` }} />
            </div>
          </div>

          {isResolved && market.resolved_outcome && (
            <div className={cn(
              'flex flex-col items-center px-4 py-2 rounded-xl text-white',
              market.resolved_outcome === 'yes' ? 'bg-yes' : 'bg-no'
            )}>
              <span className="text-2xl">{market.resolved_outcome === 'yes' ? '✅' : '❌'}</span>
              <span className="text-xs font-bold mt-0.5">
                {market.resolved_outcome.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {market.description}
        </p>

        {/* Footer: creator, dates, actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {market.creator && (
              <span>
                Created by <span className="font-medium text-foreground">
                  {market.creator.display_name || market.creator.username || 'Anonymous'}
                </span>
              </span>
            )}
            <span>•</span>
            <span>
              {isResolved
                ? `Resolved ${formatDistanceToNow(new Date(market.resolved_at!), { addSuffix: true })}`
                : `Closes ${format(new Date(market.closes_at), 'MMM d, yyyy')}`
              }
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
