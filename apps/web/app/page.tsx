// app/page.tsx - Home page
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MarketCard } from '@/components/markets/market-card'
import { MarketCardSkeleton } from '@/components/markets/market-card-skeleton'
import { HeroSection } from '@/components/layout/hero-section'
import { CategoryFilter } from '@/components/markets/category-filter'
import { StatsBar } from '@/components/layout/stats-bar'
import type { Market } from '@/types'

async function FeaturedMarkets() {
  const supabase = await createClient()

  const { data: markets } = await supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, avatar_url, username)
    `)
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('featured_order', { ascending: true })
    .limit(3)

  if (!markets?.length) return null

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">⭐ Featured Markets</h2>
        <Link href="/markets?featured=true" className="text-sm text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((market) => (
          <MarketCard key={market.id} market={market as Market} featured />
        ))}
      </div>
    </section>
  )
}

async function TrendingMarkets() {
  const supabase = await createClient()

  const { data: markets } = await supabase
    .from('markets')
    .select(`
      *,
      creator:profiles!markets_creator_id_fkey(id, display_name, avatar_url, username)
    `)
    .eq('status', 'active')
    .order('total_volume_usd', { ascending: false })
    .limit(12)

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">🔥 Trending Markets</h2>
        <Link href="/markets" className="text-sm text-primary hover:underline">
          Browse all
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {markets?.map((market) => (
          <MarketCard key={market.id} market={market as Market} />
        ))}
      </div>
    </section>
  )
}

async function PlatformStats() {
  const supabase = await createClient()

  const [marketsResult, volumeResult] = await Promise.all([
    supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('transactions').select('amount_usd').eq('type', 'bet_placed').eq('status', 'completed'),
  ])

  const activeMarkets = marketsResult.count || 0
  const totalVolume = volumeResult.data?.reduce((sum, t) => sum + (t.amount_usd || 0), 0) || 0

  return <StatsBar activeMarkets={activeMarkets} totalVolume={totalVolume} />
}

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <HeroSection />

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Platform stats */}
        <Suspense fallback={<div className="h-16 skeleton rounded-2xl mb-6" />}>
          <PlatformStats />
        </Suspense>

        {/* Category filter */}
        <CategoryFilter />

        {/* Featured markets */}
        <Suspense fallback={
          <section className="mb-8">
            <div className="h-7 w-48 skeleton mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <MarketCardSkeleton key={i} />)}
            </div>
          </section>
        }>
          <FeaturedMarkets />
        </Suspense>

        {/* Trending markets */}
        <Suspense fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <MarketCardSkeleton key={i} />)}
          </div>
        }>
          <TrendingMarkets />
        </Suspense>
      </div>
    </main>
  )
}
