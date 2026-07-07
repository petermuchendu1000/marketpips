'use client'

// components/portfolio/allocation-donut.tsx
// Allocation of holdings by live market value. A single, calm visualization
// (Tremor-style) rather than a wall of charts. Color is decorative only —
// the legend carries the label + weight %, so meaning never depends on hue.
import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatUSD } from '@/lib/utils'

export interface AllocationSlice {
  label: string
  value: number
  side: 'yes' | 'no' | 'option'
}

interface AllocationDonutProps {
  slices: AllocationSlice[]
}

// Tokenized categorical palette (brand-led, then supporting hues). Kept in the
// component so the chart shares the app's color language.
const PALETTE = [
  'var(--pip-500)',
  'var(--yes)',
  '#7c6cf0',
  '#e0973b',
  '#3aa5c2',
  '#c2557a',
  '#5b8def',
  '#9a8c5c',
]

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; payload: { pct: number } }[]
}

function DonutTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div
      className="rounded-md border border-hairline px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--surface)' }}
    >
      <p className="mb-0.5 max-w-[220px] truncate font-medium text-text-primary">{p.name}</p>
      <p className="font-mono text-text-secondary">
        {formatUSD(p.value)} · {(p.payload.pct * 100).toFixed(1)}%
      </p>
    </div>
  )
}

export function AllocationDonut({ slices }: AllocationDonutProps) {
  const { data, total } = useMemo(() => {
    const t = slices.reduce((s, x) => s + x.value, 0)
    return {
      total: t,
      data: slices
        .filter((s) => s.value > 0)
        .map((s) => ({ ...s, pct: t > 0 ? s.value / t : 0 }))
        .sort((a, b) => b.value - a.value),
    }
  }, [slices])

  if (data.length === 0) {
    return (
      <div className="card flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium text-text-secondary">No open positions</p>
        <p className="mt-1 text-xs text-text-muted">Your allocation appears here once you hold a position.</p>
      </div>
    )
  }

  const summary = `Allocation by market value across ${data.length} positions totalling ${formatUSD(total)}.`

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-secondary">Allocation</h2>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-[176px] w-[176px] flex-none" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Holdings</span>
            <span className="font-mono text-base font-bold text-text-primary">{formatUSD(total)}</span>
          </div>
        </div>

        <ul className="w-full flex-1 space-y-1.5">
          {data.slice(0, 6).map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 flex-none rounded-[2px]"
                style={{ background: PALETTE[i % PALETTE.length] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-text-secondary">{s.label}</span>
              <span className="font-mono font-medium text-text-primary">
                {(s.pct * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
