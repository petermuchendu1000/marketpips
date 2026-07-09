// ============================================================
// MarketPips — Pending bet (auth round-trip continuity) · pure logic
// ------------------------------------------------------------
// A logged-out user can build an entire bet in the guided flow (Option B)
// before being asked to authenticate. The moment they tap "Place bet" we send
// them to sign-in / sign-up — and we must NOT lose the work they just did. This
// module owns the DECISIONS for that hand-off:
//
//   • serializePendingBet — snapshot the built bet into a compact, versioned
//                           string to stash in sessionStorage before redirect.
//   • parsePendingBet     — validate + freshness-check a stored snapshot on
//                           return, optionally scoped to the current market, so
//                           we only ever rehydrate a trustworthy, recent intent.
//
// Keeping this framework-free (no DOM, no Next) means the browser wiring in
// guided-bet-flow.tsx stays thin and dumb, and every rule here is unit-tested
// under vitest's `node` environment — exactly like lib/guided-bet + lib/trading.
// ============================================================

/** sessionStorage key the guided flow reads/writes for a deferred-auth bet. */
export const PENDING_BET_KEY = 'marketpips:pending-bet'

/**
 * How long a stashed bet stays restorable. Long enough to sign in or confirm an
 * email in another tab, short enough that a stale intent (prices move, wallet
 * changes) is never silently resurrected days later.
 */
export const PENDING_BET_TTL_MS = 30 * 60 * 1000 // 30 minutes

export type PendingSide = 'yes' | 'no'

/** The persisted snapshot. `v` guards against format drift across deploys. */
export interface PendingBet {
  v: 1
  marketId: string
  slug: string
  side: PendingSide
  /** Set only for multiple-choice markets (which candidate). */
  optionId?: string
  /** Stake in the user's local currency, exactly as they entered it. */
  amount: number
  currency: string
  /** Phase C: candidate trades as an independent Yes/No line. */
  independent: boolean
  /** Epoch ms at save time — drives the freshness check. */
  ts: number
}

/** The fields a caller supplies; `v`/`ts` are stamped on by the serializer. */
export type PendingBetInput = Omit<PendingBet, 'v' | 'ts'>

/**
 * Snapshot a built bet into a compact string for sessionStorage. `nowMs` is
 * injected (not read from Date.now) so the function is pure and deterministic
 * under test.
 */
export function serializePendingBet(input: PendingBetInput, nowMs: number): string {
  const bet: PendingBet = {
    v: 1,
    marketId: input.marketId,
    slug: input.slug,
    side: input.side,
    ...(input.optionId ? { optionId: input.optionId } : {}),
    amount: input.amount,
    currency: input.currency,
    independent: !!input.independent,
    ts: nowMs,
  }
  return JSON.stringify(bet)
}

export interface ParsePendingBetOptions {
  /** Current wall-clock in ms; injected for deterministic tests. */
  nowMs: number
  /** If given, the snapshot must belong to this market or it's rejected. */
  marketId?: string
  /** Override the freshness window (defaults to PENDING_BET_TTL_MS). */
  ttlMs?: number
}

/**
 * Validate + freshness-check a stored snapshot. Returns a fully-typed
 * PendingBet only when every invariant holds; otherwise `null` (fail-safe — a
 * malformed, stale, or foreign-market payload must never rehydrate a bet).
 */
export function parsePendingBet(raw: unknown, opts: ParsePendingBetOptions): PendingBet | null {
  const { nowMs, marketId, ttlMs = PENDING_BET_TTL_MS } = opts

  let obj: unknown = raw
  if (typeof raw === 'string') {
    if (raw.length === 0) return null
    try {
      obj = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof obj !== 'object' || obj === null) return null

  const b = obj as Record<string, unknown>
  if (b.v !== 1) return null
  if (typeof b.marketId !== 'string' || b.marketId.length === 0) return null
  if (typeof b.slug !== 'string' || b.slug.length === 0) return null
  if (b.side !== 'yes' && b.side !== 'no') return null
  if (b.optionId !== undefined && typeof b.optionId !== 'string') return null
  if (typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount <= 0) return null
  if (typeof b.currency !== 'string' || b.currency.length === 0) return null
  if (typeof b.independent !== 'boolean') return null
  if (typeof b.ts !== 'number' || !Number.isFinite(b.ts)) return null

  // Freshness: reject stale snapshots and clock-skewed future timestamps.
  const age = nowMs - b.ts
  if (age < 0 || age > ttlMs) return null

  // Scope: never rehydrate a bet built on a different market.
  if (marketId !== undefined && b.marketId !== marketId) return null

  return {
    v: 1,
    marketId: b.marketId,
    slug: b.slug,
    side: b.side,
    ...(b.optionId ? { optionId: b.optionId } : {}),
    amount: b.amount,
    currency: b.currency,
    independent: b.independent,
    ts: b.ts,
  }
}
