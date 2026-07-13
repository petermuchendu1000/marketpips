// components/layout/hero-section.tsx
// ------------------------------------------------------------
// MarketPips homepage HERO — a Polymarket-faithful "featured markets" carousel,
// themed to the Pip design system (see docs/design/HERO-POLYMARKET-ANALYSIS.md).
//
// Each carousel slide is a spotlight market rendered as a live dashboard:
//   ┌───────────────────────────────────────────────────────────┐
//   │ [category]                                   [share][save] │
//   │  Ranked outcomes            │  legend chips                │
//   │  (avatar · name · %)        │  ┌────────── multi-line ────┐ │
//   │  …up to 4                   │  │ probability chart w/ dates│ │
//   │  latest comment             │  └───────────────────────────┘│
//   │  ── $ Vol ─────────────────────── Ends <date> · MarketPips ─│
//   └───────────────────────────────────────────────────────────┘
// Beside the carousel sits a static rail: two product promos, a live
// "Hot topics" leaderboard, and an "Explore all" pill.
//
// The slides + rail are fully server-rendered (0 chart JS); only the thin
// carousel controller and the share/save buttons are client components.
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { ProbLines, LINE_PALETTE } from '@/components/markets/prob-lines'
import type { MarketSeries } from '@/lib/markets/option-series'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { HeroCarousel } from '@/components/layout/hero-carousel'
import { MarketCardActions } from '@/components/markets/market-card-actions'
import {
  IconArrowRight, IconClock, IconUsers, IconTrendUp, IconFire, IconComments,
  IconMpesa, IconTrophy, IconChevronRight, CategoryIcon,
} from '@/components/ui/icons'

export interface HeroMarket {
  market: Market
  series: MarketSeries
}

export interface HeroComment {
  id: string
  author: string
  content: string
  likes: number
}

/* ----------------------------- helpers ----------------------------- */

