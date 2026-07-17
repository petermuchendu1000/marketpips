// lib/markets/context-news.ts
// Shared types + pure formatter for the "Market Context" news feed (PM parity).
// The feed renders dated article cards, each optionally annotated with an
// outcome probability-move chip (e.g. "JD Vance jumps to 28%  +9%").

export type MoveVerb = 'rises to' | 'dips to' | 'jumps to'

export interface OutcomeMove {
  outcomeLabel: string
  verb: MoveVerb
  newProbPct: number // 0..100, may be fractional; display rounded to integer
  deltaPct: number // signed percentage-point change, e.g. +9 or -3
}

export interface MarketNewsItem {
  id: string
  headline: string
  summary: string
  sourceName: string
  sourceLogoUrl?: string | null
  publishedAt: string // ISO
  move?: OutcomeMove | null
}

/**
 * Derive a move verb from a signed percentage-point delta.
 * - deltaPct < 0        -> 'dips to'
 * - deltaPct >= 8       -> 'jumps to'
 * - otherwise (0..<8)   -> 'rises to'
 */
export function deriveVerb(deltaPct: number): MoveVerb {
  if (deltaPct < 0) return 'dips to'
  if (deltaPct >= 8) return 'jumps to'
  return 'rises to'
}

/**
 * Pure formatter for a single outcome move.
 * Uses the provided move.verb (NOT deriveVerb).
 */
export function formatMove(move: OutcomeMove): {
  text: string
  deltaLabel: string
  isUp: boolean
} {
  const text = `${move.outcomeLabel} ${move.verb} ${Math.round(move.newProbPct)}%`
  const isUp = move.deltaPct >= 0
  const sign = isUp ? '+' : '-'
  const deltaLabel = `${sign}${Math.round(Math.abs(move.deltaPct))}%`
  return { text, deltaLabel, isUp }
}
