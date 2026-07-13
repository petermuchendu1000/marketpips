// lib/markets/chart-domain.ts
// ------------------------------------------------------------
// Pure, dependency-free y-axis domain helper for the probability charts.
// Extracted from prob-lines.tsx so the invariants can be unit-tested in
// isolation (see lib/__tests__/chart-domain.test.ts).
//
// Polymarket's hero/detail probability chart always draws EXACTLY 5 horizontal
// gridlines (4 equal divisions). niceDomain() zooms the y-axis to the data
// range using a "nice" step, and CRUCIALLY guarantees the chosen [lo, hi]
// fully CONTAINS [min, max] so no line (or its endpoint dot) is ever
// clamped/clipped flat against the top or bottom edge.
//
// The previous implementation floored `lo` to a step boundary and then set
// `hi = lo + 4*step`, which could leave `hi < max` (240 clipping cases were
// found by exhaustive scan over 1%-granular ranges). This version instead
// selects the smallest "nice" step whose 5-tick band provably covers the
// padded data range, guaranteeing lo <= min and hi >= max for every input.

/** Candidate step sizes (probability units) for the 4 axis divisions. */
const STEPS = [0.05, 0.1, 0.15, 0.2, 0.25] as const

export interface Domain {
  /** Lower bound of the y-axis in [0,1]. */
  lo: number
  /** Upper bound of the y-axis in [0,1]. */
  hi: number
  /** Exactly 5 tick values (lo..hi inclusive), rounded to 3 dp. */
  ticks: number[]
}

function buildDomain(lo: number, hi: number): Domain {
  const l = Math.round(lo * 1e6) / 1e6
  const h = Math.round(Math.min(hi, 1) * 1e6) / 1e6
  const ticks: number[] = []
  for (let k = 0; k <= 4; k++) ticks.push(Math.round((l + ((h - l) * k) / 4) * 1000) / 1000)
  return { lo: l, hi: h, ticks }
}

/**
 * Pick a "nice" y-domain covering [min, max] with EXACTLY 5 tick levels
 * (4 equal divisions), mirroring Polymarket's hero chart.
 *
 * Guarantees for every input in [0,1]:
 *   • lo <= min and hi >= max        (data never clips against an edge)
 *   • 0 <= lo < hi <= 1
 *   • ticks.length === 5, strictly increasing
 *   • a readable minimum span for near-flat data
 */
export function niceDomain(min: number, max: number): Domain {
  let mn = min
  let mx = max
  // Guarantee a readable minimum span so near-flat data isn't a zero-height band.
  if (mx - mn < 0.04) {
    const mid = (mn + mx) / 2
    mn = Math.max(0, mid - 0.02)
    mx = Math.min(1, mid + 0.02)
  }
  const pad = Math.max((mx - mn) * 0.12, 0.02)
  const loRaw = Math.max(0, mn - pad)
  const hiRaw = Math.min(1, mx + pad)

  for (const step of STEPS) {
    // Largest step-multiple at/below loRaw, capped so the 5th tick stays <= 1.
    let lo = Math.floor(loRaw / step + 1e-9) * step
    lo = Math.min(lo, 1 - 4 * step)
    lo = Math.max(0, lo)
    const hi = Math.min(1, lo + 4 * step)
    // Keep the smallest step whose band fully contains the padded data range.
    if (lo <= loRaw + 1e-9 && hi >= hiRaw - 1e-9) {
      return buildDomain(lo, hi)
    }
  }
  // Fallback: full [0,1] in 0.25 steps (only for pathological ranges).
  return buildDomain(0, 1)
}
