// ============================================================
// MarketPips — Guided bet flow (Option B) · pure logic
// ------------------------------------------------------------
// The "Guided 2-Step" checkout is a conversion-optimized re-skin of the SAME
// order economics used by the pro ticket (lib/trading). To keep the UI thin,
// dumb and testable, every non-visual decision lives here as a pure function:
//
//   • guidedStakePresets  — the one-tap chip amounts (balance-aware).
//   • guidedProgress      — endowed-progress bar % (picking a side already
//                           advances it, which measurably lifts completion).
//   • guidedStakeGate     — can we advance past the stake step? why not?
//
// These are deliberately framework-free so they run under vitest's `node`
// environment with no DOM, exactly like lib/trading + lib/lmsr.
// ============================================================

/** The two visible steps of the guided flow (side selection happens before). */
export type GuidedStep = 'stake' | 'confirm'

/** A gate result the CTA can render directly: either go, or a human reason. */
export type GuidedGate = { ok: true } | { ok: false; reason: string }

/**
 * One-tap stake chips, in ascending order and de-duplicated.
 *   • With a balance  → 10% / 25% / 50% / 100% of it (never below 1 unit),
 *     so a returning user can size a bet without typing.
 *   • Empty wallet    → sensible local-currency starters seeded from the
 *     market minimum (min ·1, ·5, ·10, ·20).
 * Mirrors the pro ticket's preset intent but centralized + tested.
 */
export function guidedStakePresets(balanceLocal: number, minBetLocal: number): number[] {
  const min = Math.max(1, Math.round(minBetLocal || 1))
  const raw =
    balanceLocal > 0
      ? [0.1, 0.25, 0.5, 1].map((f) => Math.max(min, Math.floor(balanceLocal * f)))
      : [min, min * 5, min * 10, min * 20]
  return Array.from(new Set(raw.map((n) => Math.round(n))))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
}

/**
 * Endowed-progress percentage for the guided bar. Choosing a side (done on the
 * market, before the sheet) pre-fills the bar so the task feels already begun —
 * a well-documented completion lever. Stake step ≈ 45%, confirm ≈ 85%.
 */
export function guidedProgress(step: GuidedStep, hasSelection: boolean): number {
  if (!hasSelection) return 15
  return step === 'stake' ? 45 : 85
}

/**
 * Can the user leave the stake step? Returns the first blocking reason so the
 * CTA/inline error is single-sourced. Order matters: closed → no selection →
 * empty → below-min → over-balance.
 */
export function guidedStakeGate(input: {
  isOpen: boolean
  hasSelection: boolean
  amount: number
  belowMin: boolean
  overBalance: boolean
  minLabel: string
  balanceLabel: string
}): GuidedGate {
  const { isOpen, hasSelection, amount, belowMin, overBalance, minLabel, balanceLabel } = input
  if (!isOpen) return { ok: false, reason: 'This market is closed for trading.' }
  if (!hasSelection) return { ok: false, reason: 'Choose an outcome to continue.' }
  if (!(amount > 0)) return { ok: false, reason: 'Enter how much you want to bet.' }
  if (belowMin) return { ok: false, reason: `Minimum bet is ${minLabel}.` }
  if (overBalance) return { ok: false, reason: `You only have ${balanceLabel}. Top up or lower the stake.` }
  return { ok: true }
}
