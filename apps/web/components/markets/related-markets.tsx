// components/markets/related-markets.tsx
import { createClient } from '@/lib/supabase/server'
import { MarketCard } from './market-card'
import type { Market, MarketCategory } from '@/types'

interface RelatedMarketsProps {
  marketId: string
  category: MarketCategory
}

export async function RelatedMarkets({ marketId, category }: RelatedMarketsProps) {
  const supabase = await createClient()

  const { data: markets } = await supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, username)
    `)
    .eq('status', 'active')
    .eq('category', category)
    .neq('id', marketId)
    .order('total_volume_usd', { ascending: false })
    .limit(4)

  if (!markets?.length) return null

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Related Markets</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {markets.map((market) => (
          <MarketCard key={market.id} market={market as Market} compact />
        ))}
      </div>
    </section>
  )
}
