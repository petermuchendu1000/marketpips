'use client'

// components/markets/btc-live-chart.tsx
// ---------------------------------------------------------------------------
// Real-time BTC/USD chart for the recurring "Bitcoin Up or Down" windows —
// a close clone of Polymarket's hourly BTC market chart
// (polymarket.com/event/btc-updown-*). It renders:
//   • "Price to beat" (the window reference/open price) + a Live pill.
//   • The live BTC price + move since open and the Up/Down lean.
//   • An orange price line (Bitcoin brand) with an area fill, a dashed "Target"
//     strike line, a right-hand price axis and a time axis, and a dot on the
//     latest point — exactly the anatomy of Polymarket's chart.
//   • Series chips (5M · 15M · 30M · 1H) that jump between the live windows.
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
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { IconArrowUp, IconArrowDown } from '@/components/ui/icons'

const BTC_ORANGE = '#F7931A'

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

interface Sibling {
  slug: string
  label: string
  closes_at: string
  window_seconds: number
}

const usd = (n: number, dp = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp })

function Tip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-hairline px-3 py-2 text-sm shadow-lg" style={{ background: 'var(--surface)' }}>
      <p className="mb-0.5 text-xs text-text-muted">{label ? format(new Date(Number(label)), 'HH:mm:ss') : ''}</p>
      <p className="font-mono font-semibold" style={{ color: BTC_ORANGE }}>{usd(payload[0]?.value ?? 0, 2)}</p>
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
  // Seed `now` from a DETERMINISTIC, prop-derived value (the window open time)
  // so the server render and the first client render produce identical
  // countdown / "Live" text. Initialising from Date.now() here ran the state
  // initializer twice — once on the server, once on the client — with two
  // different clock readings, which is exactly the "server rendered text didn't
  // match the client" hydration mismatch. The interval below swaps in the real
  // wall-clock immediately after mount, so the countdown is still live.
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
  const leanTone = isUp ? 'var(--yes)' : 'var(--no)'

  const remainingMs = Math.max(0, closeMs - now)
  const mm = Math.floor(remainingMs / 60000)
  const ss = Math.floor((remainingMs % 60000) / 1000)
  const countdown = windowClosed ? 'Window closed' : `${mm}:${ss.toString().padStart(2, '0')} left`

  const prices = points.map((p) => p.price)
  const lo = Math.min(referencePrice, ...prices)
  const hi = Math.max(referencePrice, ...prices)
  const pad = Math.max((hi - lo) * 0.2, referencePrice * 0.0006)
  const last = points[points.length - 1]

  return (
    <div>
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

      {/* Chart */}
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BTC_ORANGE} stopOpacity={0.2} />
                <stop offset="100%" stopColor={BTC_ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              domain={[openMs, closeMs]}
              scale="time"
              tickFormatter={(t) => format(new Date(Number(t)), 'HH:mm:ss')}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              stroke="var(--hairline)"
              minTickGap={56}
            />
            <YAxis
              orientation="right"
              domain={[lo - pad, hi + pad]}
              tickFormatter={(v) => usd(Number(v), 0)}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              stroke="var(--hairline)"
              width={66}
            />
            <Tooltip content={<Tip />} />
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
        </ResponsiveContainer>
      </div>

      {/* Series chips (5M · 15M · 30M · 1H) — jump between live windows. */}
      {siblings.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
      )}

      <p className="mt-2 text-center text-[11px] text-text-muted">
        Live BTC/USD via Coinbase · settles at the reference price when the window closes
      </p>
    </div>
  )
}
