'use client'

// components/profile/trader-pnl-card.tsx
// ------------------------------------------------------------
// The emotional center of a trader profile (Polymarket parity): a big signed
// P&L number + a range-switched sparkline. The headline is the authoritative
// all-time P&L from the profile; the sparkline is a mark-to-market curve of the
// trader's CURRENT book over the selected range (trader_pnl_series RPC) — an
// honest "what this book was worth over time" (documented in the dossier).
// Inline SVG only — zero chart-lib bundle cost.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatUSD, formatVolume } from '@/lib/utils'

type Range = '1D' | '1W' | '1M' | '1Y' | 'YTD' | 'ALL'
const RANGES: Range[] = ['1D', '1W', '1M', '1Y', 'YTD', 'ALL']
const RANGE_LABEL: Record<Range, string> = {
  '1D': 'Past day', '1W': 'Past week', '1M': 'Past month',
  '1Y': 'Past year', YTD: 'Year to date', ALL: 'All time',
}

interface Point { bucket: string; value_usd: number }

function Sparkline({ points, positive }: { points: Point[]; positive: boolean }) {
  const W = 640
  const H = 130
  const path = useMemo(() => {
    if (points.length < 2) return null
    const ys = points.map((p) => Number(p.value_usd))
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    const span = max - min || 1
    const stepX = W / (points.length - 1)
    const coords = ys.map((y, i) => {
      const x = i * stepX
      const yy = H - 8 - ((y - min) / span) * (H - 16)
      return [x, yy] as const
    })
    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${line} L${W},${H} L0,${H} Z`
    return { line, area }
  }, [points])

  const stroke = positive ? 'var(--yes)' : 'var(--no)'
  const fill = positive ? 'var(--yes-tint)' : 'var(--no-tint)'

  if (!path) {
    return (
      <div className="flex h-[130px] items-center justify-center text-xs text-text-muted">
        Not enough price history to chart this range yet.
      </div>
    )
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[130px] w-full" preserveAspectRatio="none" role="img" aria-label="Portfolio value trend">
      <path d={path.area} fill={fill} opacity={0.6} />
      <path d={path.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function TraderPnlCard({ userId, profitLoss }: { userId: string; profitLoss: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [range, setRange] = useState<Range>('1M')
  const [points, setPoints] = useState<Point[] | null>(null)

  useEffect(() => {
    let alive = true
    setPoints(null)
    supabase
      .rpc('trader_pnl_series' as never, { p_user_id: userId, p_range: range } as never)
      .then(({ data }) => {
        if (alive) setPoints(((data as unknown) as Point[]) || [])
      })
    return () => { alive = false }
  }, [userId, range, supabase])

  const positive = profitLoss >= 0
  // Range delta from the current book curve (informational, secondary to headline).
  const delta = points && points.length >= 2
    ? Number(points[points.length - 1].value_usd) - Number(points[0].value_usd)
    : null

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Profit / Loss</p>
          <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${positive ? 'text-yes' : 'text-no'}`}>
            {positive ? '' : '−'}{formatUSD(Math.abs(profitLoss))}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">All-time · {RANGE_LABEL[range]} book trend below</p>
        </div>
        <div role="group" aria-label="Chart range" className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                range === r ? 'bg-pip-100 text-pip-text' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {points === null ? (
        <div className="skeleton h-[130px] w-full rounded-md" />
      ) : (
        <>
          <Sparkline points={points} positive={delta === null ? positive : delta >= 0} />
          {delta !== null && (
            <p className="mt-2 text-right text-xs text-text-muted">
              Book value {delta >= 0 ? 'up' : 'down'}{' '}
              <span className={delta >= 0 ? 'text-yes' : 'text-no'}>
                {formatVolume(Math.abs(delta))}
              </span>{' '}
              over {RANGE_LABEL[range].toLowerCase()}
            </p>
          )}
        </>
      )}
    </div>
  )
}
