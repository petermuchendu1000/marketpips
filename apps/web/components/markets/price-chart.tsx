'use client'

// components/markets/price-chart.tsx
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border bg-card px-3 py-2 shadow-lg text-sm">
      <p className="text-muted-foreground text-xs mb-1">
        {label ? format(new Date(label), 'MMM d, HH:mm') : ''}
      </p>
      <div className="flex gap-3">
        <span className="text-yes font-medium">
          YES {Math.round((payload[0]?.value || 0) * 100)}%
        </span>
        <span className="text-no font-medium">
          NO {Math.round((payload[1]?.value || payload[0]?.value ? 100 - (payload[0]?.value || 0) * 100 : 50))}%
        </span>
      </div>
    </div>
  )
}

export function PriceChart({ data }: PriceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No price history yet
      </div>
    )
  }

  const chartData = data.map((d) => ({
    time: d.recorded_at,
    yes: d.yes_price,
    no: d.no_price,
  }))

  // Accessible text alternative for the SVG chart (WCAG 1.1.1 / 1.4.1): don't
  // rely on the visual line alone. Screen readers announce this summary.
  const firstYes = Math.round((chartData[0]?.yes ?? 0) * 100)
  const latestYes = Math.round((chartData[chartData.length - 1]?.yes ?? 0) * 100)
  const direction = latestYes === firstYes ? 'unchanged from' : latestYes > firstYes ? 'up from' : 'down from'
  const summary = `YES probability is currently ${latestYes}% (NO ${100 - latestYes}%), ${direction} ${firstYes}% at the start of the shown period, across ${chartData.length} data points.`

  return (
    <div className="h-48" role="img" aria-label={`Market price history. ${summary}`}>
      <p className="sr-only">{summary}</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={(v) => format(new Date(v), 'MMM d')}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0.5} stroke="#666" strokeDasharray="3 3" strokeOpacity={0.4} />
          <Area
            type="monotone"
            dataKey="yes"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#yesGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
