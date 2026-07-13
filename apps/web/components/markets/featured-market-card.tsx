// components/markets/featured-market-card.tsx
// ------------------------------------------------------------
// The larger "hero shelf" card used in the Featured row on the landing page.
// It layers a probability sparkline (real price_history) under the market's
// headline stat, then the outcome controls, then a volume + close-date footer.
// Server component (no client hooks) so it costs no first-load JS beyond the
// shared card chrome. Interaction model matches MarketCard: a full-bleed
// overlay link to the detail page, with Yes/No/option controls opting back in.
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { CategoryIcon, IconTrendUp, IconArrowDown } from '@/components/ui/icons'
import { ProbSparkline } from '@/components/markets/prob-sparkline'
import { ProbLines } from '@/components/markets/prob-lines'
import type { CardOption } from '@/lib/markets/card-options'
import type { PriceSeries } from '@/lib/markets/price-history'
import type { MarketSeries } from '@/lib/markets/option-series'

interface FeaturedMarketCardProps {
  market: Market
  series?: PriceSeries
  /** Per-option probability series → one chart line per outcome. */
  optionSeries?: MarketSeries
  options?: CardOption[]
  optionCount?: number
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function FeaturedMarketCard({ market, series, optionSeries, options, optionCount }: FeaturedMarketCardProps) {
  const cat = CATEGORY_LABELS[market.category] ?? { label: 'Other' }
  const yesPct = Math.round(market.yes_price * 100)
  const isMulti = market.resolution_type === 'multiple_choice'
  const meta = (market.metadata ?? {}) as Record<string, unknown>
  const isUpDown = meta.card_kind === 'up_down'
  const yesLabel = isUpDown ? String(meta.yes_label ?? 'Up') : 'Yes'
  const noLabel = isUpDown ? String(meta.no_label ?? 'No') : 'No'

  const detailHref = `/markets/${market.slug}`
  const sideHref = (side: 'yes' | 'no', optionId?: string) =>
    `${detailHref}?side=${side}${optionId ? `&option=${optionId}` : ''}`

  const rows = (options ?? []).slice(0, 4)
  const moreCount = (optionCount ?? rows.length) - rows.length
  // Prefer the per-option series for the delta + chart; fall back to the
  // single Yes-line series when only that is available.
  const change = optionSeries?.changePct ?? series?.changePct ?? 0
  const up = change >= 0
  // Show the multi-line chart when we have per-option curves worth drawing:
  // any real recorded history, or a multi-outcome market (flat lines still
  // convey how many outcomes there are and their current levels).
  const showLines = !!optionSeries && (!optionSeries.seeded || optionSeries.lines.length > 1)

  return (
    <div className="market-card group relative flex flex-col gap-3.5">
      <Link href={detailHref} className="absolute inset-0 z-0 rounded-[inherit]" aria-label={market.title} />

      {/* Eyebrow: category + trend delta */}
      <div className="pointer-events-none relative z-10 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-3)' }}>
          <CategoryIcon category={market.category} size={13} />
          {cat.label}
        </span>
        {(showLines || (series && series.points.length > 1)) && (
          <span
            className="inline-flex items-center gap-1 font-mono text-[12px] font-bold tabular-nums"
            style={{ color: up ? 'var(--yes-700)' : 'var(--no-700)' }}
          >
            {up ? <IconTrendUp size={13} /> : <IconArrowDown size={13} />}
            {up ? '+' : ''}{change}pt
          </span>
        )}
      </div>

      {/* Title + avatar */}
      <div className="pointer-events-none relative z-10 flex items-start gap-3">
        <EntityAvatar name={market.title} imageUrl={market.cover_image_url} size={40} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-[16px]" style={{ color: 'var(--text)' }}>{market.title}</h3>
        </div>
        {!isMulti && (
          <div className="flex-none text-right leading-none">
            <div className="font-mono text-[22px] font-bold" style={{ color: 'var(--text)' }}>{yesPct}%</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{yesLabel}</div>
          </div>
        )}
      </div>

      {/* Probability chart — one line per outcome (multi) or a single tinted
          Yes curve (binary). Falls back to the legacy sparkline if only the
          single-series data is present. */}
      {showLines ? (
        <div className="pointer-events-none relative z-10 -mx-1">
          <ProbLines
            lines={optionSeries!.lines}
            binary={optionSeries!.binary}
            width={320}
            height={56}
            fillArea={optionSeries!.binary}
            strokeWidth={2}
            className="h-14 w-full"
          />
        </div>
      ) : (
        series && series.points.length > 1 && (
          <div className="pointer-events-none relative z-10 -mx-1">
            <ProbSparkline points={series.points} width={320} height={56} className="w-full h-14" />
          </div>
        )
      )}

      {/* Body: outcomes */}
      {isMulti && rows.length > 0 ? (
        <div className="relative z-10 flex flex-col">
          {rows.map((o, i) => {
            const pct = Math.round(o.price * 100)
            return (
              <div key={o.id || `${o.label}-${i}`} className="flex items-center gap-2.5 py-2"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
                <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-2">
                  <EntityAvatar name={o.label} imageUrl={o.imageUrl} size={22} shape="circle" />
                  <span className="truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>{o.label}</span>
                </span>
                <span className="pointer-events-none font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{pct}%</span>
                <span className="flex flex-none gap-1.5">
                  <Link href={sideHref('yes', o.id || undefined)} className="btn btn-yes btn-sm pointer-events-auto px-3" aria-label={`Buy Yes on ${o.label}`}>Yes</Link>
                  <Link href={sideHref('no', o.id || undefined)} className="btn btn-no btn-sm pointer-events-auto px-3" aria-label={`Buy No on ${o.label}`}>No</Link>
                </span>
              </div>
            )
          })}
          {moreCount > 0 && (
            <div className="pt-2 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>+{moreCount} more outcomes</div>
          )}
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-2 gap-2">
          <Link href={sideHref('yes')} className="btn btn-yes pointer-events-auto" aria-label={`Buy ${yesLabel}`}>{yesLabel} {yesPct}¢</Link>
          <Link href={sideHref('no')} className="btn btn-no pointer-events-auto" aria-label={`Buy ${noLabel}`}>{noLabel} {100 - yesPct}¢</Link>
        </div>
      )}

      {/* Footer: volume + close date */}
      <div className="pointer-events-none relative z-10 flex items-center justify-between pt-1 text-[12px]" style={{ color: 'var(--text-3)' }}>
        <span className="font-mono font-semibold">{fmtCompact(market.total_volume_usd ?? 0)} Vol</span>
        {market.closes_at && <span>Ends {fmtDate(market.closes_at)}</span>}
      </div>
    </div>
  )
}
