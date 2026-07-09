// lib/markets/btc-windows.ts
// ---------------------------------------------------------------------------
// Reads the live recurring "Bitcoin Up or Down" windows for the board pin.
//
// Each window is an ordinary active binary market tagged with
// metadata.card_kind='up_down' (see the BTC engine, migration 024). The markets
// board pins these across its first rows, in series order (5M, 15M, 30M, 1H via
// featured_order), so the short-window BTC market is always at the top.
// ---------------------------------------------------------------------------
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Market } from '@/types'

/**
 * Fetch the currently-live BTC Up/Down windows, ordered for the pin
 * (featured_order asc → 5M, 15M, 30M, 1H). Returns [] on any error so the board
 * degrades gracefully to its regular results.
 */
export async function getLiveBtcMarkets(supabase: SupabaseClient): Promise<Market[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('*')
    .eq('status', 'active')
    .contains('metadata', { card_kind: 'up_down' })
    .order('featured_order', { ascending: true })
    .order('closes_at', { ascending: true })

  if (error || !data) return []
  return data as unknown as Market[]
}
