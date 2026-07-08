// lib/markets/outcomes.ts — canonical Outcome read-model + validation.
//
// The ONLY place in the app that knows the difference between a binary
// (YES/NO) market and a multiple_choice (N-option) market. Everything
// downstream (trading UI, portfolio, analytics, admin) consumes the
// normalized `Outcome[]` this module produces, so no other code branches
// on resolution type. Pure + deterministic → unit-testable.

export type ResolutionType = 'binary' | 'multiple_choice'

/**
 * How a multiple_choice market prices its options (migration 023):
 *   'simplex'      — one shared LMSR; option prices sum to 1 (legacy default).
 *   'independent'  — each option is its own binary Yes/No line; a candidate's
 *                    yes+no=1, but yes-prices do NOT sum to 1 (Polymarket/Kalshi).
 */
export type OptionsPricingMode = 'simplex' | 'independent'

/** Fields we read off a `markets` row (all optional/defensive). */
export interface MarketOutcomeSource {
  resolution_type?: ResolutionType | null
  yes_price?: number | null
  no_price?: number | null
  yes_volume_usd?: number | null
  no_volume_usd?: number | null
  resolved_outcome?: 'yes' | 'no' | null
  resolved_option_id?: string | null
  options_pricing_mode?: OptionsPricingMode | string | null
}

/** A `market_options` row. */
export interface MarketOptionRow {
  id: string
  label: string
  price?: number | null
  volume_usd?: number | null
  is_winner?: boolean | null
  display_order?: number | null
  image_url?: string | null
  /** Independent per-candidate binary line (migration 023). */
  yes_price?: number | null
  no_price?: number | null
}

/** Normalized, UI-ready outcome. `price` is a probability in [0,1]. */
export interface Outcome {
  id: string
  key: string
  label: string
  price: number
  volumeUsd: number
  isWinner: boolean | null
  displayOrder: number
  /** Stored CDN avatar for the outcome; NULL → monogram fallback. */
  imageUrl: string | null
  /**
   * Independent per-candidate Yes/No line prices (migration 023). Present only
   * for options of an `independent` multiple_choice market; NULL otherwise.
   * When present, `yesPrice + noPrice === 1` for THIS candidate, and `price`
   * mirrors `yesPrice` (the candidate's Yes probability).
   */
  yesPrice: number | null
  noPrice: number | null
}

export const MIN_OUTCOMES = 2
export const MAX_OUTCOMES = 12
export const MAX_LABEL_LEN = 80

export function clamp01(n: number | null | undefined): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** The pricing mode of a market's options (defaults to legacy 'simplex'). */
export function optionsPricingMode(market: MarketOutcomeSource): OptionsPricingMode {
  return market.options_pricing_mode === 'independent' ? 'independent' : 'simplex'
}

/**
 * Does this market use the independent per-candidate Yes/No model? True only
 * for a multiple_choice market explicitly migrated to 'independent' mode. The
 * feature flag (flags.independent_options) gates whether the UI/API ACT on
 * this; this predicate is purely about the stored data shape.
 */
export function isIndependentOptions(
  market: MarketOutcomeSource,
  options?: MarketOptionRow[] | null,
): boolean {
  return optionsPricingMode(market) === 'independent' && isMultiOutcome(market, options)
}

/** Is this a multiple-choice market? */
export function isMultiOutcome(
  market: MarketOutcomeSource,
  options?: MarketOptionRow[] | null,
): boolean {
  if (market.resolution_type === 'multiple_choice') return true
  // Fallback: treat >=2 stored options as multi even if the type is unset.
  return Array.isArray(options) && options.length >= MIN_OUTCOMES && market.resolution_type !== 'binary'
}

/**
 * Produce the canonical outcome list for a market.
 * - multiple_choice → mapped from `market_options`, ordered by display_order.
 * - binary          → synthesized [Yes, No] from yes_price/no_price.
 */
