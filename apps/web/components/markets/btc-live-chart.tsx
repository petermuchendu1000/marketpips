'use client'

// components/markets/btc-live-chart.tsx
// ---------------------------------------------------------------------------
// Real-time BTC/USD chart for the recurring "Bitcoin Up or Down" windows — a
// close clone of Polymarket's BTC Up-or-Down market chart. Polymarket offers
// THREE views, toggled by the icon cluster at the bottom-right:
//
//   1. Probability line  (line icon)   — "UP xx% chance", a blue % line 0–100.
//   2. BTC price / area  (₿ icon)      — the orange spot line with a dashed
//                                         Target strike and a right price axis.
//   3. Candlesticks      (candle icon) — green/red OHLC candles of the spot.
//
// All three share ONE live feed and ONE time domain, so switching views is
// instant and consistent. The header adapts to the active view (chance vs.
// price-to-beat + current price), exactly like Polymarket.
//
// PROBABILITY MODEL: these windows have no order book to read a market price
// from tick-by-tick, so the "UP chance" is the implied probability that spot
// finishes above the strike — a logistic of (spot − strike) scaled by the
// volatility still in play over the remaining time. Early in a window it hovers
// near 50%; as the clock runs down and price separates it saturates toward
// 100%/0% — the same shape Polymarket's chance line traces.
//
// FEED (robust, key-less, free): a REST spot poll (api.coinbase.com, CORS-open)
// runs as the always-on baseline so the line is NEVER empty, and Coinbase's
// public WebSocket ticker (wss://ws-feed.exchange.coinbase.com) layers on
// smoother sub-second ticks when it connects. Recent history is best-effort
// seeded from Coinbase candles. Coinbase is the same source the server oracle
// settles against, so the chart and settlement agree.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, ComposedChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Customized,
} from 'recharts'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { IconArrowUp, IconArrowDown } from '@/components/ui/icons'

const BTC_ORANGE = '#F7931A'
const PROB_BLUE = '#2B50E4'
const UP_GREEN = '#1F9D6B'
const DOWN_RED = '#D1495B'

type ChartType = 'prob' | 'price' | 'candle'

interface BtcLiveChartProps {
  marketId: string
  referencePrice: number
  closesAt: string
  windowSeconds: number
  upLabel?: string
  downLabel?: string
  status?: string
}

interface Pt {
  t: number
  price: number
}

interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
}

interface Sibling {
  slug: string
  label: string
  closes_at: string
  window_seconds: number
}

const usd = (n: number, dp = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp })

/**
 * Implied probability that spot finishes ABOVE the strike by window close —
 * logistic of the standardised move (spot − strike) / (σ·√timeLeft). σ is a
 * modest per-√second BTC vol; as timeLeft → 0 the denominator collapses so the
 * chance saturates to 0/1 based on the sign of the move. Clamped to [1, 99]%.
 */
function impliedUpProb(price: number, reference: number, remainingSec: number): number {
  if (reference <= 0) return 50
  const secs = Math.max(remainingSec, 2)
  // ~0.045%/√s ≈ realistic short-horizon BTC vol; scale keeps the curve lively.
  const sigma = reference * 0.00045 * Math.sqrt(secs)
  const z = (price - reference) / (sigma || 1)
  const p = 1 / (1 + Math.exp(-z))
  return Math.min(99, Math.max(1, p * 100))
}

function Tip({ active, payload, label, kind }: {
  active?: boolean; payload?: { value: number }[]; label?: string | number; kind: ChartType
}) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value ?? 0
  return (
    <div className="rounded-md border border-hairline px-3 py-2 text-sm shadow-lg" style={{ background: 'var(--surface)' }}>
      <p className="mb-0.5 text-xs text-text-muted">{label ? format(new Date(Number(label)), 'HH:mm:ss') : ''}</p>
      <p className="font-mono font-semibold" style={{ color: kind === 'prob' ? PROB_BLUE : BTC_ORANGE }}>
        {kind === 'prob' ? `${v.toFixed(0)}%` : usd(v, 2)}
      </p>
    </div>
  )
}

