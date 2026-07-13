// components/markets/prob-lines.tsx
// ------------------------------------------------------------
// Dependency-free, server-rendered multi-line probability chart. Draws ONE
// smooth curve PER OPTION so the number of lines always equals the number of
// outcomes (Polymarket's "event" chart). Pure inline SVG — no chart lib, no
// client hooks — so it renders on the server and adds ~0 first-load JS.
//
// The y-domain is fixed to 0–100% so every curve is directly comparable
// (a 40% line always sits at the same height as another market's 40% line).
// Color is decorative; the legend / labels carry the meaning, never hue alone.
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
  /** Draw horizontal 25/50/75% gridlines + % axis labels (hero mode). */
  grid?: boolean
  /** Cap how many lines to draw (rest are dropped, ranked by current price). */
  maxLines?: number
  className?: string
  strokeWidth?: number
  /** Show a filled area under a single (binary) line. */
  fillArea?: boolean
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
}: ProbLinesProps) {
  const drawn = [...lines].sort((a, b) => b.price - a.price).slice(0, maxLines)
  if (drawn.length === 0) return null

  const padL = grid ? 34 : 4
  const padR = 8
  const padT = 8
  const padB = grid ? 20 : 6
  const w = width - padL - padR
  const h = height - padT - padB

  // Fixed 0–100% probability domain (with a small breathing margin).
  const yMin = 0
  const yMax = 1
  const span = yMax - yMin
  const yOf = (p: number) => padT + (1 - (Math.max(yMin, Math.min(yMax, p)) - yMin) / span) * h

  const maxLen = Math.max(...drawn.map((l) => l.points.length), 2)
  const xOf = (i: number, len: number) => {
    // Right-align series so their latest point shares the right edge even when
    // one option has fewer recorded points than another.
    const offset = maxLen - len
    return padL + ((i + offset) / (maxLen - 1)) * w
  }

  const gridLevels = [0.25, 0.5, 0.75]

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
                x={padL - 6}
                y={yOf(lv) + 3}
                textAnchor="end"
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
    </svg>
  )
}