export function normalizeOutcomes(
  market: MarketOutcomeSource,
  options?: MarketOptionRow[] | null,
): Outcome[] {
  if (isMultiOutcome(market, options) && options && options.length > 0) {
    const resolved = market.resolved_option_id ?? null
    const independent = optionsPricingMode(market) === 'independent'
    return [...options]
      .sort(
        (a, b) =>
          (a.display_order ?? 0) - (b.display_order ?? 0) ||
          a.label.localeCompare(b.label),
      )
      .map((o, i) => {
        // Independent markets: the candidate's own binary line drives display.
        // `yes_price` is authoritative; fall back to `price`, then no = 1 - yes.
        const yesPrice = independent
          ? clamp01(o.yes_price ?? o.price ?? 0.5)
          : null
        const noPrice = independent
          ? clamp01(o.no_price ?? (yesPrice != null ? 1 - yesPrice : 0.5))
          : null
        return {
          id: o.id,
          key: o.id,
          label: o.label,
          // For independent markets `price` == the candidate's Yes probability;
          // for simplex it stays the shared-LMSR probability.
          price: independent && yesPrice != null ? yesPrice : clamp01(o.price ?? 0),
          volumeUsd: Number(o.volume_usd ?? 0),
          isWinner: o.is_winner ?? (resolved ? o.id === resolved : null),
          displayOrder: o.display_order ?? i,
          imageUrl: o.image_url ?? null,
          yesPrice,
          noPrice,
        }
      })
  }

  // Binary synthesis
  const resolved = market.resolved_outcome ?? null
  const yes = clamp01(market.yes_price ?? 0.5)
  const no = clamp01(market.no_price ?? 0.5)
  return [
    {
      id: 'yes',
      key: 'yes',
      label: 'Yes',
      price: yes,
      volumeUsd: Number(market.yes_volume_usd ?? 0),
      isWinner: resolved ? resolved === 'yes' : null,
      displayOrder: 0,
      imageUrl: null,
      yesPrice: null,
      noPrice: null,
    },
    {
      id: 'no',
      key: 'no',
      label: 'No',
      price: no,
      volumeUsd: Number(market.no_volume_usd ?? 0),
      isWinner: resolved ? resolved === 'no' : null,
      displayOrder: 1,
      imageUrl: null,
      yesPrice: null,
      noPrice: null,
    },
  ]
}

/** Normalize outcome prices into a probability distribution (Σ = 1). */
export function impliedProbabilities(outcomes: Outcome[]): number[] {
  const sum = outcomes.reduce((acc, o) => acc + o.price, 0)
  if (sum <= 0) {
    const n = outcomes.length
    return outcomes.map(() => (n > 0 ? 1 / n : 0))
  }
  return outcomes.map((o) => o.price / sum)
}

/** The current front-runner (highest price), or null for an empty set. */
export function favoriteOutcome(outcomes: Outcome[]): Outcome | null {
  if (outcomes.length === 0) return null
  return outcomes.reduce((best, o) => (o.price > best.price ? o : best), outcomes[0])
}

export interface OutcomeValidation {
  ok: boolean
  error?: string
  labels: string[]
}

/**
 * Validate user-authored option labels at market creation.
 * Trims, enforces 2..12 non-empty, length-bounded, case-insensitively
 * unique labels. Returns the cleaned label list.
 */
export function validateOutcomeLabels(rawLabels: string[]): OutcomeValidation {
  const labels = rawLabels.map((l) => (l ?? '').trim()).filter((l) => l.length > 0)

  if (labels.length < MIN_OUTCOMES) {
    return { ok: false, error: `A market needs at least ${MIN_OUTCOMES} options.`, labels }
  }
  if (labels.length > MAX_OUTCOMES) {
    return { ok: false, error: `A market can have at most ${MAX_OUTCOMES} options.`, labels }
  }
  if (labels.some((l) => l.length > MAX_LABEL_LEN)) {
    return { ok: false, error: `Option labels must be ${MAX_LABEL_LEN} characters or fewer.`, labels }
  }
  const seen = new Set<string>()
  for (const l of labels) {
    const key = l.toLowerCase()
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate option: "${l}".`, labels }
    }
    seen.add(key)
  }
  return { ok: true, labels }
}
