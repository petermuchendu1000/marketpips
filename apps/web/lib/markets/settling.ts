// lib/markets/settling.ts
// ---------------------------------------------------------------------------
// A market row keeps status='active' from the moment it opens until the
// minute-boundary cron resolves it to 'resolved'. In the gap between a window's
// closes_at passing and that cron tick landing, the row is "active" but already
// past close — the UI renders it as a dead-end "Settling…" card.
//
// Recurring BTC Up/Down windows hit this constantly (they close every few
// minutes), so any browse/listing surface that fetches status='active' rows can
// briefly surface a just-closed window with no tradeable time left.
//
// The fix is a single, universally-correct post-fetch filter: drop any active
// row whose closes_at is already in the past. It's applied in getData() /
// related-markets / the markets board / the BTC pin so a settling window never
// reaches a card. Doing it post-fetch (instead of a `.gt('closes_at', now)`
// server filter) keeps the Next.js data cache friendly and avoids per-request
// query divergence. Non-active rows (resolved, closed, …) are left untouched —
// their own detail states handle them.
// ---------------------------------------------------------------------------

interface Closable {
  status?: string | null
  closes_at?: string | null
}

/**
 * True when a market is an active row that has already passed its close time —
 * i.e. it is in the transient "Settling…" limbo and should be hidden from
 * browse/listing surfaces until the resolver settles it.
 */
export function isSettling(market: Closable, nowMs: number = Date.now()): boolean {
  if (market.status !== 'active' || !market.closes_at) return false
  const closeMs = new Date(market.closes_at).getTime()
  return Number.isFinite(closeMs) && closeMs <= nowMs
}

/**
 * Remove active-but-past-close (settling) markets from a fetched list. Preserves
 * order and every non-settling row (open markets and any non-active status).
 */
export function hideSettling<T extends Closable>(markets: T[], nowMs: number = Date.now()): T[] {
  return markets.filter((m) => !isSettling(m, nowMs))
}
