'use client'

// components/markets/btc-live-chart.tsx
// ---------------------------------------------------------------------------
// Real-time BTC/USD price chart for the recurring "Bitcoin Up or Down" windows
// (Polymarket parity — see polymarket.com/crypto/hourly). It shows the three
// things a trader needs while a window is live:
//   • Price to beat  — the window's reference (open) price, drawn as a dashed
//     strike line the price must stay above (Up) or below (Down).
//   • Live BTC price — streamed tick-by-tick, with the move since open.
//   • Up/Down lean   — derived from live price vs the strike, so the chart reads
//     at a glance the way Polymarket's does.
//
// FEED: Coinbase's public, key-less WebSocket ticker (wss://ws-feed.exchange
// .coinbase.com). WebSockets aren't subject to CORS, so this works from the
// browser in any region, and Coinbase is the same source the server-side
// oracle prefers (lib/markets/btc-price.ts) — so the chart and settlement agree.
// We best-effort seed recent history from Coinbase's REST candles; if that's
// blocked we simply begin at the strike and accumulate live ticks.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'
import { format } from 'date-fns'
import { IconArrowUp, IconArrowDown } from '@/components/ui/icons'

interface BtcLiveChartProps {
  /** Window reference (open) price — the "price to beat". */
  referencePrice: number
  /** Window close time (ISO). */
  closesAt: string
  /** Window duration in seconds (open = close − windowSeconds). */
  windowSeconds: number
  upLabel?: string
  downLabel?: string
  /** Market status; live streaming stops once the window is no longer active. */
  status?: string
}

interface Pt {
  t: number
  price: number
}

const usd = (n: number, dp = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp })

function Tip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-hairline px-3 py-2 text-sm shadow-lg" style={{ background: 'var(--surface)' }}>
      <p className="mb-0.5 text-xs text-text-muted">{label ? format(new Date(Number(label)), 'HH:mm:ss') : ''}</p>
      <p className="font-mono font-semibold text-text-primary">{usd(payload[0]?.value ?? 0, 2)}</p>
    </div>
  )
}

export function BtcLiveChart({
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
  const [now, setNow] = useState<number>(() => Date.now())
  const lastPush = useRef<number>(0)

  const windowOver = status !== 'active' || now >= closeMs

  // 1s clock for the countdown + to freeze the series when the window ends.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Best-effort history seed from Coinbase 1-minute candles (newest first).
  useEffect(() => {
    let alive = true
    const startISO = new Date(openMs).toISOString()
    const endISO = new Date(Math.min(closeMs, Date.now())).toISOString()
    const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${startISO}&end=${endISO}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('candles'))))
      .then((rows: number[][]) => {
        if (!alive || !Array.isArray(rows) || rows.length === 0) return
        // [ time(s), low, high, open, close, volume ]
        const seeded: Pt[] = rows
          .map((c) => ({ t: c[0] * 1000, price: c[4] }))
          .filter((p) => p.t >= openMs && p.t <= closeMs)
          .sort((a, b) => a.t - b.t)
        setPoints((prev) => {
          const merged = [{ t: openMs, price: referencePrice }, ...seeded, ...prev.filter((p) => p.t > (seeded.at(-1)?.t ?? openMs))]
          return merged
        })
      })
      .catch(() => {/* CORS/region — start from the strike and stream live */})
    return () => {
      alive = false
    }
  }, [openMs, closeMs, referencePrice])

  // Live tick stream — Coinbase key-less WebSocket ticker.
  useEffect(() => {
    if (windowOver) return
    let ws: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let closedByUs = false

    const pushPrice = (price: number) => {
      if (!Number.isFinite(price) || price <= 0) return
      setLive(price)
      const t = Date.now()
      if (t - lastPush.current < 750) return // throttle re-renders (~1.3/s)
      lastPush.current = t
      setPoints((prev) => {
        const next = [...prev, { t: Math.min(t, closeMs), price }]
        return next.length > 720 ? next.slice(next.length - 720) : next
      })
    }

    // REST fallback if the socket can't be established (rare).
    const startPolling = () => {
      if (poll) return
      poll = setInterval(() => {
        fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
          .then((r) => r.json())
          .then((j) => pushPrice(parseFloat(j?.data?.amount)))
          .catch(() => {})
      }, 5000)
    }

    try {
      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      ws.onopen = () => {
        setConnected(true)
        ws?.send(
          JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] }),
        )
      }
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data)
          if (m.type === 'ticker' && m.product_id === 'BTC-USD') pushPrice(parseFloat(m.price))
        } catch {/* ignore malformed frame */}
      }
      ws.onerror = () => {
        setConnected(false)
        startPolling()
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closedByUs) startPolling()
      }
    } catch {
      startPolling()
    }

    return () => {
      closedByUs = true
      setConnected(false)
      if (ws) {
        try {
          ws.close()
        } catch {/* already closed */}
      }
      if (poll) clearInterval(poll)
    }
  }, [windowOver, closeMs])

  const isUp = live >= referencePrice
  const delta = live - referencePrice
  const deltaPct = referencePrice > 0 ? (delta / referencePrice) * 100 : 0
  const tone = isUp ? 'var(--yes)' : 'var(--no)'

  const remainingMs = Math.max(0, closeMs - now)
  const mm = Math.floor(remainingMs / 60000)
  const ss = Math.floor((remainingMs % 60000) / 1000)
  const countdown = windowOver ? 'Window closed' : `${mm}:${ss.toString().padStart(2, '0')} left`

  // Y domain padded around the strike so the reference line always sits in view.
  const prices = points.map((p) => p.price)
  const lo = Math.min(referencePrice, ...prices)
  const hi = Math.max(referencePrice, ...prices)
  const pad = Math.max((hi - lo) * 0.15, referencePrice * 0.0008)

  return (
    <div>
      {/* Live readout row */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted">Live BTC price</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: tone }}>
              {usd(live, 0)}
            </span>
            <span className="flex items-center gap-0.5 text-sm font-semibold tabular-nums" style={{ color: tone }}>
              {isUp ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
              {delta >= 0 ? '+' : '−'}
              {usd(Math.abs(delta), 0)} ({Math.abs(deltaPct).toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">Price to beat</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-text-primary">{usd(referencePrice, 0)}</p>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: tone }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
          {isUp ? upLabel : downLabel} leading
        </span>
        <span className="flex items-center gap-2 text-text-muted">
          {!windowOver && (
            <span className="flex items-center gap-1">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse-dot' : ''}`}
                style={{ background: connected ? 'var(--yes)' : 'var(--text-muted)' }}
              />
              {connected ? 'Live' : 'Connecting…'}
            </span>
          )}
          <span aria-hidden>·</span>
          <span className="tabular-nums">{countdown}</span>
        </span>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tone} stopOpacity={0.22} />
                <stop offset="100%" stopColor={tone} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[openMs, closeMs]}
              scale="time"
              tickFormatter={(t) => format(new Date(Number(t)), 'HH:mm')}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              stroke="var(--hairline)"
              minTickGap={40}
            />
            <YAxis
              orientation="right"
              domain={[lo - pad, hi + pad]}
              tickFormatter={(v) => usd(Number(v), 0)}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              stroke="var(--hairline)"
              width={64}
            />
            <Tooltip content={<Tip />} />
            <ReferenceLine
              y={referencePrice}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              label={{ value: 'Price to beat', position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)' }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={tone}
              strokeWidth={2}
              fill="url(#btcFill)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-center text-[11px] text-text-muted">
        Live BTC/USD via Coinbase · settles at the reference price when the window closes
      </p>
    </div>
  )
}
