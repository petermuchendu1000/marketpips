'use client'

// components/markets/price-chart.tsx
// Binary probability history on the Pip system, Polymarket-parity:
// live Yes/No legend, right-hand % axis, faint watermark, "$Vol · date" footer,
// and the 1H/6H/1D/1W/1M/ALL segmented control. Never blank — when a market has
// no recorded history yet we seed a flat baseline at the live crowd estimate so
// the chart always communicates the current probability (honest "no movement").
import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import { formatUSD } from '@/lib/utils'

interface PricePoint {
  yes_price: number
  no_price: number
  volume_usd: number | null
  recorded_at: string | null
}

interface PriceChartProps {
  data: PricePoint[]
  /** Live crowd estimate (0–1) used to seed a baseline when history is sparse. */
  currentYes?: number
  /** Total market volume (USD) shown in the chart footer. */
  volumeUsd?: number
}

type Timeframe = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'

const HOUR = 60 * 60 * 1000
const TIMEFRAMES: { key: Timeframe; label: string; ms: number | null }[] = [
  { key: '1H', label: '1H', ms: HOUR },
  { key: '6H', label: '6H', ms: 6 * HOUR },
  { key: '1D', label: '1D', ms: 24 * HOUR },
  { key: '1W', label: '1W', ms: 7 * 24 * HOUR },
  { key: '1M', label: '1M', ms: 30 * 24 * HOUR },
  { key: 'ALL', label: 'ALL', ms: null },
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

export function PriceChart({ data, currentYes = 0.5, volumeUsd = 0 }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('ALL')

  const chartData = useMemo(() => {
    const rows = (data ?? [])
      .filter((d) => d.recorded_at)
      .map((d) => ({ time: d.recorded_at as string, yes: d.yes_price, no: d.no_price }))

    // Seed a flat baseline at the live estimate when there is no real history,
    // so the plot is never empty (Polymarket always shows a line).
    if (rows.length === 0) {
      const now = Date.now()
      return [
        { time: new Date(now - 24 * HOUR).toISOString(), yes: currentYes, no: 1 - currentYes },
        { time: new Date(now).toISOString(), yes: currentYes, no: 1 - currentYes },
      ]
    }

    const tf = TIMEFRAMES.find((t) => t.key === timeframe)
    if (!tf?.ms) return rows
    const cutoff = Date.now() - tf.ms
    const filtered = rows.filter((r) => new Date(r.time).getTime() >= cutoff)
    return filtered.length >= 2 ? filtered : rows.slice(-2)
  }, [data, timeframe, currentYes])

  const isSeeded = (data ?? []).filter((d) => d.recorded_at).length === 0
  const latestYes = Math.round((chartData[chartData.length - 1]?.yes ?? currentYes) * 100)
  const firstYes = Math.round((chartData[0]?.yes ?? currentYes) * 100)
  const direction =
    latestYes === firstYes ? 'unchanged from' : latestYes > firstYes ? 'up from' : 'down from'
  const summary = isSeeded
    ? `YES probability is ${latestYes}% (NO ${100 - latestYes}%). No price movement recorded yet.`
    : `YES probability is currently ${latestYes}% (NO ${100 - latestYes}%), ${direction} ${firstYes}% at the start of the shown period, across ${chartData.length} data points.`

  return (
    <div>
      {/* Legend with live % (Polymarket: colored dot + label + current value) */}
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-yes" aria-hidden />
          <span className="text-text-secondary">Yes</span>
          <span className="font-mono font-semibold text-yes">{latestYes}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-no" aria-hidden />
          <span className="text-text-secondary">No</span>
          <span className="font-mono font-semibold text-no">{100 - latestYes}%</span>
        </span>
      </div>

      <div className="relative h-56" role="img" aria-label={`Market price history. ${summary}`}>
        <p className="sr-only">{summary}</p>
        {/* Faint brand watermark inside the plot (Polymarket does the same) */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-2 select-none font-display text-sm font-semibold text-text-muted opacity-30"
        >
          MarketPips
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
              orientation="right"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={34}
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

      {/* Footer: volume + date (left) · timeframe presets (right) */}
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
        <span className="text-xs text-text-muted">
          <span className="font-mono font-medium text-text-secondary">{formatUSD(volumeUsd)}</span> Vol.
          {isSeeded && <span className="ml-2 text-text-muted">· awaiting first trade</span>}
        </span>
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
                className={`rounded-[3px] px-2 py-1 text-xs font-semibold transition-colors ${
                  active ? 'bg-pip-100 text-pip-500' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tf.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
