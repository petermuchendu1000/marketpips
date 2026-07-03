import { createClient } from '@/lib/supabase/server'
import { HeroSection } from '@/components/layout/hero-section'
import { MarketCard, MarketCardSkeleton } from '@/components/markets/market-card'
import { CategoryFilter } from '@/components/markets/category-filter'
import { MarketsGrid } from '@/components/markets/markets-grid'
import type { Market } from '@/types'
import { IconFire, IconStar, IconTrendUp, IconArrowRight } from '@/components/ui/icons'
import Link from 'next/link'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = await createClient()

  const [{ data: featured }, { data: trending }, { data: recent }] = await Promise.all([
    supabase.from('markets').select('*').eq('status', 'active').eq('is_featured', true)
      .order('featured_order', { ascending: true }).limit(3),
    supabase.from('markets').select('*').eq('status', 'active').eq('is_trending', true)
      .order('total_volume_usd', { ascending: false }).limit(8),
    supabase.from('markets').select('*').eq('status', 'active')
      .order('created_at', { ascending: false }).limit(8),
  ])

  return {
    featured: (featured ?? []) as Market[],
    trending: (trending ?? []) as Market[],
    recent: (recent ?? []) as Market[],
  }
}

export default async function HomePage() {
  const { featured, trending, recent } = await getData()

  return (
    <div style={{ background: 'var(--bg)' }}>
      <HeroSection featured={featured[0] ?? trending[0] ?? recent[0] ?? null} />

      <div className="max-w-7xl mx-auto px-4 pb-20 space-y-12">

        {/* Featured markets */}
        {featured.length > 0 && (
          <section>
            <SectionHeader
              icon={<IconStar size={16} className="text-amber-light" />}
              title="Featured Markets"
              label="Editor's picks"
              href="/markets?sort=featured"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map(m => <MarketCard key={m.id} market={m} />)}
            </div>
          </section>
        )}

        {/* Trending markets */}
        <section>
          <SectionHeader
            icon={<IconFire size={16} style={{ color: '#f97316' }} />}
            title="Trending Now"
            label="Most volume in 24h"
            href="/markets?sort=volume"
          />
          {trending.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trending.map(m => <MarketCard key={m.id} market={m} />)}
            </div>
          )}
        </section>

        {/* New markets */}
        {recent.length > 0 && (
          <section>
            <SectionHeader
              icon={<IconTrendUp size={16} className="text-green-light" />}
              title="Just Added"
              label="Newest prediction markets"
              href="/markets?sort=newest"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {recent.map(m => <MarketCard key={m.id} market={m} compact />)}
            </div>
          </section>
        )}

        {/* Browse all CTA */}
        <div className="text-center pt-4">
          <Link href="/markets" className="btn btn-secondary btn-lg inline-flex">
            Browse all markets <IconArrowRight size={16} />
          </Link>
        </div>

      </div>
    </div>
  )
}

function SectionHeader({
  icon, title, label, href
}: {
  icon: React.ReactNode
  title: string
  label: string
  href: string
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          {icon}
          <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 text-xs font-semibold transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        View all <IconArrowRight size={12} />
      </Link>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl p-16 text-center"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="text-4xl mb-3">🔮</div>
      <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No markets yet</h3>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        Be the first to create a prediction market
      </p>
      <Link href="/markets/create" className="btn btn-primary">
        Create Market
      </Link>
    </div>
  )
}
