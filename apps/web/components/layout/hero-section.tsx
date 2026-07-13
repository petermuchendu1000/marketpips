// components/layout/hero-section.tsx
// ------------------------------------------------------------
// MarketPips homepage HERO — a faithful reproduction of Polymarket's "Featured
// markets" carousel, measured live and specced in
// docs/design/HERO-POLYMARKET-GROUNDTRUTH.md. Element-by-element parity:
//
//   ┌───────────────────────────────────────────────────────────────┐
//   │ [56px icon]  Category · Sub               [share] [bookmark]    │
//   │              Bold 24/600 title                                  │
//   │  ┌── ranked outcomes (346) ──┐  ┌──── chart block (495) ─────┐  │
//   │  │ [avatar] name ……… 39%     │  │ ● legend chips              │ │
//   │  │ ───────── divider ─────── │  │ ┌── stepped multi-line ───┐ │ │
//   │  │ …up to 4 rows             │  │ │  right % axis, dated x  │ │ │
//   │  │ comment peek              │  │ └─────────────────────────┘ │ │
//   │  └───────────────────────────┘  └─────────────────────────────┘ │
//   │  ── $X Vol ───────────────────── Ends <date> · MarketPips ──────│
//   └───────────────────────────────────────────────────────────────┘
//
// Beside the carousel sits a static rail (promo · Breaking News · Hot topics).
// Slides + rail are server-rendered (0 chart JS); only the thin carousel
// controller and the share/save buttons are client components.
import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { ProbLines, LINE_PALETTE } from '@/components/markets/prob-lines'
import type { MarketSeries } from '@/lib/markets/option-series'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { HeroCarousel } from '@/components/layout/hero-carousel'
import { MarketCardActions } from '@/components/markets/market-card-actions'
import {
  IconArrowRight, IconFire, IconChevronRight, IconArrowUp, IconArrowDown,
  IconMpesa,
} from '@/components/ui/icons'

export interface BreakingItem {
  market: Market
  /** Signed 24h/window change in percentage points. */
  change: number
  /** Current leading probability, 0–100. */
  pct: number
}

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

