import { createClient } from '@/lib/supabase/server'
import { HeroSection } from '@/components/layout/hero-section'
import { HomeCategoryBar } from '@/components/layout/home-category-bar'
import { MarketCard } from '@/components/markets/market-card'
import { FeaturedMarketCard } from '@/components/markets/featured-market-card'
import { FeaturedCarousel } from '@/components/markets/featured-carousel'
import { MoversRail } from '@/components/markets/movers-rail'
import { HomeExplore } from '@/components/markets/home-explore'
import { MarketsTicker } from '@/components/markets/markets-ticker'
import { getCardOptions, type CardOption } from '@/lib/markets/card-options'
import { getPriceSeries, type PriceSeries } from '@/lib/markets/price-history'
import { getOptionSeries, type MarketSeries } from '@/lib/markets/option-series'
import { hideSettling } from '@/lib/markets/settling'
import type { Market, MarketCategory } from '@/types'
import {
  IconArrowRight, IconShield, IconCheck, IconTrendUp, IconWallet,
  IconPercent, IconEye, IconMpesa, CategoryIcon,
} from '@/components/ui/icons'
import Link from 'next/link'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

const BROWSE_CATEGORIES: { key: MarketCategory; label: string }[] = [
  { key: 'politics', label: 'Politics' },
  { key: 'economics', label: 'Economy' },
  { key: 'sports', label: 'Sports' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'technology', label: 'Technology' },
  { key: 'weather', label: 'Climate' },
  { key: 'business', label: 'Business' },
  { key: 'entertainment', label: 'Culture' },
]

