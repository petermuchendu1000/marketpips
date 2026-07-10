'use client'

// components/markets/outcomes-chart.tsx
// Probability history for MULTIPLE-CHOICE markets: one line per option over
// time (the Polymarket "event" chart pattern), on the Pip system. price_history
// rows are per-option (market_option_id + price); we pivot them into one row per
// timestamp so every option shares an x-axis. Color is decorative — the legend
// and accessible summary carry the meaning, never hue alone.
import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'

export interface OutcomeSeriesOption {
  id: string
  label: string
  /** Current probability (used as the trailing point when history is sparse). */
  price: number
}

export interface OutcomePricePoint {
  optionId: string
  price: number
  recordedAt: string | null
}

interface OutcomesChartProps {
  options: OutcomeSeriesOption[]
  data: OutcomePricePoint[]
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

// Brand-led categorical palette (shared with the allocation donut).
const PALETTE = [
  'var(--pip-500)', 'var(--yes)', '#7c6cf0', '#e0973b',
  '#3aa5c2', '#c2557a', '#5b8def', '#9a8c5c',
  '#4bb37b', '#d06a4a', '#8a6cf0', '#b0983a',
]

interface TooltipProps {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string | number
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const rows = [...payload].sort((a, b) => b.value - a.value).slice(0, 6)
  return (
    <div
      className="rounded-md border border-hairline px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--surface)' }}
    >
      <p className="mb-1 text-text-muted">{label ? format(new Date(label), 'MMM d, HH:mm') : ''}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: r.color }} aria-hidden />
              <span className="max-w-[140px] truncate text-text-secondary">{r.name}</span>
            </span>
            <span className="font-medium text-text-primary">{Math.round(r.value * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OutcomesChart({ options, data }: OutcomesChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('ALL')

  // Stable option order + color assignment, ranked by current price.
  const ranked = useMemo(
    () => [...options].sort((a, b) => b.price - a.price),
    [options],
  )
  const colorById = useMemo(() => {
    const m = new Map<string, string>()
    ranked.forEach((o, i) => m.set(o.id, PALETTE[i % PALETTE.length]))
    return m
  }, [ranked])

  // Pivot per-option ticks into one row per timestamp: { time, [optionId]: price }.
  const chartData = useMemo(() => {
    const tf = TIMEFRAMES.find((t) => t.key === timeframe)
    const cutoff = tf?.ms ? Date.now() - tf.ms : null
    const byTime = new Map<string, Record<string, number | string>>()
    for (const p of data) {
      if (!p.recordedAt) continue
      if (cutoff && new Date(p.recordedAt).getTime() < cutoff) continue
      const row = byTime.get(p.recordedAt) ?? { time: p.recordedAt }
      row[p.optionId] = p.price
      byTime.set(p.recordedAt, row)
    }
    const rows = Array.from(byTime.values()).sort(
      (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime(),
    )
    // Forward-fill each option so lines stay continuous across sparse ticks.
    const last: Record<string, number> = {}
    for (const row of rows) {
      for (const o of ranked) {
        if (typeof row[o.id] === 'number') last[o.id] = row[o.id] as number
        else if (o.id in last) row[o.id] = last[o.id]
      }
    }

    // Never blank: when there is no real history, seed a flat baseline at each
    // option's live probability so every line is visible (Polymarket parity).
    if (rows.length < 2) {
      const now = Date.now()
      const seedRow = (t: number) => {
        const r: Record<string, number | string> = { time: new Date(t).toISOString() }
        for (const o of ranked) r[o.id] = o.price
        return r
      }
      return [seedRow(now - 24 * HOUR), seedRow(now)]
    }
    return rows
  }, [data, ranked, timeframe])

  const isSeeded = chartData.length === 2 &&
    !data.some((p) => p.recordedAt)

  const summary = `Probability history for ${ranked.length} options. Current leader: ${
    ranked[0]?.label ?? '—'
  } at ${Math.round((ranked[0]?.price ?? 0) * 100)}%.`

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
                  active ? 'bg-pip-100 text-pip-500' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tf.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative h-56" role="img" aria-label={summary}>
        <p className="sr-only">{summary}</p>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-2 select-none font-display text-sm font-semibold text-text-muted opacity-30"
        >
          MarketPips
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0.5} stroke="var(--hairline)" strokeDasharray="3 3" />
              {ranked.map((o) => (
                <Line
                  key={o.id}
                  type="monotone"
                  dataKey={o.id}
                  name={o.label}
                  stroke={colorById.get(o.id)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

      {isSeeded && (
        <p className="mt-1.5 text-center text-[11px] text-text-muted">
          Flat baseline at the current estimate · awaiting first trade
        </p>
      )}

      {/* Legend — ranked options with current probability. */}
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {ranked.map((o) => (
          <li key={o.id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 flex-none rounded-[2px]"
              style={{ background: colorById.get(o.id) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-text-secondary">{o.label}</span>
            <span className="font-mono font-medium text-text-primary">
              {Math.round(o.price * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