function fmtVol(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Title-case a raw tag into a breadcrumb sub-label. */
function prettyTag(t?: string | null) {
  if (!t) return null
  return t.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Three evenly spaced date ticks (short) across the recorded window. */
function dateTicks(startAt: string | null, endAt: string | null): string[] | undefined {
  if (!startAt || !endAt) return undefined
  const s = new Date(startAt).getTime()
  const e = new Date(endAt).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return undefined
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return [s, s + (e - s) / 3, s + (2 * (e - s)) / 3, e].map(fmt)
}

/* --------------------------- spotlight card --------------------------- */

function Spotlight({ market, series, comments }: HeroMarket & { comments?: HeroComment[] }) {
  const cat = CATEGORY_LABELS[market.category] ?? { label: 'Market', emoji: '🔮' }
  const sub = prettyTag(market.tags?.[0])
  const ranked = [...series.lines].sort((a, b) => b.price - a.price)
  const yesPct = Math.round((market.yes_price ?? 0) * 100)
  const ticks = dateTicks(series.startAt, series.endAt)

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden"
      style={{
        background: 'var(--surface)',
        // Polymarket parity (live-measured): blue-tinted hairline + blue-500/7 shadow.
        border: '1px solid rgba(37,99,235,0.10)', // blue-600/10
        borderRadius: 18,
        boxShadow: '0 4px 16px 0 rgba(59,130,246,0.07)', // blue-500/7
        minHeight: 'min(480px, 60vh)',
        maxHeight: 500,
      }}
    >
      {/* full-bleed overlay link — inner controls opt back in via z-index */}
      <Link href={`/markets/${market.slug}`} className="absolute inset-0 z-0" aria-label={`Open market: ${market.title}`} />

      <div className="relative z-10 flex flex-1 flex-col p-5">
        {/* header: event icon + breadcrumb/title + actions */}
        <div className="flex items-start gap-4">
          <EntityAvatar
            name={market.title}
            imageUrl={market.cover_image_url}
            size={56}
            shape="squircle"
            className="mt-0.5 flex-none"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate" style={{ fontSize: 14, fontWeight: 540, lineHeight: '20px', letterSpacing: '-0.09px', color: 'var(--text-3)' }}>
              <span className="truncate">{cat.label}</span>
              {sub && <><span aria-hidden>·</span><span className="truncate">{sub}</span></>}
            </div>
            <h1
              className="mt-0.5 font-semibold"
              style={{ fontSize: 24, lineHeight: '32px', letterSpacing: 'normal', color: 'var(--text)' }}
            >
              {market.title}
            </h1>
          </div>
          <MarketCardActions slug={market.slug} title={market.title} />
        </div>

        {/* body: ranked outcomes (40%) | chart (flex-1) — mirrors PM's flex row */}
        <div className="mt-1 flex flex-col-reverse gap-5 lg:flex-row lg:gap-6">
          {/* outcomes — 40% width like Polymarket */}
          <div className="flex min-w-0 flex-col gap-4 lg:w-[40%]">
            <div className="flex flex-col gap-2">
              {series.binary ? (
                <BinaryRows yesPct={yesPct} />
              ) : (
                ranked.slice(0, 4).map((o) => (
                  <div
                    key={o.id || o.label}
                    className="flex min-h-10 items-center justify-between gap-3 pb-2"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {o.imageUrl && (
                        <EntityAvatar name={o.label} imageUrl={o.imageUrl} size={30} shape="squircle" className="flex-none" />
                      )}
                      <span className="truncate" style={{ fontSize: 15, fontWeight: 450, lineHeight: '22.5px', color: 'var(--text)', letterSpacing: '-0.15px' }}>
                        {o.label}
                      </span>
                    </div>
                    <span className="flex-none tabular-nums font-semibold" style={{ fontSize: 20, lineHeight: '24px', color: 'var(--text)', letterSpacing: '-0.2px' }}>
                      {Math.round(o.price * 100)}%
                    </span>
                  </div>
                ))
              )}
              {!series.binary && ranked.length > 4 && (
                <span className="mt-1 text-[13px] font-medium" style={{ color: 'var(--text-3)' }}>
                  +{ranked.length - 4} more outcomes
                </span>
              )}
            </div>

            {/* comment peek */}
            {comments && comments.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
                {comments.slice(0, 2).map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <EntityAvatar name={c.author} size={22} shape="circle" className="mt-0.5 flex-none" />
                    <p className="min-w-0 flex-1 truncate text-[13px] leading-snug" style={{ color: 'var(--text-3)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-2)' }}>{c.author}</span>{' '}
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* chart + legend */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-row flex-wrap items-center gap-x-5 gap-y-1.5">
              {(series.binary ? ranked.slice(0, 1) : ranked.slice(0, 4)).map((o, i) => (
                <span key={o.id || o.label} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="h-1 w-4 flex-none rounded-full"
                    style={{ background: series.binary ? 'var(--yes)' : LINE_PALETTE[i % LINE_PALETTE.length] }}
                    aria-hidden
                  />
                  <span className="font-medium" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {series.binary ? 'Yes' : o.label}
                  </span>
                  <span className="tabular-nums font-semibold" style={{ fontSize: 13, color: 'var(--text-2)', letterSpacing: '-0.1px' }}>
                    {(o.price * 100).toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
            <ProbLines
              lines={series.lines}
              binary={series.binary}
              width={496}
              height={276}
              grid
              autoDomain
              axis="right"
              step
              endpointHalo
              maxLines={series.binary ? 1 : 4}
              fillArea={series.binary}
              xLabels={ticks}
              strokeWidth={1.75}
              fadeHistory
              idSalt={market.id}
              className="w-full"
            />
          </div>
        </div>

        {/* footer: volume + close date */}
        <div
          className="mt-auto flex items-center justify-between gap-3 border-t pt-3"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-300)' }}
        >
          <span className="font-medium" style={{ fontSize: 13, letterSpacing: '-0.1px' }}>
            {fmtVol(market.total_volume_usd ?? 0)} Vol
          </span>
          {market.closes_at && (
            <span className="truncate font-medium" style={{ fontSize: 13, letterSpacing: '-0.1px' }}>
              Ends {fmtDate(market.closes_at)} · <span style={{ color: 'var(--text-3)' }}>MarketPips</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Yes/No rows for a binary market (color chip instead of an entity avatar). */
function BinaryRows({ yesPct }: { yesPct: number }) {
  const rows = [
    { label: 'Yes', pct: yesPct, color: 'var(--yes)' },
    { label: 'No', pct: 100 - yesPct, color: 'var(--no)' },
  ]
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex min-h-10 items-center justify-between gap-3 pb-2"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="h-[18px] w-[18px] flex-none rounded-[5px]" style={{ background: r.color }} aria-hidden />
            <span className="truncate" style={{ fontSize: 15, fontWeight: 450, lineHeight: '22.5px', color: 'var(--text)', letterSpacing: '-0.15px' }}>
              {r.label}
            </span>
          </div>
          <span className="flex-none tabular-nums font-semibold" style={{ fontSize: 20, lineHeight: '24px', color: 'var(--text)', letterSpacing: '-0.2px' }}>
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
    <div className="relative flex items-center gap-3 rounded-2xl p-4" style={{ background: bg, border: '1px solid var(--hairline)' }}>
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

function BreakingNews({ items }: { items: BreakingItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-[15px] font-bold" style={{ color: 'var(--text)' }}>
          Breaking News <IconChevronRight size={15} style={{ color: 'var(--text-3)' }} />
        </h3>
      </div>
      <ol className="flex flex-col">
        {items.slice(0, 3).map((it, i) => {
          const up = it.change >= 0
          const delta = `${Math.abs(Math.round(it.change))}%`
          return (
            <li key={it.market.id}>
              <Link
                href={`/markets/${it.market.slug}`}
                className="-mx-1.5 flex items-start gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="w-4 flex-none pt-0.5 text-[13px] font-semibold" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
                <span
                  className="min-w-0 flex-1 text-[14px] font-medium leading-snug"
                  style={{ color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {it.market.title}
                </span>
                <span className="flex flex-none flex-col items-end">
                  <span className="tabular-nums font-semibold leading-none" style={{ fontSize: 18, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                    {Math.round(it.pct)}%
                  </span>
                  <span
                    className="mt-1 flex items-center gap-0.5 tabular-nums text-[12px] font-semibold"
                    style={{ color: up ? 'var(--yes)' : 'var(--no)' }}
                  >
                    {up ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                    {delta}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
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
              <span className="w-4 flex-none text-center text-[12px] font-semibold" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>{m.title}</span>
              <span className="flex flex-none items-center gap-1 text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>
                {fmtVol(m.volume_24h_usd ?? 0)} today
                <IconFire size={13} style={{ color: 'var(--warn)' }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

function HeroRail({ hotTopics, breaking }: { hotTopics: Market[]; breaking: BreakingItem[] }) {
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
      <BreakingNews items={breaking} />
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
  breaking = [],
  comments = {},
}: {
  items?: HeroMarket[]
  hotTopics?: Market[]
  breaking?: BreakingItem[]
  comments?: Record<string, HeroComment[]>
}) {
  if (items.length === 0) return null

  const slides = items.map((it) => (
    <Spotlight key={it.market.id} market={it.market} series={it.series} comments={comments[it.market.id]} />
  ))
  const titles = items.map((it) => it.market.title)

  return (
    <section className="relative">
      <div className="relative mx-auto max-w-[1400px] px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2.35fr_1fr]">
          <HeroCarousel slides={slides} titles={titles} />
          <HeroRail hotTopics={hotTopics} breaking={breaking} />
        </div>
      </div>
    </section>
  )
}
