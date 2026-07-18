// lib/markets/series-color.ts
// ---------------------------------------------------------------------------
// Single source of truth for per-option series colors. A market's options are
// ranked by current price (leader first) and each is assigned a stable slot in
// the brand-led categorical palette. The SAME mapping is used everywhere an
// option is drawn — the overview multi-line chart, its legend, tooltips, the
// live endpoint dot, AND the per-option Market drawer (chart line + "% chance").
// This guarantees an option keeps ONE colour across every surface (Polymarket
// parity: leader = brand blue #1452F0, 2nd = green, 3rd = purple, …).

/** Brand-led categorical palette (also used by the allocation donut). */
export const SERIES_PALETTE = [
  'var(--pip-500)', 'var(--yes)', '#7c6cf0', '#e0973b',
  '#3aa5c2', '#c2557a', '#5b8def', '#9a8c5c',
  '#4bb37b', '#d06a4a', '#8a6cf0', '#b0983a',
] as const

/** Fallback when an id is not found in the map. */
export const SERIES_FALLBACK = 'var(--pip-500)'

/**
 * Build the id -> colour map for a set of options, ranked by price (desc).
 * `T` only needs an `id` and a `price` so callers can pass either the raw
 * MarketOption or a normalized Outcome.
 */
export function buildSeriesColorMap<T extends { id: string; price: number }>(
  options: T[],
): Map<string, string> {
  const ranked = [...options].sort((a, b) => b.price - a.price)
  const m = new Map<string, string>()
  ranked.forEach((o, i) => m.set(o.id, SERIES_PALETTE[i % SERIES_PALETTE.length]))
  return m
}

/** Convenience: the colour for one option among its siblings. */
export function seriesColorFor<T extends { id: string; price: number }>(
  optionId: string,
  options: T[],
): string {
  return buildSeriesColorMap(options).get(optionId) ?? SERIES_FALLBACK
}
