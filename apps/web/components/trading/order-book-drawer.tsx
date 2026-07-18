'use client'

// components/trading/order-book-drawer.tsx
// ------------------------------------------------------------
// The inline accordion drawer PM expands under a clicked candidate row on an
// order-book (CLOB) market. Three tabs — Order Book / Graph / Resolution —
// built 1:1 to the measured ground truth in
// docs/design/PM-CLOB-DRAWER-MEASURED-2026-07.md:
//   • Order Book: asks (red, desc) → Last/Spread divider → bids (green, desc),
//     dual %+¢ price, cumulative TOTAL, left-anchored depth bars, Asks/Bids
//     pills, TRADE YES heading, Maker Rebate/Rewards/tick chrome. Live from
//     GET /api/markets/[id]/book (polled). Only renders for pricing_engine=clob.
//   • Graph: the candidate's YES-probability history via PriceChart.
//   • Resolution: Propose-resolution CTA + View-details link (criteria).
import { useCallback, useEffect, useRef, useState } from 'react'
import { PriceChart } from '@/components/markets/price-chart'
import { dualPriceLabel, formatCents, type BookLevel, type ClobBook } from '@/lib/clob'
import { IconRefresh } from '@/components/ui/icons'

type Tab = 'book' | 'graph' | 'resolution'

interface PricePoint {
  yes_price: number
  no_price: number
  volume_usd: number | null
  recorded_at: string | null
}

