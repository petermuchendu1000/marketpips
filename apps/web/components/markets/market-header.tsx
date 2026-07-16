'use client'

// components/markets/market-header.tsx
// Market detail identity strip — Polymarket-parity layout on the "Pip" system:
// square entity avatar · category breadcrumb · title · action cluster
// (copy-link / share / bookmark). Custom icons only (no lucide), no emoji.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { Market, MarketStatus } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import type { Outcome } from '@/lib/markets/outcomes'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { CategoryIcon, IconShare, IconLink, IconBookmark } from '@/components/ui/icons'

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
  const [saved, setSaved] = useState(false)

  // Bookmark is a client-side preference (localStorage) — mirrors Polymarket's
  // instant, no-auth-required save affordance.
  useEffect(() => {
    try {
      const set = JSON.parse(localStorage.getItem('mp:saved') || '[]') as string[]
      setSaved(set.includes(market.id))
    } catch {
      /* private mode / disabled storage — leave unsaved */
    }
  }, [market.id])

  const marketUrl = () => `${window.location.origin}/markets/${market.slug}`

  const handleShare = async () => {
    const url = marketUrl()
    try {
      if (navigator.share) await navigator.share({ title: market.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch {
      /* user dismissed share sheet — no-op */
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(marketUrl())
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const toggleSave = () => {
    try {
      const set = new Set(JSON.parse(localStorage.getItem('mp:saved') || '[]') as string[])
      if (set.has(market.id)) {
        set.delete(market.id)
        setSaved(false)
        toast.success('Removed from saved')
      } else {
        set.add(market.id)
        setSaved(true)
        toast.success('Saved')
      }
      localStorage.setItem('mp:saved', JSON.stringify([...set]))
    } catch {
      toast.error('Could not update saved markets')
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-start gap-4">
        <EntityAvatar
          name={market.title}
          imageUrl={market.cover_image_url}
          size={56}
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          {/* Breadcrumb row (Polymarket: "Economy · Fomc") + action cluster.
              The copy-link / share / bookmark icons live on THIS row — not next
              to the title — so on a phone the title uses the full column width
              and never has to wrap around the icons. */}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
              <CategoryIcon category={market.category} size={13} />
              <span className="truncate">{category.label}</span>
              {market.tags[0] && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span className="truncate capitalize">{market.tags[0]}</span>
                </>
              )}
            </div>

            {/* Action cluster — copy-link · share · bookmark */}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="Copy link"
                title="Copy link"
                className="btn btn-ghost btn-icon-sm"
              >
                <IconLink size={16} />
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                title="Share"
                className="btn btn-ghost btn-icon-sm"
              >
                <IconShare size={16} />
              </button>
              <button
                type="button"
                onClick={toggleSave}
                aria-label={saved ? 'Remove from saved' : 'Save market'}
                aria-pressed={saved}
                title={saved ? 'Saved' : 'Save'}
                className={`btn btn-ghost btn-icon-sm ${saved ? 'text-pip-500' : ''}`}
              >
                <IconBookmark size={16} />
              </button>
            </div>
          </div>

          <h1 className="font-display text-xl leading-tight text-text-primary sm:text-2xl">
            {market.title}
          </h1>

          {/* Status + compact live probability (binary) / resolved outcome */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`badge ${badge.className}`}>{badge.label}</span>
            {market.is_trending && <span className="badge badge-amber">Trending</span>}

            {!showMulti && !isResolved && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold text-yes">{yesPercent}%</span>
                <span className="text-xs text-text-muted">chance</span>
              </span>
            )}

            {isResolved && market.resolved_outcome && (
              <span
                className={`badge ${market.resolved_outcome === 'yes' ? 'badge-green' : 'badge-red'}`}
              >
                Resolved: {market.resolved_outcome.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* NOTE: the market description + provenance/resolution-source ("market
          info") used to live here, directly under the title. It pushed the
          actionable options (candidate board / order ticket) down and hurt
          conversion. Per Polymarket/Kalshi — where the identity strip stays
          tight and background lives in a lower "context" panel — that content
          now renders inside the MarketRules "Market context" tab instead. */}
    </section>
  )
}
