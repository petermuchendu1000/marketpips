// components/layout/hero-section.tsx
// ------------------------------------------------------------
// Polymarket-style HERO: a live probability-curve dashboard, not a marketing
// splash. The centrepiece is a large multi-line chart (one curve per outcome)
// for a spotlight market — "the data change IS the news". Around it sit the
// market question, current leading probabilities, volume/traders, a Trade CTA,
// and a compact rail of other spotlight markets on the right.
//
// Fully server-rendered (no client hooks) so it adds ~0 first-load JS.
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { ProbLines, LINE_PALETTE } from '@/components/markets/prob-lines'
import type { MarketSeries } from '@/lib/markets/option-series'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { IconArrowRight, IconClock, IconUser, IconTrendUp, CategoryIcon } from '@/components/ui/icons'

export interface HeroMarket {
  market: Market
  series: MarketSeries
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

function fmtVol(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

/** The large spotlight panel — question + big multi-line probability chart. */
function Spotlight({ market, series }: HeroMarket) {
  const cat = CATEGORY_LABELS[market.category] ?? { label: 'Market' }
  const ranked = [...series.lines].sort((a, b) => b.price - a.price)
  const lead = ranked[0]
  const chg = series.changePct

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="group relative block overflow-hidden rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      aria-label={`Spotlight market: ${market.title}`}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        {/* header row */}
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--text-2)' }}>
            <CategoryIcon category={market.category} size={13} />
            {cat.label}
          </span>
          <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full animate-pulse-dot" style={{ background: 'var(--yes)' }} />
              Live
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1"><IconClock size={12} /> {timeLeft(market.closes_at)}</span>
          </span>
        </div>

        {/* question + leading probability */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display font-bold leading-[1.08] tracking-[-0.02em]"
            style={{ fontSize: 'clamp(1.5rem, 3.4vw, 2.4rem)', color: 'var(--text)' }}>
            {market.title}
          </h1>
          {lead && (
            <div className="flex-none text-right">
              <div className="font-mono font-bold leading-none tracking-[-0.02em]"
                style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--text)' }}>
                {Math.round(lead.price * 100)}%
              </div>
              <div className="mt-1 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
                {series.binary ? 'Yes' : lead.label}
              </div>
              {chg !== 0 && (
                <div className="mt-0.5 text-[12px] font-semibold"
                  style={{ color: chg > 0 ? 'var(--yes)' : 'var(--no)' }}>
                  {chg > 0 ? '▲' : '▼'} {Math.abs(chg)} pt
                </div>
              )}
            </div>
          )}
        </div>

        {/* big multi-line probability chart — one curve per outcome */}
        <div className="relative">
          <ProbLines
            lines={series.lines}
            binary={series.binary}
            width={720}
            height={240}
            grid
            fillArea
            strokeWidth={2.25}
            className="h-[180px] w-full sm:h-[240px]"
          />
        </div>

        {/* legend — top outcomes with current probability */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {ranked.slice(0, series.binary ? 1 : 4).map((o, i) => (
            <span key={o.id || o.label} className="flex items-center gap-1.5 text-[13px]">
              <span className="h-2.5 w-2.5 flex-none rounded-[3px]"
                style={{ background: series.binary ? 'var(--yes)' : LINE_PALETTE[i % LINE_PALETTE.length] }} aria-hidden />
              <span className="max-w-[16ch] truncate font-medium" style={{ color: 'var(--text-2)' }}>{o.label}</span>
              <span className="font-mono font-bold tabular-nums" style={{ color: 'var(--text)' }}>{Math.round(o.price * 100)}%</span>
            </span>
          ))}
          {!series.binary && ranked.length > 4 && (
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>+{ranked.length - 4} more</span>
          )}
        </div>

        {/* footer: stats + CTA */}
        <div className="flex items-center justify-between gap-3 pt-1" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="flex items-center gap-4 pt-3 text-[12px]" style={{ color: 'var(--text-3)' }}>
            <span className="flex items-center gap-1.5"><IconTrendUp size={13} /> {fmtVol(market.total_volume_usd)} Vol.</span>
            <span className="flex items-center gap-1.5"><IconUser size={13} /> {market.unique_bettors.toLocaleString()} traders</span>
          </div>
          <span className="btn btn-primary mt-3 gap-1.5">
            Trade <IconArrowRight size={15} />
          </span>
        </div>
      </div>
    </Link>
  )
}

/** A compact spotlight row for the right rail. */
function MiniSpotlight({ market, series }: HeroMarket) {
  const ranked = [...series.lines].sort((a, b) => b.price - a.price)
  const lead = ranked[0]
  return (
    <Link
      href={`/markets/${market.slug}`}
      className="group flex items-center gap-3 rounded-xl p-3 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <EntityAvatar name={market.title} imageUrl={market.cover_image_url} size={38} className="flex-none" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>
          {market.title}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <IconTrendUp size={11} /> {fmtVol(market.total_volume_usd)}
        </div>
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <div className="h-8 w-16">
          <ProbLines lines={series.lines} binary={series.binary} width={64} height={32} strokeWidth={1.75} maxLines={4} />
        </div>
        {lead && (
          <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>
            {Math.round(lead.price * 100)}%
          </span>
        )}
      </div>
    </Link>
  )
}

export function HeroSection({
  spotlight,
  others = [],
}: {
  spotlight?: HeroMarket | null
  others?: HeroMarket[]
}) {
  if (!spotlight) return null

  return (
    <section className="relative">
      <div className="relative mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-9">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <Spotlight {...spotlight} />

          {others.length > 0 && (
            <aside className="flex flex-col gap-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-3)' }}>
                Also moving now
              </h2>
              <div className="flex flex-col gap-3">
                {others.map((o) => (
                  <MiniSpotlight key={o.market.id} {...o} />
                ))}
              </div>
              <Link href="/markets" className="btn btn-secondary mt-auto w-full justify-center gap-1.5">
                Browse all markets <IconArrowRight size={15} />
              </Link>
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}
