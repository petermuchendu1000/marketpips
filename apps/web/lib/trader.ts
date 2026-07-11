// lib/trader.ts
// Pure, framework-free helpers for the trader/holder social surfaces
// (Top Holders board, hover peek, trader profile). Kept out of components so
// they're unit-testable and shared without duplication.

/** Deterministic 32-bit FNV-1a-ish hash over a string. Stable across renders. */
export function traderHash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Small deterministic PRNG (xorshift32) seeded from a 32-bit integer. */
export function traderRng(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 0x100000000
  }
}

/** HSL (h 0-360, s/l 0-100) → [r,g,b] 0-255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

/**
 * The four fixed radial-gradient anchor positions Polymarket uses for its
 * identity orbs (verified by inspecting their computed styles). Only the four
 * colours change per account — the geometry is constant, which is what gives
 * every orb the same organic "bloom from the lower-right" character.
 */
export const ORB_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [66, 77],
  [29, 97],
  [99, 86],
  [29, 88],
]

export interface TraderOrb {
  /** Stacked radial-gradient layers → CSS `background-image`. */
  image: string
  /** Darker base tone → CSS `background-color` (keeps the top from washing out). */
  base: string
}

/**
 * A deterministic Polymarket-faithful identity "orb": four stacked
 * radial-gradient layers (each a distinct hue fading to transparent at 50%)
 * over a darker base fill, all seeded from the user id. No letter/monogram —
 * the gradient itself is the identity, exactly like Polymarket. Every account
 * gets a distinct, recognizable mark with zero empty-avatar states.
 */
export function traderOrb(id: string): TraderOrb {
  const rand = traderRng(traderHash(id))
  const baseHue = Math.floor(rand() * 360)
  const layers = ORB_POSITIONS.map(([x, y], i) => {
    const hue = (baseHue + i * (70 + Math.floor(rand() * 80))) % 360
    const sat = 62 + Math.floor(rand() * 26) // 62–88%
    const lig = 46 + Math.floor(rand() * 20) // 46–66%
    const [r, g, b] = hslToRgb(hue, sat, lig)
    return `radial-gradient(at ${x}% ${y}%, rgb(${r},${g},${b}) 0px, rgba(0,0,0,0) 50%)`
  })
  const [br, bg, bb] = hslToRgb(baseHue, 42, 26)
  return { image: layers.join(', '), base: `rgb(${br},${bg},${bb})` }
}

/**
 * Back-compat convenience: the orb's `background-image` string only.
 * Prefer {@link traderOrb} so callers can also set the base `background-color`.
 */
export function traderGradient(id: string): string {
  return traderOrb(id).image
}

/** Human display name with graceful fallbacks (never a raw uuid soup). */
export function traderName(
  u: { display_name?: string | null; username?: string | null } | null | undefined,
  id: string,
): string {
  if (u?.display_name) return u.display_name
  if (u?.username) return `@${u.username}`
  return `Trader ${id.slice(0, 4)}`
}

/** "Jan 2026" style month+year for join dates; '' when unknown. */
export function joinedMonthYear(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
