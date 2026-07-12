// components/markets/prob-sparkline.tsx
// ------------------------------------------------------------
// A tiny, dependency-free probability trend line for featured cards. Pure SVG
// (no chart lib — keeps first-load JS within budget) and no client hooks, so it
// renders on the server. Draws a smooth area + stroke tinted by direction
// (Yes-green when the market drifted up, No-red when it drifted down). Purely
// decorative → aria-hidden; the numeric probability is announced elsewhere.
interface ProbSparklineProps {
  /** Yes-price points in [0,1], chronological (oldest first). */
  points: number[]
  width?: number
  height?: number
  className?: string
}

export function ProbSparkline({ points, width = 240, height = 56, className }: ProbSparklineProps) {
  if (!points || points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const pad = 3
  const w = width - pad * 2
  const h = height - pad * 2

  const xy = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w
    const y = pad + (1 - (p - min) / span) * h
    return [x, y] as const
  })

  // Smooth Catmull-Rom → cubic Bézier path for an organic trend curve.
  const line = xy.reduce((acc, [x, y], i, arr) => {
    if (i === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`
    const [x0, y0] = arr[i - 1]
    const cx = (x0 + x) / 2
    return `${acc} C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`
  }, '')
  const area = `${line} L ${(pad + w).toFixed(2)} ${(pad + h).toFixed(2)} L ${pad.toFixed(2)} ${(pad + h).toFixed(2)} Z`

  const up = points[points.length - 1] >= points[0]
  const stroke = up ? 'var(--yes)' : 'var(--no)'
  const gid = `spark-${up ? 'up' : 'dn'}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
      role="presentation"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
