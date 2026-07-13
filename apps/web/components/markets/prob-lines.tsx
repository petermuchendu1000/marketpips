// components/markets/prob-lines.tsx
// ------------------------------------------------------------
// Dependency-free, server-rendered multi-line probability chart. Draws ONE
// smooth curve PER OPTION so the number of lines always equals the number of
// outcomes (Polymarket's "event" chart). Pure inline SVG — no chart lib, no
// client hooks — so it renders on the server and adds ~0 first-load JS.
//
// By default the y-domain is fixed to 0–100% so every curve is directly
// comparable (a 40% line always sits at the same height as another market's
// 40% line). The hero opts into `autoDomain` to zoom the y-axis to the data
// range (Polymarket-style, e.g. 0–40% for a four-horse race) with a right-hand
// axis and real dated x-axis ticks. Color is decorative; the legend / labels
// carry the meaning, never hue alone.
import type { OptionLine } from '@/lib/markets/option-series'

// Brand-led categorical palette (shared with the detail-page outcomes chart).
export const LINE_PALETTE = [
  'var(--pip-500)', 'var(--yes)', '#7c6cf0', '#e0973b',
  '#3aa5c2', '#c2557a', '#5b8def', '#9a8c5c',
  '#4bb37b', '#d06a4a', '#8a6cf0', '#b0983a',
]

interface ProbLinesProps {
  lines: OptionLine[]
  binary?: boolean
  width?: number
  height?: number
  /** Draw horizontal gridlines + % axis labels (hero mode). */
  grid?: boolean
  /** Cap how many lines to draw (rest are dropped, ranked by current price). */
  maxLines?: number
  className?: string
  strokeWidth?: number
  /** Show a filled area under a single (binary) line. */
  fillArea?: boolean
  /** Zoom the y-axis to the data range (with nice ticks) instead of a fixed 0–100%. */
  autoDomain?: boolean
  /** Which side to place the % axis labels on (default 'left'). */
  axis?: 'left' | 'right'
  /** Real date labels for the x-axis (evenly distributed across the width). */
  xLabels?: string[]
}

/** Smooth Catmull-Rom-ish path (midpoint cubic bézier) for organic curves. */
function smoothPath(xy: readonly (readonly [number, number])[]): string {
  return xy.reduce((acc, [x, y], i, arr) => {
    if (i === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`
    const [x0, y0] = arr[i - 1]
    const cx = (x0 + x) / 2
    return `${acc} C ${cx.toFixed(2)} ${y0.toFixed(2)}, ${cx.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`
  }, '')
}

/** Pick a "nice" domain + tick levels (in [0,1]) covering [min,max]. */
function niceDomain(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  // Guarantee a readable minimum span so near-flat data isn't a zero-height band.
  const pad = Math.max((max - min) * 0.12, 0.03)
  let lo = Math.max(0, min - pad)
  let hi = Math.min(1, max + pad)
  const steps = [0.05, 0.1, 0.2, 0.25]
  const step = steps.find((s) => (hi - lo) / s <= 5) ?? 0.25
  lo = Math.max(0, Math.floor(lo / step) * step)
  hi = Math.min(1, Math.ceil(hi / step) * step)
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { lo, hi, ticks }
}

export function ProbLines({
  lines,
  binary = false,
  width = 640,
  height = 260,
  grid = false,
  maxLines = 8,
  className,
  strokeWidth = 2,
  fillArea = false,
  autoDomain = false,
  axis = 'left',
  xLabels,
}: ProbLinesProps) {
  const drawn = [...lines].sort((a, b) => b.price - a.price).slice(0, maxLines)
  if (drawn.length === 0) return null

  const axisRight = axis === 'right'
  const showXLabels = grid && !!xLabels && xLabels.length > 0
  const axisW = grid ? 34 : 4
  const padL = grid && !axisRight ? axisW : 4
  const padR = grid && axisRight ? axisW : 8
  const padT = 8
  const padB = showXLabels ? 22 : grid ? 20 : 6
  const w = width - padL - padR
  const h = height - padT - padB

  // Y domain: fixed 0–100% (default) or zoomed to the data range (autoDomain).
  let yMin = 0
  let yMax = 1
  let gridLevels = [0.25, 0.5, 0.75]
  if (autoDomain) {
    let dmin = 1
    let dmax = 0
    for (const l of drawn) for (const p of l.points) { if (p < dmin) dmin = p; if (p > dmax) dmax = p }
    if (dmax <= dmin) { dmin = Math.max(0, dmin - 0.05); dmax = Math.min(1, dmax + 0.05) }
    const nd = niceDomain(dmin, dmax)
    yMin = nd.lo
    yMax = nd.hi
    // Drop the extreme ticks (they hug the frame) to keep the axis uncluttered.
    gridLevels = nd.ticks
  }
  const span = yMax - yMin || 1
  const yOf = (p: number) => padT + (1 - (Math.max(yMin, Math.min(yMax, p)) - yMin) / span) * h

  const maxLen = Math.max(...drawn.map((l) => l.points.length), 2)
  const xOf = (i: number, len: number) => {
    // Right-align series so their latest point shares the right edge even when
    // one option has fewer recorded points than another.
    const offset = maxLen - len
    return padL + ((i + offset) / (maxLen - 1)) * w
  }

  const labelX = axisRight ? width - padR + 5 : padL - 6
  const labelAnchor = axisRight ? 'start' : 'end'

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Probability over time for ${drawn.map((l) => l.label).join(', ')}`}
    >
      {grid && (
        <g aria-hidden>
          {gridLevels.map((lv) => (
            <g key={lv}>
              <line
                x1={padL}
                x2={width - padR}
                y1={yOf(lv)}
                y2={yOf(lv)}
                stroke="var(--hairline)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={labelX}
                y={yOf(lv) + 3}
                textAnchor={labelAnchor}
                fontSize="9"
                fill="var(--text-3)"
                fontFamily="var(--font-mono, monospace)"
              >
                {Math.round(lv * 100)}%
              </text>
            </g>
          ))}
        </g>
      )}

      {drawn.map((line, li) => {
        const color = binary
          ? line.points[line.points.length - 1] >= line.points[0]
            ? 'var(--yes)'
            : 'var(--no)'
          : LINE_PALETTE[li % LINE_PALETTE.length]
        const xy = line.points.map((p, i) => [xOf(i, line.points.length), yOf(p)] as const)
        const d = smoothPath(xy)
        const last = xy[xy.length - 1]
        const areaD =
          fillArea && binary
            ? `${d} L ${last[0].toFixed(2)} ${(padT + h).toFixed(2)} L ${xy[0][0].toFixed(2)} ${(padT + h).toFixed(2)} Z`
            : null
        return (
          <g key={line.id || `${line.label}-${li}`}>
            {areaD && <path d={areaD} fill={color} opacity={0.1} />}
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={last[0]} cy={last[1]} r={strokeWidth + 1.5} fill={color} />
          </g>
        )
      })}

      {showXLabels && (
        <g aria-hidden>
          {xLabels!.map((lbl, i) => {
            const t = xLabels!.length > 1 ? i / (xLabels!.length - 1) : 0
            const x = padL + t * w
            const anchor = i === 0 ? 'start' : i === xLabels!.length - 1 ? 'end' : 'middle'
            return (
              <text
                key={`${lbl}-${i}`}
                x={x}
                y={height - 6}
                textAnchor={anchor}
                fontSize="9"
                fill="var(--text-3)"
                fontFamily="var(--font-mono, monospace)"
              >
                {lbl}
              </text>
            )
          })}
        </g>
      )}
    </svg>
  )
}
