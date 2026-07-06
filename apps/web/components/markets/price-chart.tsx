'use client'

// components/markets/price-chart.tsx
// Probability history on the Pip system: desaturated --yes token (never raw
// #22c55e), an on-theme tooltip, and a timeframe segmented control that filters
// the series client-side (24H / 1W / 1M / All) — the Kalshi/Polymarket pattern.
import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'

interface PricePoint {
  yes_price: number
  no_price: number
  volume_usd: number | null
  recorded_at: string | null
}

interface PriceChartProps {
  data: PricePoint[]
}

type Timeframe = '24H' | '1W' | '1M' | 'ALL'

const TIMEFRAMES: { key: Timeframe; label: string; ms: number | null }[] = [
  { key: '24H', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { key: '1W', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '1M', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: 'ALL', label: 'All', ms: null },
]

interface TooltipProps {
  active?: boolean
  payload?: { value: number }[]
  label?: string | number
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const yes = Math.round((payload[0]?.value || 0) * 100)
  return (
    <div
      className="rounded-md border border-hairline px-3 py-2 text-sm shadow-lg"
      style={{ background: 'var(--surface)' }}
    >
      <p className="mb-1 text-xs text-text-muted">
        {label ? format(new Date(label), 'MMM d, HH:mm') : ''}
      </p>
      <div className="flex gap-3 font-mono">
        <span className="font-medium text-yes">YES {yes}%</span>
        <span className="font-medium text-no">NO {100 - yes}%</span>
      </div>
    </div>
  )
}

export function PriceChart({ data }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('ALL')

  const chartData = useMemo(() => {
    const rows = (data ?? []).map((d) => ({
      time: d.recorded_at,
      yes: d.yes_price,
      no: d.no_price,
    }))
    const tf = TIMEFRAMES.find((t) => t.key === timeframe)
    if (!tf?.ms) return rows
    const cutoff = Date.now() - tf.ms
    const filtered = rows.filter((r) => r.time && new Date(r.time).getTime() >= cutoff)
    // Keep at least a couple of points so the axis renders sensibly.
    return filtered.length >= 2 ? filtered : rows.slice(-2)
  }, [data, timeframe])

  const hasData = chartData.length > 0

  // Accessible text alternative for the SVG chart (WCAG 1.1.1 / 1.4.1).
  const firstYes = Math.round((chartData[0]?.yes ?? 0) * 100)
  const latestYes = Math.round((chartData[chartData.length - 1]?.yes ?? 0) * 100)
  const direction =
    latestYes === firstYes ? 'unchanged from' : latestYes > firstYes ? 'up from' : 'down from'
  const summary = `YES probability is currently ${latestYes}% (NO ${100 - latestYes}%), ${direction} ${firstYes}% at the start of the shown period, across ${chartData.length} data points.`

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <div
          role="tablist"
          aria-label="Chart timeframe"
          className="inline-flex rounded-sm border border-hairline p-0.5"
        >
          {TIMEFRAMES.map((tf) => {
            const active = tf.key === timeframe
            return (
              <button
                key={tf.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTimeframe(tf.key)}
                className={`rounded-[3px] px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-pip-100 text-pip-500'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tf.label}
              </button>
            )
          })}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">
          No price history yet
        </div>
      ) : (
        <div className="h-48" role="img" aria-label={`Market price history. ${summary}`}>
          <p className="sr-only">{summary}</p>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--yes)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--yes)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tickFormatter={(v) => format(new Date(v), 'MMM d')}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0.5} stroke="var(--hairline)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="yes"
                stroke="var(--yes)"
                strokeWidth={2}
                fill="url(#yesGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--yes)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