async function getData() {
  const supabase = await createClient()

  const [{ data: featured }, { data: trending }, { data: recent }, { data: moversPool }, { data: allActiveRaw }, active, volume] = await Promise.all([
    supabase.from('markets').select('*').eq('status', 'active').eq('is_featured', true)
      .order('featured_order', { ascending: true }).limit(3),
    supabase.from('markets').select('*').eq('status', 'active').eq('is_trending', true)
      .order('total_volume_usd', { ascending: false }).limit(8),
    supabase.from('markets').select('*').eq('status', 'active')
      .order('created_at', { ascending: false }).limit(8),
    supabase.from('markets').select('*').eq('status', 'active')
      .order('volume_24h_usd', { ascending: false, nullsFirst: false }).limit(30),
    supabase.from('markets').select('*').eq('status', 'active')
      .order('total_volume_usd', { ascending: false }).limit(120),
    supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('markets').select('total_volume_usd').eq('status', 'active').limit(1000),
  ])

  const totalVolume = (volume.data ?? []).reduce((s: number, m: { total_volume_usd: number | null }) => s + (m.total_volume_usd ?? 0), 0)

  // Drop active-but-past-close rows so a just-closed window never flashes as a
  // "Settling…" dead-end card in any of the home shelves.
  const featuredList = hideSettling((featured ?? []) as Market[])
  const trendingList = hideSettling((trending ?? []) as Market[])
  const recentList = hideSettling((recent ?? []) as Market[])
  const moversPoolList = hideSettling((moversPool ?? []) as Market[])
  const allActive = hideSettling((allActiveRaw ?? []) as Market[])

  // Per-category counts for the in-place Explore filter pills.
  const categoryCounts: Record<string, number> = { all: allActive.length }
  for (const m of allActive) categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1

  // One batched lookup of leading options across everything we'll render
  // (including the full Explore set), so multiple_choice cards show their
  // front-runner instead of a YES/NO bar.
  const allShown = [...featuredList, ...trendingList, ...recentList, ...allActive]
  const multiIds = Array.from(
    new Set(allShown.filter((m) => m.resolution_type === 'multiple_choice').map((m) => m.id)),
  )
  const { topByMarket, countByMarket } = await getCardOptions(supabase, multiIds)

  // Probability sparkline series for the featured carousel (featured + trending)
  // and the movers pool — one batched query over the union of ids.
  const seriesIds = Array.from(
    new Set([...featuredList, ...trendingList, ...moversPoolList].map((m) => m.id)),
  )
  const seriesByMarket = await getPriceSeries(supabase, seriesIds)

  // Hero spotlight + rail: per-OPTION probability series (one curve per outcome)
  // for the top featured/trending markets. Spotlight = the first, rail = next few.
  const heroPool = [...featuredList, ...trendingList].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  )
  const heroMarkets = heroPool.slice(0, 4)
  const heroSeries = await getOptionSeries(supabase, heroMarkets.map((m) => m.id))

  // Biggest movers: markets whose implied probability shifted the most (either
  // direction) over the recorded window, ranked by absolute change.
  const movers = moversPoolList
    .map((m) => ({ market: m, change: seriesByMarket.get(m.id)?.changePct ?? 0 }))
    .filter((x) => Math.abs(x.change) >= 1)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6)

  // Hot topics: highest 24h dollar volume right now.
  const hotTopics = [...moversPoolList]
    .filter((m) => (m.volume_24h_usd ?? 0) > 0)
    .sort((a, b) => (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0))
    .slice(0, 6)

  return {
    featured: featuredList,
    trending: trendingList,
    recent: recentList,
    activeCount: active.count ?? 0,
    totalVolume,
    topByMarket,
    countByMarket,
    seriesByMarket,
    movers,
    hotTopics,
    allActive,
    categoryCounts,
    heroMarkets,
    heroSeries,
  }
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export default async function HomePage() {
  const { featured, trending, recent, activeCount, totalVolume, topByMarket, countByMarket, seriesByMarket, movers, hotTopics, allActive, categoryCounts, heroMarkets, heroSeries } =
    await getData()

  // Build the hero spotlight (first market) + rail (next few), pairing each
  // market with its per-option probability series. Markets missing a series
  // are skipped so the hero always has real curves to draw.
  const heroItems = heroMarkets
    .map((m) => {
      const series = heroSeries.get(m.id)
      return series ? { market: m, series } : null
    })
    .filter((x): x is { market: Market; series: MarketSeries } => x !== null)
  const heroSpotlight = heroItems[0] ?? null
  const heroOthers = heroItems.slice(1, 4)

  // Client components can't receive Maps as props — flatten the option lookups
  // (only for the markets the Explore feed will render) into plain objects.
  const exploreOptions: Record<string, CardOption[]> = {}
  const exploreOptionCount: Record<string, number> = {}
  for (const m of allActive) {
    const top = topByMarket.get(m.id)
    if (top) exploreOptions[m.id] = top
    const cnt = countByMarket.get(m.id)
    if (cnt !== undefined) exploreOptionCount[m.id] = cnt
  }

  // Card props for a market: top options (grid rows) + a single front-runner
  // (the hero card) + option count, all for multiple_choice markets.
  const cardExtras = (
    m: Market,
  ): { options?: CardOption[]; leadingOption?: CardOption; optionCount?: number } => {
    const top = topByMarket.get(m.id)
    return { options: top, leadingOption: top?.[0], optionCount: countByMarket.get(m.id) }
  }

  const tickerMarkets = [...trending, ...recent]
    .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
    .slice(0, 12)

  const featuredGrid = featured.slice(0, 3)
  const trendingGrid = trending.filter(m => !featuredGrid.some(f => f.id === m.id)).slice(0, 8)

  // Carousel set: featured first, then trending fills it out (deduped, capped).
  const carouselMarkets = [...featured, ...trending]
    .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
    .slice(0, 8)

  const stats = [
    { n: activeCount > 0 ? `${activeCount}` : '—', l: 'Active markets' },
    { n: totalVolume > 0 ? `$${fmtCompact(totalVolume)}` : '—', l: 'Total volume traded' },
    { n: '7', l: 'Countries served' },
    { n: '<1%', l: 'Platform fee' },
  ]

  return (
    <div style={{ background: 'var(--bg)' }}>
      <HomeCategoryBar />
      <HeroSection spotlight={heroSpotlight} others={heroOthers} />

      {/* Live ticker */}
      {tickerMarkets.length > 0 && <MarketsTicker markets={tickerMarkets} />}

      <div className="max-w-6xl mx-auto px-5 sm:px-8">

        {/* Category browse */}
        <Section eyebrow="Browse" title="Markets across every domain">
          <div className="flex flex-wrap gap-2.5">
            {BROWSE_CATEGORIES.map(c => (
              <Link
                key={c.key}
                href={`/markets?category=${c.key}`}
                className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text)' }}
              >
                <CategoryIcon category={c.key} size={15} className="transition-colors group-hover:text-[var(--pip-text)]" style={{ color: 'var(--text-3)' }} />
                {c.label}
              </Link>
            ))}
          </div>
        </Section>

        {/* Featured markets */}
        {carouselMarkets.length > 0 && (
          <Section eyebrow="Editor's picks" title="Featured markets" href="/markets?sort=featured">
            <FeaturedCarousel>
              {carouselMarkets.map(m => (
                <div
                  key={m.id}
                  data-carousel-item
                  className="snap-start flex-none w-[300px] sm:w-[340px]"
                >
                  <FeaturedMarketCard
                    market={m}
                    series={seriesByMarket.get(m.id)}
                    {...cardExtras(m)}
                  />
                </div>
              ))}
            </FeaturedCarousel>
          </Section>
        )}

        {/* Breaking + Hot topics rail */}
        {(movers.length > 0 || hotTopics.length > 0) && (
          <Section eyebrow="Live now" title="Movers & hot topics" href="/markets?sort=volume">
            <MoversRail movers={movers} hotTopics={hotTopics} seriesByMarket={seriesByMarket} />
          </Section>
        )}

        {/* Explore — in-place category-filtered feed */}
        {allActive.length > 0 && (
          <Section eyebrow="Explore" title="All markets" href="/markets">
            <HomeExplore
              markets={allActive}
              options={exploreOptions}
              optionCount={exploreOptionCount}
              counts={categoryCounts}
            />
          </Section>
        )}

        {/* Trending markets */}
        <Section eyebrow="Most active · 24h" title="Trending now" href="/markets?sort=volume">
          {trendingGrid.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trendingGrid.map(m => <MarketCard key={m.id} market={m} {...cardExtras(m)} />)}
            </div>
          )}
        </Section>

        {/* Just added */}
        {recent.length > 0 && (
          <Section eyebrow="Newest" title="Just added" href="/markets?sort=newest">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {recent.slice(0, 8).map(m => <MarketCard key={m.id} market={m} compact {...cardExtras(m)} />)}
            </div>
          </Section>
        )}

        {/* How it works */}
        <section id="how-it-works" className="py-16 sm:py-24 scroll-mt-20">
          <SectionHead eyebrow="How it works" title="From question to payout in three steps" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: '01', h: 'Read the probability', p: 'Every market shows a live price between 0 and 100% — the market’s best estimate that an event happens. Higher price, higher implied chance.' },
              { n: '02', h: 'Take a position', p: 'Buy Yes if you think the chance is underpriced, No if it’s overpriced. Fund instantly with M-Pesa, MTN MoMo or Airtel Money.' },
              { n: '03', h: 'Get paid on resolution', p: 'When the outcome is known and verified against a public source, each winning share settles at KES 100. Withdraw straight back to your phone.' },
            ].map(s => (
              <div key={s.n} className="card p-6">
                <div className="w-10 h-10 rounded-lg grid place-items-center font-mono font-semibold"
                  style={{ background: 'var(--pip-100)', color: 'var(--pip-text)', border: '1px solid color-mix(in srgb, var(--pip-500) 22%, transparent)' }}>
                  {s.n}
                </div>
                <h3 className="mt-4 text-[1.15rem] font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{s.h}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed" style={{ color: 'var(--text-2)' }}>{s.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plain-language LMSR pricing */}
        <section className="py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <SectionHead eyebrow="Fair pricing" title="Prices set by a market maker, not a bookie" align="left" />
              <p className="text-[1.02rem] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                MarketPips uses an <strong style={{ color: 'var(--text)' }}>LMSR</strong> automated market maker.
                There’s always instant liquidity, the price moves smoothly with demand, and the
                platform never trades against you. What you see is the crowd’s real, live estimate.
              </p>
              <div className="mt-8 card p-2">
                {[
                  { icon: <IconPercent size={18} />, t: 'Price = probability', s: 'A share at 62¢ means the market implies a 62% chance.' },
                  { icon: <IconTrendUp size={18} />, t: 'Always liquid', s: 'Buy or sell any size at a fair, continuous price.' },
                  { icon: <IconShield size={18} />, t: 'No house edge', s: 'The maker is neutral. Only a small, visible fee applies.' },
                ].map((r, i, a) => (
                  <div key={r.t} className="flex items-center gap-4 p-4"
                    style={i < a.length - 1 ? { borderBottom: '1px solid var(--hairline)' } : undefined}>
                    <span className="w-11 h-11 flex-none rounded-lg grid place-items-center" style={{ background: 'var(--surface-2)', color: 'var(--pip-text)' }}>{r.icon}</span>
                    <div>
                      <strong className="block font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{r.t}</strong>
                      <span className="text-sm" style={{ color: 'var(--text-2)' }}>{r.s}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <LmsrVisual />
          </div>
        </section>

        {/* Trust & transparency */}
        <section className="py-16 sm:py-24">
          <SectionHead eyebrow="Trust" title="Built to institutional standards" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: <IconShield size={20} />, h: 'Regulated & KYC-protected', p: 'Tiered identity verification and responsible-play controls — limits, cooldowns and self-exclusion — are first-class, not afterthoughts.' },
              { icon: <IconEye size={20} />, h: 'Transparent resolution', p: 'Every market states its resolution source and criteria up front. Outcomes are verified against public data and fully auditable.' },
              { icon: <IconMpesa size={20} />, h: 'Your money, your control', p: 'Funds are segregated. Deposit and withdraw instantly with M-Pesa, MTN MoMo and Airtel Money in your local currency.' },
              { icon: <IconWallet size={20} />, h: 'Clear, honest fees', p: 'A single small platform fee, shown before you trade. No spreads hidden against you, no surprise charges.' },
            ].map(t => (
              <div key={t.h} className="card p-6">
                <span className="w-11 h-11 rounded-lg grid place-items-center mb-4" style={{ background: 'var(--pip-100)', color: 'var(--pip-text)' }}>{t.icon}</span>
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{t.h}</h3>
                <p className="mt-2 text-[0.92rem] leading-relaxed" style={{ color: 'var(--text-2)' }}>{t.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="py-14 sm:py-20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map(s => (
              <div key={s.l}>
                <div className="font-mono font-semibold tracking-[-0.03em]" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: 'var(--text)' }}>{s.n}</div>
                <div className="mt-1.5 text-sm" style={{ color: 'var(--text-2)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="pb-24">
          <div className="rounded-2xl px-8 py-14 sm:py-20 text-center relative overflow-hidden"
            style={{ background: 'var(--ink-950)', color: '#F3F5F8' }}>
            <div aria-hidden className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(700px 300px at 50% 0, rgba(43,80,228,.35), transparent 65%)' }} />
            <h2 className="relative font-display font-bold tracking-[-0.02em]" style={{ fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)' }}>
              Start reading the market.
            </h2>
            <p className="relative mt-4 mx-auto max-w-[46ch]" style={{ color: 'var(--ink-300)' }}>
              Explore live markets free — no account needed. Create one in a minute to take your first position.
            </p>
            <div className="relative mt-8 flex flex-wrap gap-3 justify-center">
              <Link href="/markets" className="btn btn-primary btn-lg">Explore markets <IconArrowRight size={16} /></Link>
              <Link href="/auth/register" className="btn btn-lg" style={{ background: 'transparent', color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' }}>
                Create free account
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}

/* ---------- section primitives ---------- */

function Section({ eyebrow, title, href, children }: { eyebrow: string; title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="py-10 sm:py-12">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--pip-text)' }}>{eyebrow}</div>
          <h2 className="mt-1.5 font-display text-[1.4rem] sm:text-[1.7rem] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>
        {href && (
          <Link href={href} className="flex-none flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--pip-text)' }}>
            View all <IconArrowRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function SectionHead({ eyebrow, title, align = 'center' }: { eyebrow: string; title: string; align?: 'center' | 'left' }) {
  return (
    <div className={`mb-8 sm:mb-12 ${align === 'center' ? 'text-center mx-auto max-w-2xl' : 'max-w-xl'}`}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--pip-text)' }}>{eyebrow}</div>
      <h2 className="mt-2 font-display font-bold tracking-[-0.02em]" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.1rem)', color: 'var(--text)' }}>{title}</h2>
    </div>
  )
}

function LmsrVisual() {
  // A calm, static illustration of a smooth probability curve — brand blue, no fake labels.
  const pts = [8, 18, 14, 28, 34, 30, 46, 52, 48, 62, 70, 66]
  const w = 320, h = 200
  const step = w / (pts.length - 1)
  const y = (p: number) => h - (p / 100) * h
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Implied probability over time</span>
        <span className="font-mono text-sm font-semibold" style={{ color: 'var(--pip-text)' }}>66%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 'auto' }} aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="var(--hairline)" strokeWidth="1" />
        ))}
        <path d={area} fill="var(--pip-500)" opacity="0.09" />
        <path d={line} fill="none" stroke="var(--pip-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w} cy={y(66)} r="4" fill="var(--pip-500)" />
      </svg>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card p-14 text-center">
      <div className="w-12 h-12 rounded-lg grid place-items-center mx-auto mb-4" style={{ background: 'var(--pip-100)', color: 'var(--pip-text)' }}>
        <IconTrendUp size={22} />
      </div>
      <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No live markets yet</h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>New markets are being prepared. Check back shortly.</p>
      <Link href="/markets" className="btn btn-secondary">Browse all markets</Link>
    </div>
  )
}
