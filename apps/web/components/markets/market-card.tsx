'use client'

// components/markets/market-card.tsx
// ------------------------------------------------------------
// The canonical market card (Polymarket-style). Three shapes, one component:
//
//   • multiple_choice → candidate ROWS: "<avatar> Label   NN%   [Yes] [No]".
//   • binary          → a semicircular probability GAUGE + two big buttons.
//   • up/down (crypto)→ the binary shape with Up/Down labels + a LIVE badge
//                       (metadata.card_kind === 'up_down'; see the BTC engine).
//
// Interaction model (matches Polymarket): the whole card is a link to the
// market detail page via a full-bleed overlay <Link>; the Yes/No/Up/Down
// controls sit above it and deep-link to the SAME detail page with the betting
// ticket pre-armed to that side (and candidate) via ?side=&option=. Nested
// anchors are invalid, so content is pointer-events-none and only the controls
// opt back in with pointer-events-auto.
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { splitHighlight } from '@/lib/search'
import {
  IconClock, IconUser, IconTrendUp, IconArrowUp, IconArrowDown,
  IconBookmark, CategoryIcon,
} from '@/components/ui/icons'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import type { CardOption } from '@/lib/markets/card-options'

/** @deprecated superseded by `options`; kept so older callers still compile. */
export interface CardLeadingOption {
  label: string
  price: number
}

interface MarketCardProps {
  market: Market
  compact?: boolean
  /** When set, matching query tokens in the title are highlighted (search UI). */
  query?: string
  /** multiple_choice: the top candidates (highest probability first). */
  options?: CardOption[]
  /** Total option count (drives the "+N more" affordance). */
  optionCount?: number
  /** @deprecated single front-runner fallback when `options` isn't supplied. */
  leadingOption?: CardLeadingOption
}

