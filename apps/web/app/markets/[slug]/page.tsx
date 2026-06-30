// app/markets/[slug]/page.tsx - Market detail page
import { Suspense, cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { MarketHeader } from '@/components/markets/market-header'
import { PriceChart } from '@/components/markets/price-chart'
import { BettingPanel } from '@/components/trading/betting-panel'
import { MarketActivity } from '@/components/markets/market-activity'
import { MarketComments } from '@/components/markets/market-comments'
import { RelatedMarkets } from '@/components/markets/related-markets'
import type { Market } from '@/types'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

const getMarket = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, avatar_url, username)
    `)
    .eq('slug', slug)
    .single()
  return data as Market | null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const market = await getMarket(slug)
  if (!market) return { title: 'Market Not Found' }

  return {
    title: market.title,
    description: market.description.slice(0, 160),
    openGraph: {
      title: market.title,
      description: market.description.slice(0, 160),
      images: market.cover_image_url ? [market.cover_image_url] : [],
    },
  }
}

async function MarketPriceHistory({ marketId }: { marketId: string }) {
  const supabase = await createClient()
  const { data: history } = await supabase
    .from('price_history')
    .select('yes_price, no_price, volume_usd, recorded_at')
    .eq('market_id', marketId)
    .order('recorded_at', { ascending: true })
    .limit(200)

  return <PriceChart data={history || []} />
}

async function MarketActivityFeed({ marketId }: { marketId: string }) {
  const supabase = await createClient()
  const { data: activity } = await supabase
    .from('market_activity')
    .select(`
      *,
      user:profiles!market_activity_user_id_fkey(id, display_name, avatar_url, username)
    `)
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .limit(20)

  return <MarketActivity activity={activity || []} />
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const market = await getMarket(slug)

  if (!market) {
    notFound()
  }

  // Increment view count (fire and forget)
  const supabase = await createClient()
  supabase
    .from('markets')
    .update({ view_count: (market.view_count || 0) + 1 })
    .eq('id', market.id)
    .then(() => {})

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Main column */}
        <div className="lg:col-span-2 space-y-6">
          <MarketHeader market={market} />

          {/* Price chart */}
          <div className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              📈 Probability History
            </h3>
            <Suspense fallback={<div className="h-48 skeleton rounded-xl" />}>
              <MarketPriceHistory marketId={market.id} />
            </Suspense>
          </div>

          {/* Activity feed */}
          <div className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              ⚡ Recent Activity
            </h3>
            <Suspense fallback={<div className="space-y-3">{Array.from({length: 5}).map((_,i) => <div key={i} className="h-10 skeleton rounded" />)}</div>}>
              <MarketActivityFeed marketId={market.id} />
            </Suspense>
          </div>

          {/* Comments */}
          <MarketComments marketId={market.id} />
        </div>

        {/* Right / Sidebar */}
        <div className="space-y-4">
          {/* Betting panel - sticky on desktop */}
          <div className="lg:sticky lg:top-20">
            <BettingPanel market={market} />

            {/* Market info */}
            <div className="mt-4 rounded-2xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">📋 Resolution Criteria</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {market.resolution_criteria}
              </p>
              {market.resolution_source && (
                <a
                  href={market.resolution_source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline block"
                >
                  🔗 Resolution Source →
                </a>
              )}
            </div>

            {/* Market Stats */}
            <div className="mt-4 rounded-2xl border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">📊 Market Stats</h3>
              <dl className="space-y-2">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Total Volume</dt>
                  <dd className="font-medium">${market.total_volume_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Total Bets</dt>
                  <dd className="font-medium">{market.total_bets.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Unique Traders</dt>
                  <dd className="font-medium">{market.unique_bettors.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Closes</dt>
                  <dd className="font-medium">{new Date(market.closes_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Platform Fee</dt>
                  <dd className="font-medium">{(market.platform_fee_rate * 100).toFixed(1)}%</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Related markets */}
      <div className="mt-10">
        <RelatedMarkets marketId={market.id} category={market.category} />
      </div>
    </div>
  )
}