export function BtcLiveChart({
  marketId,
  referencePrice,
  closesAt,
  windowSeconds,
  upLabel = 'Up',
  downLabel = 'Down',
  status = 'active',
}: BtcLiveChartProps) {
  const closeMs = useMemo(() => new Date(closesAt).getTime(), [closesAt])
  const openMs = useMemo(() => closeMs - windowSeconds * 1000, [closeMs, windowSeconds])

  const [points, setPoints] = useState<Pt[]>([{ t: openMs, price: referencePrice }])
  const [live, setLive] = useState<number>(referencePrice)
  const [connected, setConnected] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('price')
  // Seed `now` from a DETERMINISTIC, prop-derived value (the window open time)
  // so the server render and the first client render produce identical
  // countdown / "Live" text (no hydration mismatch). The interval below swaps
  // in the real wall-clock immediately after mount, so the countdown is live.
  const [now, setNow] = useState<number>(openMs)
  const [siblings, setSiblings] = useState<Sibling[]>([])
  const lastPush = useRef<number>(0)

  const windowClosed = status !== 'active' || now >= closeMs

  // 1s clock (countdown + freezes the series at the close boundary).
  useEffect(() => {
    setNow(Date.now()) // adopt the real clock the moment we're on the client
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Sibling live windows for the 5M · 15M · 30M · 1H chips.
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('markets')
      .select('slug, closes_at, metadata')
      .eq('status', 'active')
      .contains('metadata', { card_kind: 'up_down' })
      .order('featured_order', { ascending: true })
      .then(({ data }) => {
        if (!data) return
        setSiblings(
          data.map((m) => {
            const meta = (m.metadata ?? {}) as Record<string, unknown>
            return {
              slug: m.slug as string,
              label: String(meta.window_label ?? ''),
              closes_at: m.closes_at as string,
              window_seconds: Number(meta.window_seconds ?? 0),
            }
          }),
        )
      })
  }, [marketId])

  const pushPrice = useMemo(() => {
    return (price: number, force = false) => {
      if (!Number.isFinite(price) || price <= 0) return
      setLive(price)
      const t = Date.now()
      if (!force && t - lastPush.current < 700) return
      lastPush.current = t
      setPoints((prev) => {
        const capped = Math.min(t, closeMs)
        const next = [...prev, { t: capped, price }]
        return next.length > 900 ? next.slice(next.length - 900) : next
      })
    }
  }, [closeMs])

  // Best-effort seed of recent history from Coinbase 1-minute candles.
  useEffect(() => {
    let alive = true
    const startISO = new Date(openMs).toISOString()
    const endISO = new Date(Math.min(closeMs, Date.now() + 1000)).toISOString()
    fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${startISO}&end=${endISO}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('candles'))))
      .then((rows: number[][]) => {
        if (!alive || !Array.isArray(rows) || rows.length === 0) return
        const seeded: Pt[] = rows
          .map((c) => ({ t: c[0] * 1000, price: c[4] }))
          .filter((p) => p.t >= openMs && p.t <= closeMs)
          .sort((a, b) => a.t - b.t)
        if (seeded.length) {
          setPoints((prev) => {
            const tail = prev.filter((p) => p.t > (seeded.at(-1)?.t ?? openMs))
            return [{ t: openMs, price: referencePrice }, ...seeded, ...tail]
          })
        }
      })
      .catch(() => {/* CORS/region — baseline REST poll fills the line instead */})
    return () => {
      alive = false
    }
  }, [openMs, closeMs, referencePrice])

  // ALWAYS-ON REST spot poll — guarantees a moving line even if the socket is
  // blocked. api.coinbase.com is CORS-open, so this works from any browser.
  useEffect(() => {
    if (windowClosed) return
    let alive = true
    const tick = () =>
      fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
        .then((r) => r.json())
        .then((j) => {
          if (alive) pushPrice(parseFloat(j?.data?.amount))
        })
        .catch(() => {})
    tick()
    const id = setInterval(tick, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [windowClosed, pushPrice])

  // Coinbase WebSocket ticker — smoother sub-second ticks when reachable.
  useEffect(() => {
    if (windowClosed) return
    let ws: WebSocket | null = null
    let closedByUs = false
    try {
      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      ws.onopen = () => {
        setConnected(true)
        ws?.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] }))
      }
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data)
          if (m.type === 'ticker' && m.product_id === 'BTC-USD') pushPrice(parseFloat(m.price))
        } catch {/* ignore */}
      }
      ws.onerror = () => setConnected(false)
      ws.onclose = () => {
        if (!closedByUs) setConnected(false)
      }
    } catch {/* REST poll covers us */}
    return () => {
      closedByUs = true
      setConnected(false)
      try {
        ws?.close()
      } catch {/* already closed */}
    }
  }, [windowClosed, pushPrice])

  const isUp = live >= referencePrice
  const delta = live - referencePrice
  const deltaPct = referencePrice > 0 ? (delta / referencePrice) * 100 : 0
  const leanTone = isUp ? UP_GREEN : DOWN_RED

  const remainingMs = Math.max(0, closeMs - now)
  const remainingSec = remainingMs / 1000
  const mm = Math.floor(remainingMs / 60000)
  const ss = Math.floor((remainingMs % 60000) / 1000)
  const countdown = windowClosed ? 'Window closed' : `${mm}:${ss.toString().padStart(2, '0')} left`

  // Right edge tracks NOW (clamped to close) so the line always fills the full
  // width and grows left-to-right as the window progresses — Polymarket's
  // live-growing domain, instead of leaving empty space out to the close time.
  const rightMs = windowClosed ? closeMs : Math.min(closeMs, Math.max(now, openMs + 1000))

  const prices = points.map((p) => p.price)
  const lo = Math.min(referencePrice, ...prices)
  const hi = Math.max(referencePrice, ...prices)
  const pad = Math.max((hi - lo) * 0.2, referencePrice * 0.0006)
  const last = points[points.length - 1]

  // ---- Candlesticks: bucket the spot series into ~44 OHLC candles ----------
  const bucketMs = useMemo(() => {
    const span = Math.max(1, closeMs - openMs)
    return Math.max(4000, Math.round(span / 44))
  }, [openMs, closeMs])

  const candles = useMemo<Candle[]>(() => {
    if (points.length === 0) return []
    const byBucket = new Map<number, Pt[]>()
    for (const p of points) {
      const b = Math.floor((p.t - openMs) / bucketMs)
      const arr = byBucket.get(b)
      if (arr) arr.push(p)
      else byBucket.set(b, [p])
    }
    return Array.from(byBucket.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([b, pts]) => {
        const ps = pts.map((x) => x.price)
        return {
          t: openMs + b * bucketMs + bucketMs / 2,
          o: pts[0].price,
          c: pts[pts.length - 1].price,
          h: Math.max(...ps),
          l: Math.min(...ps),
        }
      })
  }, [points, openMs, bucketMs])

  // ---- Probability series: implied UP chance over time ---------------------
  const probPoints = useMemo(
    () =>
      points.map((p) => ({
        t: p.t,
        prob: impliedUpProb(p.price, referencePrice, Math.max(0, (closeMs - p.t) / 1000)),
      })),
    [points, referencePrice, closeMs],
  )
  const liveProb = impliedUpProb(live, referencePrice, remainingSec)
  const probLean = liveProb >= 50
  // Probability axis: zoom around the live value but always keep some context.
  const probVals = probPoints.map((p) => p.prob)
  const pLo = Math.max(0, Math.min(...probVals, liveProb) - 8)
  const pHi = Math.min(100, Math.max(...probVals, liveProb) + 8)

  // Candle geometry drawn against recharts' own axis scales (so it stays in
  // sync with the shared time / price domain and stays responsive).
  const CandleLayer = (cprops: unknown) => {
    const props = cprops as {
      xAxisMap?: Record<string, { scale: (v: number) => number }>
      yAxisMap?: Record<string, { scale: (v: number) => number }>
    }
    const xMap = props.xAxisMap
    const yMap = props.yAxisMap
    if (!xMap || !yMap) return null
    const xScale = Object.values(xMap)[0]?.scale
    const yScale = Object.values(yMap)[0]?.scale
    if (!xScale || !yScale) return null
    const cw = Math.max(2, Math.abs(xScale(openMs + bucketMs) - xScale(openMs)) * 0.62)
    return (
      <g>
        {candles.map((c) => {
          const cx = xScale(c.t)
          const up = c.c >= c.o
          const color = up ? UP_GREEN : DOWN_RED
          const yHigh = yScale(c.h)
          const yLow = yScale(c.l)
          const yOpen = yScale(c.o)
          const yClose = yScale(c.c)
          const bodyTop = Math.min(yOpen, yClose)
          const bodyH = Math.max(1, Math.abs(yClose - yOpen))
          return (
            <g key={c.t}>
              <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
              <rect x={cx - cw / 2} y={bodyTop} width={cw} height={bodyH} fill={color} rx={0.5} />
            </g>
          )
        })}
      </g>
    )
  }

  const xAxisProps = {
    dataKey: 't',
    type: 'number' as const,
    domain: [openMs, rightMs],
    scale: 'time' as const,
    tickFormatter: (t: number) => format(new Date(Number(t)), 'HH:mm:ss'),
    tick: { fontSize: 10, fill: 'var(--text-muted)' },
    stroke: 'var(--hairline)',
    minTickGap: 56,
  }

  return (
    <div>
      {/* Adaptive header — chance (prob view) OR price-to-beat + current price. */}
      {chartType === 'prob' ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: probLean ? UP_GREEN : DOWN_RED }}>
              {probLean ? upLabel : downLabel}
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums" style={{ color: PROB_BLUE }}>
                {liveProb.toFixed(0)}% chance
              </span>
              <span className="flex items-center gap-0.5 text-sm font-semibold tabular-nums" style={{ color: leanTone }}>
                {isUp ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
                {Math.abs(deltaPct).toFixed(2)}%
              </span>
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2.5 py-1 text-xs font-semibold"
            style={{ color: windowClosed ? 'var(--text-muted)' : 'var(--no-700)' }}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${!windowClosed ? 'animate-pulse-dot' : ''}`}
              style={{ background: windowClosed ? 'var(--text-muted)' : 'var(--no)' }}
            />
            {windowClosed ? 'Closed' : 'Live'}
          </span>
        </div>
      ) : (
        <>
          {/* Price to beat + Live pill (Polymarket header row) */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-muted">Price to beat</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-text-primary">{usd(referencePrice, 2)}</p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2.5 py-1 text-xs font-semibold"
              style={{ color: windowClosed ? 'var(--text-muted)' : 'var(--no-700)' }}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${!windowClosed ? 'animate-pulse-dot' : ''}`}
                style={{ background: windowClosed ? 'var(--text-muted)' : 'var(--no)' }}
              />
              {windowClosed ? 'Closed' : 'Live'}
            </span>
          </div>

          {/* Live price + move + Up/Down lean + countdown */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold tabular-nums" style={{ color: BTC_ORANGE }}>{usd(live, 2)}</span>
              <span className="flex items-center gap-0.5 font-semibold tabular-nums" style={{ color: leanTone }}>
                {isUp ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
                {delta >= 0 ? '+' : '−'}{usd(Math.abs(delta), 2)} ({Math.abs(deltaPct).toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold" style={{ color: leanTone }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: leanTone }} />
                {isUp ? upLabel : downLabel} leading
              </span>
              <span aria-hidden className="text-text-muted">·</span>
              <span className="tabular-nums text-text-muted">
                {connected && !windowClosed ? 'live · ' : ''}{countdown}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Chart — one of three synchronized views. */}
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'prob' ? (
            <AreaChart data={probPoints} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="probFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROB_BLUE} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={PROB_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis {...xAxisProps} />
              <YAxis
                orientation="right"
                domain={[pLo, pHi]}
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                stroke="var(--hairline)"
                width={44}
              />
              <Tooltip content={<Tip kind="prob" />} />
              <ReferenceLine y={50} stroke="var(--hairline)" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="prob"
                stroke={PROB_BLUE}
                strokeWidth={2.5}
                fill="url(#probFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
              />
              {last && !windowClosed && (
                <ReferenceDot x={last.t} y={liveProb} r={4} fill={PROB_BLUE} stroke="var(--surface)" strokeWidth={2} />
              )}
            </AreaChart>
          ) : chartType === 'candle' ? (
            <ComposedChart data={candles} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <XAxis {...xAxisProps} />
              <YAxis
                orientation="right"
                domain={[lo - pad, hi + pad]}
                tickFormatter={(v) => usd(Number(v), 0)}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                stroke="var(--hairline)"
                width={66}
              />
              <ReferenceLine
                y={referencePrice}
                stroke={BTC_ORANGE}
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: BTC_ORANGE }}
              />
              <ReferenceLine
                y={live}
                stroke="var(--text-muted)"
                strokeDasharray="2 3"
                strokeOpacity={0.6}
              />
              <Customized component={CandleLayer} />
            </ComposedChart>
          ) : (
            <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BTC_ORANGE} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={BTC_ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis {...xAxisProps} />
              <YAxis
                orientation="right"
                domain={[lo - pad, hi + pad]}
                tickFormatter={(v) => usd(Number(v), 0)}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                stroke="var(--hairline)"
                width={66}
              />
              <Tooltip content={<Tip kind="price" />} />
              <ReferenceLine
                y={referencePrice}
                stroke={BTC_ORANGE}
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: BTC_ORANGE }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={BTC_ORANGE}
                strokeWidth={2}
                fill="url(#btcFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
              />
              {last && !windowClosed && (
                <ReferenceDot x={last.t} y={last.price} r={4} fill={BTC_ORANGE} stroke="var(--surface)" strokeWidth={2} />
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bottom controls: series chips (left) + chart-type toggle (right). */}
      <div className="mt-3 flex items-center justify-between gap-3">
        {siblings.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((s) => {
              const active = s.window_seconds === windowSeconds
              return (
                <Link
                  key={s.slug}
                  href={`/markets/${s.slug}`}
                  className={`rounded-pill border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-transparent bg-text-primary text-surface'
                      : 'border-hairline text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  {s.label}
                </Link>
              )
            })}
          </div>
        ) : (
          <span />
        )}

        <div
          className="inline-flex flex-none items-center gap-0.5 rounded-pill border border-hairline p-0.5"
          role="tablist"
          aria-label="Chart type"
        >
          <ChartToggle active={chartType === 'prob'} onClick={() => setChartType('prob')} label="Probability">
            <IconLineChart size={16} />
          </ChartToggle>
          <ChartToggle active={chartType === 'price'} onClick={() => setChartType('price')} label="BTC price">
            <IconBitcoin size={16} />
          </ChartToggle>
          <ChartToggle active={chartType === 'candle'} onClick={() => setChartType('candle')} label="Candlesticks">
            <IconCandles size={16} />
          </ChartToggle>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-text-muted">
        {chartType === 'prob'
          ? 'Implied Up chance from live BTC/USD (Coinbase) vs the strike'
          : 'Live BTC/USD via Coinbase · settles at the reference price when the window closes'}
      </p>
    </div>
  )
}

/* ---------- chart-type toggle button + icons ---------- */

function ChartToggle({
  active, onClick, label, children,
}: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-pill transition-colors ${
        active ? 'bg-surface-2 text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {children}
    </button>
  )
}

function IconLineChart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-4 4" />
    </svg>
  )
}

function IconBitcoin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
    </svg>
  )
}

function IconCandles({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 4v3M8 17v3" />
      <rect x="5.5" y="7" width="5" height="10" rx="1" />
      <path d="M16 2v4M16 15v5" />
      <rect x="13.5" y="6" width="5" height="9" rx="1" />
    </svg>
  )
}
