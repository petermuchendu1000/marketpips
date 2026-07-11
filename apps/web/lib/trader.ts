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

/**
 * A deterministic multi-hue radial gradient (CSS) seeded from a user id — the
 * Polymarket-style identity "orb" so every account has a distinct, recognizable
 * mark with zero empty-avatar states.
 */
export function traderGradient(id: string): string {
  const h = traderHash(id)
  const hueA = h % 360
  const hueB = (hueA + 40 + ((h >> 8) % 120)) % 360
  const angle = (h >> 16) % 360
  const c1 = `hsl(${hueA} 82% 62%)`
  const c2 = `hsl(${hueB} 78% 52%)`
  const c3 = `hsl(${(hueB + 30) % 360} 74% 44%)`
  return `radial-gradient(circle at 30% 25%, ${c1} 0%, ${c2} 55%, ${c3} 100%), linear-gradient(${angle}deg, ${c1}, ${c3})`
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
