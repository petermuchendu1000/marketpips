// lib/markets/card-options.ts
// Server helper for the Polymarket-style market card. For a set of
// multiple_choice markets, batch-load each market's TOP OPTIONS (ranked by
// probability) so the grid card can render candidate rows —
//   "<label>   NN%   [Yes] [No]"
// — with a real option id on each Yes/No pill (used to deep-link the betting
// ticket pre-armed to that candidate + side). One query for the whole page.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CardOption {
  id: string
  label: string
  /** Candidate probability in [0,1] (its Yes line for independent markets). */
  price: number
  imageUrl: string | null
}

export interface CardOptionsResult {
  /** marketId → up to `perMarket` options, highest probability first. */
  topByMarket: Map<string, CardOption[]>
  /** marketId → total option count (for the "+N more" affordance). */
  countByMarket: Map<string, number>
}

/**
 * Batch-load the top options (default 2) for the given multiple_choice market
 * ids. Pass ONLY multiple_choice ids. Returns empty maps when ids is empty.
 * market_options is public-read (RLS), so the caller's session client is fine.
 */
export async function getCardOptions(
  supabase: SupabaseClient<any, any, any>,
  marketIds: string[],
  perMarket = 2,
): Promise<CardOptionsResult> {
  const topByMarket = new Map<string, CardOption[]>()
  const countByMarket = new Map<string, number>()
  if (marketIds.length === 0) return { topByMarket, countByMarket }

  const { data } = await supabase
    .from('market_options')
    .select('id, market_id, label, price, yes_price, image_url')
    .in('market_id', marketIds)

  type Row = {
    id: string
    market_id: string
    label: string
    price: number | null
    yes_price: number | null
    image_url: string | null
  }

  // Group, then rank each market's options and keep the top `perMarket`.
  const grouped = new Map<string, CardOption[]>()
  for (const o of (data as Row[]) ?? []) {
    countByMarket.set(o.market_id, (countByMarket.get(o.market_id) ?? 0) + 1)
    // For independent lines the candidate probability is its Yes price; fall
    // back to the shared-simplex `price` otherwise.
    const price = o.yes_price ?? o.price ?? 0
    const list = grouped.get(o.market_id) ?? []
    list.push({ id: o.id, label: o.label, price, imageUrl: o.image_url })
    grouped.set(o.market_id, list)
  }
  for (const [marketId, list] of grouped) {
    list.sort((a, b) => b.price - a.price)
    topByMarket.set(marketId, list.slice(0, perMarket))
  }
  return { topByMarket, countByMarket }
}