/** Render a title, highlighting query-token matches with a brand-tinted mark. */
function TitleContent({ title, query }: { title: string; query?: string }) {
  if (!query) return <>{title}</>
  return (
    <>
      {splitHighlight(title, query).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="rounded-[3px] px-0.5" style={{ background: 'var(--pip-100)', color: 'inherit' }}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

function timeLeft(closes: string) {
  const ms = new Date(closes).getTime() - Date.now()
  if (ms < 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60000) / 1000)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Semicircular probability gauge (binary / up-down header). */
function ProbGauge({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const R = 26
  const semi = Math.PI * R
  const dash = (clamped / 100) * semi
  return (
    <div className="relative flex-none" style={{ width: 66, height: 40 }} aria-hidden>
      <svg width="66" height="36" viewBox="0 0 66 36" fill="none">
        <path d="M7 31 A26 26 0 0 1 59 31" stroke="var(--hairline)" strokeWidth={6} strokeLinecap="round" />
        <path
          d="M7 31 A26 26 0 0 1 59 31"
          stroke="var(--yes)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${semi}`}
        />
      </svg>
      <div className="absolute inset-x-0 top-[11px] text-center leading-none">
        <div className="font-mono text-[15px] font-bold" style={{ color: 'var(--text)' }}>{clamped}%</div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
      </div>
    </div>
  )
}

export function MarketCard({
  market,
  compact = false,
  query,
  options,
  optionCount,
  leadingOption,
}: MarketCardProps) {
  const cat = CATEGORY_LABELS[market.category] ?? { emoji: '', label: 'Other', color: '' }
  const yesPct = Math.round(market.yes_price * 100)
  const isMulti = market.resolution_type === 'multiple_choice'

  // up/down crypto windows carry card_kind + a Up/Down label pair in metadata.
  const meta = (market.metadata ?? {}) as Record<string, unknown>
  const isUpDown = meta.card_kind === 'up_down'
  const yesLabel = isUpDown ? String(meta.yes_label ?? 'Up') : 'Yes'
  const noLabel = isUpDown ? String(meta.no_label ?? 'Down') : 'No'
  const isLive = isUpDown && market.status === 'active'

  const detailHref = `/markets/${market.slug}`
  const sideHref = (side: 'yes' | 'no', optionId?: string) =>
    `${detailHref}?side=${side}${optionId ? `&option=${optionId}` : ''}`

  // Candidate rows for multi markets (top options, with a single-option fallback).
  const rows: CardOption[] =
    options && options.length > 0
      ? options
      : leadingOption
        ? [{ id: '', label: leadingOption.label, price: leadingOption.price, imageUrl: null }]
        : []
  const moreCount = (optionCount ?? rows.length) - rows.length

  const avatarSize = compact ? 26 : 34

  return (
    <div className="market-card group relative flex flex-col gap-3" data-kind={isUpDown ? 'up-down' : market.resolution_type}>
      {/* Full-bleed overlay: click anywhere (outside the controls) → detail. */}
      <Link href={detailHref} className="absolute inset-0 z-0 rounded-[inherit]" aria-label={market.title} />

      {/* Header: avatar + title, with a gauge on binary/up-down markets. */}
      <div className="pointer-events-none relative z-10 flex items-start gap-2.5">
        {!isUpDown && (
          <EntityAvatar name={market.title} imageUrl={market.cover_image_url} size={avatarSize} className="mt-0.5" />
        )}
        {isUpDown && (
          <span
            className="mt-0.5 flex flex-none items-center justify-center rounded-md font-bold text-white"
            style={{ width: avatarSize, height: avatarSize, background: '#F7931A', fontSize: avatarSize * 0.5 }}
            aria-hidden
          >
            ₿
          </span>
        )}
        <h3
          className={`min-w-0 flex-1 font-semibold leading-snug ${compact ? 'text-sm line-clamp-2' : 'text-[15px] line-clamp-2'}`}
          style={{ color: 'var(--text-primary)' }}
        >
          <TitleContent title={market.title} query={query} />
        </h3>
        {!isMulti && <ProbGauge pct={yesPct} label={yesLabel} />}
      </div>

      {/* Body */}
      {isMulti ? (
        <div className="relative z-10 flex flex-col">
          {rows.map((o, i) => {
            const pct = Math.round(o.price * 100)
            return (
              <div
                key={o.id || `${o.label}-${i}`}
                className="flex items-center gap-2.5 py-2"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}
              >
                <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-2">
                  <EntityAvatar name={o.label} imageUrl={o.imageUrl} size={22} shape="circle" />
                  <span className="truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>{o.label}</span>
                </span>
                <span className="pointer-events-none font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                  {pct}%
                </span>
                <span className="flex flex-none gap-1.5">
                  <Link
                    href={sideHref('yes', o.id || undefined)}
                    className="btn btn-yes btn-sm pointer-events-auto px-3"
                    aria-label={`Buy Yes on ${o.label}`}
                  >
                    {yesLabel}
                  </Link>
                  <Link
                    href={sideHref('no', o.id || undefined)}
                    className="btn btn-no btn-sm pointer-events-auto px-3"
                    aria-label={`Buy No on ${o.label}`}
                  >
                    {noLabel}
                  </Link>
                </span>
              </div>
            )
          })}
          {moreCount > 0 && (
            <div className="pointer-events-none pt-1.5 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
              +{moreCount} more {moreCount === 1 ? 'option' : 'options'}
            </div>
          )}
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-2 gap-2">
          <Link
            href={sideHref('yes')}
            className="btn btn-yes pointer-events-auto w-full justify-center gap-1.5 py-3 text-sm"
            aria-label={`Buy ${yesLabel}`}
          >
            {isUpDown && <IconArrowUp size={16} />} {yesLabel}
          </Link>
          <Link
            href={sideHref('no')}
            className="btn btn-no pointer-events-auto w-full justify-center gap-1.5 py-3 text-sm"
            aria-label={`Buy ${noLabel}`}
          >
            {isUpDown && <IconArrowDown size={16} />} {noLabel}
          </Link>
        </div>
      )}

      {/* Footer: LIVE/vol/time on the left, bettors + bookmark on the right. */}
      <div
        className="pointer-events-none relative z-10 mt-auto flex items-center justify-between pt-1"
        style={{ borderTop: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-2 pt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {isLive ? (
            <>
              <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--no)' }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--no)' }} />
                LIVE
              </span>
              <span aria-hidden>·</span>
              <span>{timeLeft(market.closes_at)} left</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <IconTrendUp size={11} />
                ${market.total_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} Vol.
              </span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <IconClock size={11} />
                {timeLeft(market.closes_at)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2.5 pt-2" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1 text-[11px]">
            <IconUser size={11} />
            {market.unique_bettors.toLocaleString()}
          </span>
          <IconBookmark size={14} />
        </div>
      </div>
    </div>
  )
}

// Skeleton loader — matches the card's header + body + footer rhythm so the
// grid reserves the right height (no CLS when real cards swap in).
export function MarketCardSkeleton() {
  return (
    <div className="market-card flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="skeleton h-8 w-8 flex-none rounded-md" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="skeleton h-11 rounded-lg" />
        <div className="skeleton h-11 rounded-lg" />
      </div>
      <div className="flex justify-between pt-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  )
}
