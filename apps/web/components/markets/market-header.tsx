'use client'

// components/markets/market-header.tsx
// Market detail hero: identity, live probability and provenance. Pure "Pip"
// system — custom icons only (no lucide), no emoji, design tokens throughout.
import Image from 'next/image'
import { formatDistanceToNow, format } from 'date-fns'
import toast from 'react-hot-toast'
import type { Market, MarketStatus } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import type { Outcome } from '@/lib/markets/outcomes'
import { CategoryIcon, IconShare, IconExternalLink } from '@/components/ui/icons'

interface MarketHeaderProps {
  market: Market
  /** Canonical outcome list (binary → [Yes,No], multi → options by rank). */
  outcomes?: Outcome[]
  /** True for multiple_choice markets. */
  isMulti?: boolean
}

/** Market state-machine badge mapping (single source of visual truth). */
const STATUS_BADGE: Record<MarketStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'badge-muted' },
  pending: { label: 'Pending review', className: 'badge-amber' },
  active: { label: 'Open', className: 'badge-green' },
  closed: { label: 'Awaiting resolution', className: 'badge-amber' },
  resolved: { label: 'Resolved', className: 'badge-muted' },
  disputed: { label: 'Disputed', className: 'badge-red' },
  cancelled: { label: 'Cancelled', className: 'badge-muted' },
}

export function MarketHeader({ market, outcomes, isMulti }: MarketHeaderProps) {
  const category = CATEGORY_LABELS[market.category]
  const yesPercent = Math.round(market.yes_price * 100)
  const isResolved = market.status === 'resolved'
  const badge = STATUS_BADGE[market.status]
  const showMulti = !!isMulti && !!outcomes && outcomes.length > 0

  const handleShare = async () => {
    const url = `${window.location.origin}/markets/${market.slug}`
    try {
      if (navigator.share) {
        await navigator.share({ title: market.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch {
      /* user dismissed share sheet — no-op */
    }
  }

  return (
    <section className="card overflow-hidden">
      {market.cover_image_url && (
        <div className="relative h-40 w-full">
          <Image src={market.cover_image_url} alt="" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
        </div>
      )}

      <div className="p-5">
        {/* Category + status + tags */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="badge badge-muted gap-1.5">
            <CategoryIcon category={market.category} size={13} />
            {category.label}
          </span>
          <span className={`badge ${badge.className}`}>{badge.label}</span>
          {market.is_trending && <span className="badge badge-amber">Trending</span>}
          {market.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs text-text-muted">
              #{tag}
            </span>
          ))}
        </div>

        <h1 className="font-display text-xl leading-snug text-text-primary">{market.title}</h1>

        {/* Live probability — ranked options for multiple choice, YES gauge for binary */}
        {/* Binary markets show the YES gauge here. Multiple-choice markets show
            nothing — the candidate board directly below is the single, canonical
            place options + probabilities live (no duplicated header breakdown). */}
        {!showMulti && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1.5 flex items-end gap-2">
                <span
                  className={`font-mono text-4xl font-bold ${
                    isResolved && market.resolved_outcome !== 'yes' ? 'text-text-muted' : 'text-yes'
                  }`}
                >
                  {yesPercent}%
                </span>
                <span className="mb-1.5 text-sm text-text-muted">chance YES</span>
              </div>
            </div>

            {isResolved && market.resolved_outcome && (
              <div
                className={`flex flex-col items-center rounded-md px-4 py-2 text-white ${
                  market.resolved_outcome === 'yes' ? 'bg-yes' : 'bg-no'
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide opacity-90">Resolved</span>
                <span className="font-display text-lg leading-tight">{market.resolved_outcome.toUpperCase()}</span>
              </div>
            )}
          </div>
        )}

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
          {market.description}
        </p>

        {/* Provenance + actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {market.creator && (
              <>
                <span>
                  by{' '}
                  <span className="font-medium text-text-secondary">
                    {market.creator.display_name || market.creator.username || 'Anonymous'}
                  </span>
                </span>
                <span aria-hidden>&middot;</span>
              </>
            )}
            <span>
              {isResolved && market.resolved_at
                ? `Resolved ${formatDistanceToNow(new Date(market.resolved_at), { addSuffix: true })}`
                : `Closes ${format(new Date(market.closes_at), 'MMM d, yyyy')}`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {market.resolution_source && (
              <a
                href={market.resolution_source}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm gap-1.5"
              >
                <IconExternalLink size={13} /> Source
              </a>
            )}
            <button type="button" onClick={handleShare} className="btn btn-ghost btn-sm gap-1.5">
              <IconShare size={13} /> Share
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