function timeLeft(closes: string | null) {
  if (!closes) return null
  const ms = new Date(closes).getTime() - Date.now()
  if (ms < 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  if (d > 30) return `${Math.round(d / 30)}mo left`
  if (d > 0) return `${d}d left`
  const h = Math.floor((ms % 86400000) / 3600000)
  if (h > 0) return `${h}h left`
  return `${Math.floor((ms % 3600000) / 60000)}m left`
}

function fmtVol(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Three evenly spaced date ticks (short) across the recorded window. */
function dateTicks(startAt: string | null, endAt: string | null): string[] | undefined {
  if (!startAt || !endAt) return undefined
  const s = new Date(startAt).getTime()
  const e = new Date(endAt).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return undefined
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return [s, s + (e - s) / 2, e].map(fmt)
}

/* --------------------------- spotlight card --------------------------- */

function Spotlight({ market, series, comments }: HeroMarket & { comments?: HeroComment[] }) {
  const cat = CATEGORY_LABELS[market.category] ?? { label: 'Market' }
  const ranked = [...series.lines].sort((a, b) => b.price - a.price)
  const yesPct = Math.round((market.yes_price ?? 0) * 100)
  const ticks = dateTicks(series.startAt, series.endAt)
  const tl = timeLeft(market.closes_at)

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--e1)' }}
    >
      {/* full-bleed overlay link — inner controls opt back in via z-index */}
      <Link
        href={`/markets/${market.slug}`}
        className="absolute inset-0 z-0"
        aria-label={`Open market: ${market.title}`}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-4 p-5 sm:p-6">
        {/* header: breadcrumb + live · time · actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--text-2)' }}>
              <CategoryIcon category={market.category} size={13} />
              {cat.label}
            </span>
            <span className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--text-3)' }}>
              <span className="h-[7px] w-[7px] rounded-full animate-pulse-dot" style={{ background: 'var(--yes)' }} />
              Live
            </span>
            {tl && (
              <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-3)' }}>
                <IconClock size={12} /> {tl}
              </span>
            )}
          </div>
          <MarketCardActions slug={market.slug} title={market.title} />
        </div>

        {/* title */}
        <h1 className="font-display font-semibold tracking-[-0.01em]"
          style={{ fontSize: 'clamp(1.25rem, 2vw, 1.6rem)', lineHeight: 1.15, color: 'var(--text)' }}>
          {market.title}
        </h1>

        {/* two columns: ranked outcomes | chart */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,0.95fr)_1.25fr]">
          {/* outcomes */}
          <div className="flex flex-col gap-1">
            {series.binary ? (
              <BinaryRows yesPct={yesPct} />
            ) : (
              ranked.slice(0, 4).map((o) => (
                <div key={o.id || o.label} className="flex items-center gap-2.5 py-1.5">
                  <EntityAvatar name={o.label} imageUrl={o.imageUrl} size={28} shape="circle" className="flex-none" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
                    {o.label}
                  </span>
                  <span className="font-mono text-[18px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: 'var(--text)' }}>
                    {Math.round(o.price * 100)}%
                  </span>
                </div>
              ))
            )}
            {!series.binary && ranked.length > 4 && (
              <span className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
                +{ranked.length - 4} more outcomes
              </span>
            )}

            {/* comment peek */}
            {comments && comments.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
                {comments.slice(0, 2).map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <EntityAvatar name={c.author} size={20} shape="circle" className="mt-0.5 flex-none" />
                    <p className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--text-3)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{c.author}</span>{' '}
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* chart + legend */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {(series.binary ? ranked.slice(0, 1) : ranked.slice(0, 4)).map((o, i) => (
                <span key={o.id || o.label} className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
                  <span className="h-2 w-2 flex-none rounded-full"
                    style={{ background: series.binary ? 'var(--yes)' : LINE_PALETTE[i % LINE_PALETTE.length] }} aria-hidden />
                  <span className="font-medium" style={{ color: 'var(--text-3)' }}>{series.binary ? 'Yes' : o.label}</span>
                  <span className="font-mono font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                    {(o.price * 100).toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
            <ProbLines
              lines={series.lines}
              binary={series.binary}
              width={540}
              height={230}
              grid
              autoDomain
              axis="right"
              fillArea={series.binary}
              xLabels={ticks}
              strokeWidth={2.25}
              className="h-[190px] w-full sm:h-[220px]"
            />
          </div>
        </div>

        {/* footer: volume + close date */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-[12px]"
          style={{ borderColor: 'var(--hairline)', color: 'var(--text-3)' }}>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono font-semibold" style={{ color: 'var(--text-2)' }}>
              <IconTrendUp size={13} /> {fmtVol(market.total_volume_usd ?? 0)} Vol
            </span>
            <span className="flex items-center gap-1.5">
              <IconUsers size={13} /> {(market.unique_bettors ?? 0).toLocaleString()}
            </span>
            {(market.comment_count ?? 0) > 0 && (
              <span className="hidden items-center gap-1.5 xs:flex">
                <IconComments size={13} /> {market.comment_count}
              </span>
            )}
          </span>
          {market.closes_at && (
            <span className="truncate">Ends {fmtDate(market.closes_at)} · MarketPips</span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Yes/No rows for a binary market. */
function BinaryRows({ yesPct }: { yesPct: number }) {
  const rows = [
    { label: 'Yes', pct: yesPct, color: 'var(--yes)', text: 'var(--yes-700)' },
    { label: 'No', pct: 100 - yesPct, color: 'var(--no)', text: 'var(--no-700)' },
  ]
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2.5 py-2">
          <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: r.color }} aria-hidden />
          <span className="min-w-0 flex-1 text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{r.label}</span>
          <span className="font-mono text-[18px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: r.text }}>
            {r.pct}%
          </span>
        </div>
      ))}
    </>
  )
}

/* ------------------------------- rail ------------------------------- */

function PromoCard({
  icon, title, body, cta, href, tint,
}: { icon: React.ReactNode; title: string; body: string; cta: string; href: string; tint: 'pip' | 'brass' }) {
  const bg = tint === 'pip'
    ? 'linear-gradient(135deg, var(--pip-100), var(--surface) 78%)'
    : 'linear-gradient(135deg, var(--brass-100), var(--surface) 78%)'
  const fg = tint === 'pip' ? 'var(--pip-text)' : 'var(--brass-600)'
  return (
    <div className="relative flex items-center gap-3 rounded-xl p-4"
      style={{ background: bg, border: '1px solid var(--hairline)' }}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg"
        style={{ background: 'var(--surface)', color: fg, border: '1px solid var(--hairline)' }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--text-2)' }}>{body}</p>
      </div>
      <Link href={href} className="btn btn-secondary btn-sm flex-none whitespace-nowrap">{cta}</Link>
    </div>
  )
}

function HotTopics({ topics }: { topics: Market[] }) {
  if (topics.length === 0) return null
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Hot topics</h3>
        <Link href="/markets?sort=volume" className="flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: 'var(--pip-text)' }}>
          See all <IconChevronRight size={12} />
        </Link>
      </div>
      <ol className="flex flex-col">
        {topics.slice(0, 5).map((m, i) => (
          <li key={m.id}>
            <Link href={`/markets/${m.slug}`}
              className="group -mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-[var(--surface-2)]">
              <span className="w-4 flex-none text-center font-mono text-[12px] font-semibold" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>{m.title}</span>
              <span className="flex flex-none items-center gap-1 font-mono text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
                {fmtVol(m.volume_24h_usd ?? 0)}
                <IconFire size={13} style={{ color: 'var(--warn)' }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

function HeroRail({ hotTopics }: { hotTopics: Market[] }) {
  return (
    <aside className="flex flex-col gap-3">
      <PromoCard
        tint="pip"
        icon={<IconMpesa size={20} />}
        title="Fund in seconds"
        body="Deposit and cash out instantly with M-Pesa, MTN MoMo and Airtel Money."
        cta="How it works"
        href="/#how-it-works"
      />
      <PromoCard
        tint="brass"
        icon={<IconTrophy size={20} />}
        title="New to MarketPips?"
        body="Create a free account and place your first prediction in under a minute."
        cta="Get started"
        href="/auth/register"
      />
      <HotTopics topics={hotTopics} />
      <Link href="/markets" className="btn btn-secondary w-full justify-center gap-1.5" style={{ borderRadius: 'var(--r-pill)' }}>
        Explore all markets <IconArrowRight size={15} />
      </Link>
    </aside>
  )
}

/* ------------------------------ section ------------------------------ */

export function HeroSection({
  items = [],
  hotTopics = [],
  comments = {},
}: {
  items?: HeroMarket[]
  hotTopics?: Market[]
  comments?: Record<string, HeroComment[]>
}) {
  if (items.length === 0) return null

  const slides = items.map((it) => (
    <Spotlight key={it.market.id} market={it.market} series={it.series} comments={comments[it.market.id]} />
  ))
  const titles = items.map((it) => it.market.title)

  return (
    <section className="relative">
      <div className="relative mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <HeroCarousel slides={slides} titles={titles} />
          <HeroRail hotTopics={hotTopics} />
        </div>
      </div>
    </section>
  )
}