const num = (n: number, d = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export function OrderBookDrawer({
  marketRef,
  optionId,
  side = 'yes',
  currentYes,
  volumeUsd,
  resolutionCriteria,
  resolvesAt,
}: {
  /** market slug or UUID for the API path. */
  marketRef: string
  optionId: string
  side?: 'yes' | 'no'
  currentYes?: number
  volumeUsd?: number
  resolutionCriteria?: string | null
  resolvesAt?: string | null
}) {
  const [tab, setTab] = useState<Tab>('book')
  const [book, setBook] = useState<ClobBook | null>(null)
  const [bookErr, setBookErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [series, setSeries] = useState<PricePoint[] | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadBook = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/markets/${encodeURIComponent(marketRef)}/book?option=${optionId}&side=${side}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setBook((await res.json()) as ClobBook)
      setBookErr(null)
    } catch (e) {
      setBookErr('Could not load the order book')
    } finally {
      setLoading(false)
    }
  }, [marketRef, optionId, side])

  // Poll the book only while its tab is visible (save requests + battery).
  useEffect(() => {
    if (tab !== 'book') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    loadBook()
    pollRef.current = setInterval(loadBook, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [tab, loadBook])

  // Lazy-load the candidate's history the first time Graph is opened.
  useEffect(() => {
    if (tab !== 'graph' || series) return
    fetch(`/api/markets/${encodeURIComponent(marketRef)}/price-history?option=${optionId}&max_points=200`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setSeries((j.data ?? []) as PricePoint[]))
      .catch(() => setSeries([]))
  }, [tab, series, marketRef, optionId])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'book', label: 'Order Book' },
    { key: 'graph', label: 'Graph' },
    { key: 'resolution', label: 'Resolution' },
  ]

  return (
    <div className="border-t border-hairline bg-surface px-4 py-3">
      {/* Tab bar + right chrome (Maker Rebate · Rewards · refresh · tick) */}
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Candidate details" className="flex items-center gap-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              // PM parity (live-measured 2026-07-18): tabs are 14px/600, active
              // near-black, inactive muted #77808D that LIGHTENS to #AEB4BC on
              // hover (not darkens); 0.15s color transition; -0.09px tracking.
              className={`text-sm font-semibold tracking-[-0.09px] transition-colors duration-150 ${
                tab === t.key ? 'text-text-primary' : 'text-text-muted hover:text-[var(--ink-300)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Right chrome. PM parity: Maker Rebate + Rewards are 14px/600, the
            tick is a 12px muted BORDERED chip (not plain text). */}
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="flex items-center gap-1 text-amber" title="Maker rebate eligible">
            <span aria-hidden>🪙</span> Maker Rebate
          </span>
          <span className="text-pip-text">+ Rewards</span>
          <button
            type="button"
            aria-label="Refresh order book"
            onClick={loadBook}
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            <IconRefresh size={14} />
          </button>
          <span className="rounded border border-hairline px-1.5 py-0.5 text-xs font-medium text-text-muted">
            0.1¢
          </span>
        </div>
      </div>

      {tab === 'book' && (
        <BookTable book={book} loading={loading} error={bookErr} />
      )}

      {tab === 'graph' && (
        <div className="pt-3">
          {series === null ? (
            <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
          ) : series.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">No price history yet.</p>
          ) : (
            <PriceChart
              data={series}
              currentYes={currentYes}
              volumeUsd={volumeUsd}
              resolutionDate={resolvesAt ?? undefined}
            />
          )}
        </div>
      )}

      {tab === 'resolution' && (
        // PM parity: a "Propose resolution" outlined pill (left) + a
        // "View details ↗" link (right); criteria text sits below when present.
        <div className="pt-4">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              className="rounded-[9px] border border-hairline px-3 py-1.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2"
            >
              Propose resolution
            </button>
            <a
              href={resolvesAt ? '#resolution' : '#resolution'}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-pip-text transition-opacity hover:opacity-80"
            >
              View details <span aria-hidden>↗</span>
            </a>
          </div>
          {resolutionCriteria ? (
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{resolutionCriteria}</p>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Resolution details will be published here.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** The depth table: asks (red desc) → Last/Spread → bids (green desc). */
function BookTable({
  book,
  loading,
  error,
}: {
  book: ClobBook | null
  loading: boolean
  error: string | null
}) {
  if (loading && !book) return <div className="mt-3 h-64 animate-pulse rounded-lg bg-surface-2" />
  if (error) return <p className="py-8 text-center text-sm text-text-muted">{error}</p>
  if (!book) return null

  const asksDesc = [...book.asks].reverse() // worst→best so best sits by the spread
  const hasBook = book.asks.length > 0 || book.bids.length > 0
  if (!hasBook)
    return <p className="py-8 text-center text-sm text-text-muted">No open orders on this book yet.</p>

  return (
    <div className="mt-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {/* PM shows a "TRADE YES" heading + a small two-column layout glyph. */}
        <span className="flex items-center gap-1">
          <span>Trade Yes</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4" width="7" height="16" rx="1" />
            <rect x="14" y="4" width="7" height="16" rx="1" />
          </svg>
        </span>
        <div className="flex gap-10">
          <span className="w-16 text-right">Price</span>
          <span className="w-20 text-right">Shares</span>
          <span className="w-24 text-right">Total</span>
        </div>
      </div>

      {/* Asks (sell) — red, descending */}
      <div>
        {asksDesc.map((l, i) => (
          <BookRow key={`a${l.price}`} level={l} tone="no" pill={i === asksDesc.length - 1 ? 'Asks' : undefined} />
        ))}
      </div>

      {/* Last / Spread divider */}
      <div className="flex items-center justify-between px-1 py-2 text-xs font-semibold text-text-muted">
        <span>
          Last:{' '}
          {book.last != null ? `${dualPriceLabel(book.last).percent} ${dualPriceLabel(book.last).cents}` : '—'}
        </span>
        <span>Spread: {book.spread != null ? formatCents(book.spread) : '—'}</span>
      </div>

      {/* Bids (buy) — green, descending */}
      <div>
        {book.bids.map((l, i) => (
          <BookRow key={`b${l.price}`} level={l} tone="yes" pill={i === 0 ? 'Bids' : undefined} />
        ))}
      </div>
    </div>
  )
}

/** One depth row: left-anchored tint bar (∝ cumulative depth) + dual price + shares + total. */
function BookRow({ level, tone, pill }: { level: BookLevel; tone: 'yes' | 'no'; pill?: 'Asks' | 'Bids' }) {
  const price = dualPriceLabel(level.price)
  const barColor = tone === 'yes' ? 'var(--yes-tint)' : 'var(--no-tint)'
  const priceColor = tone === 'yes' ? 'text-yes' : 'text-no'
  const pillBg = tone === 'yes' ? 'bg-yes' : 'bg-no'
  return (
    <div className="relative flex h-9 items-center justify-between overflow-hidden px-1">
      {/* depth bar */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${Math.max(2, level.depthPct * 100)}%`, backgroundColor: barColor }}
      />
      <span className="relative z-[1] flex items-center gap-1.5">
        {pill && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${pillBg}`}>{pill}</span>
        )}
      </span>
      <div className="relative z-[1] flex items-center gap-10 tabular-nums">
        <span className="w-16 text-right text-sm font-semibold">
          <span className={priceColor}>{price.percent}</span>{' '}
          <span className="text-text-muted text-xs">{price.cents}</span>
        </span>
        <span className="w-20 text-right text-sm text-text-primary">{num(level.size)}</span>
        <span className="w-24 text-right text-sm text-text-primary">${num(level.totalUsd)}</span>
      </div>
    </div>
  )
}
