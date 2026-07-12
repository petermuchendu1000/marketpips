// app/markets/[slug]/page.tsx — Market detail + trading
import { Suspense, cache, type ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { MarketHeader } from '@/components/markets/market-header'
import { PriceChart } from '@/components/markets/price-chart'
import { OutcomesChart } from '@/components/markets/outcomes-chart'
import { BtcLiveChart } from '@/components/markets/btc-live-chart'
import { BettingPanel } from '@/components/trading/betting-panel'
import { GuidedBetFlow } from '@/components/trading/guided-bet-flow'
import { PmTicket } from '@/components/trading/pm-ticket'
import { CandidateList } from '@/components/trading/candidate-list'
import { MobileTradeBar } from '@/components/trading/mobile-trade-bar'
import { PositionSummary } from '@/components/trading/position-summary'
import { MarketComments } from '@/components/markets/market-comments'
import { MarketRules } from '@/components/markets/market-rules'
import { MarketFaq } from '@/components/markets/market-faq'
import { buildMarketFaq } from '@/lib/markets/faq'
import { RelatedMarkets } from '@/components/markets/related-markets'
import { normalizeOutcomes, isMultiOutcome, isIndependentOptions } from '@/lib/markets/outcomes'
import { isFeatureEnabled } from '@/lib/flags'
import { formatUSD } from '@/lib/utils'
import {
  IconTrendUp,
  IconInfo,
  IconChevronLeft,
} from '@/components/ui/icons'
import type { Market, MarketOption } from '@/types'

// Live market data — render dynamically per request (no static prerender).
export const dynamic = 'force-dynamic'

const getMarket = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('markets')
    .select(
      // NOTE: migration 020 added markets.resolved_option_id -> market_options(id),
      // which creates a SECOND relationship between these tables. PostgREST cannot
      // auto-resolve `market_options(*)` when two FKs exist, so we disambiguate with
      // the originating FK column hint. Without this, the embed errors and every
      // market detail page 404s.
      `*, creator:profiles!markets_creator_id_fkey(id, display_name, avatar_url, username), options:market_options!market_options_market_id_fkey(*)`,
    )
    .eq('slug', slug)
    .single()
  if (!data) return null
  // Options arrive unordered from the join; present them by display_order.
  const market = data as unknown as Market
  if (Array.isArray(market.options)) {
    market.options = [...market.options].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.label.localeCompare(b.label),
    )
  }
  return market
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const market = await getMarket(slug)
  if (!market) return { title: 'Market not found' }

  const description = market.description.slice(0, 160)
  return {
    title: market.title,
    description,
    openGraph: {
      title: market.title,
      description,
      type: 'article',
      images: market.cover_image_url ? [market.cover_image_url] : [],
    },
    twitter: { card: 'summary_large_image', title: market.title, description },
  }
}

async function MarketPriceHistory({
  marketId,
  options,
  currentYes,
  volumeUsd,
}: {
  marketId: string
  options?: MarketOption[] | null
  currentYes?: number
  volumeUsd?: number
}) {
  const supabase = await createClient()

  // Multiple-choice: one probability series per option (price_history rows are
  // keyed by market_option_id with a single `price`).
  if (options && options.length > 0) {
    const { data: history } = await supabase
      .from('price_history')
      .select('market_option_id, price, recorded_at')
      .eq('market_id', marketId)
      .not('market_option_id', 'is', null)
      .order('recorded_at', { ascending: true })
      .limit(1000)
    return (
      <OutcomesChart
        options={options.map((o) => ({ id: o.id, label: o.label, price: o.price }))}
        data={(history || []).map((h) => ({
          optionId: h.market_option_id as string,
          price: h.price ?? 0,
          recordedAt: h.recorded_at,
        }))}
      />
    )
  }

  const { data: history } = await supabase
    .from('price_history')
    .select('yes_price, no_price, volume_usd, recorded_at')
    .eq('market_id', marketId)
    .is('market_option_id', null)
    .order('recorded_at', { ascending: true })
    .limit(200)
  return <PriceChart
    currentYes={currentYes}
    volumeUsd={volumeUsd}
    data={(history || []).map((h) => ({
      yes_price: h.yes_price ?? 0,
      no_price: h.no_price ?? 0,
      volume_usd: h.volume_usd,
      recorded_at: h.recorded_at,
    }))} />
}

/** Consistent section heading with a token-styled icon chip. */
function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-secondary">
      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-pip-100 text-pip-500">{icon}</span>
      {children}
    </h2>
  )
}

function SpecRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  )
}

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ side?: string; option?: string }>
}) {
  const { slug } = await params
  const market = await getMarket(slug)
  if (!market) notFound()

  // Increment view count (fire-and-forget).
  const supabase = await createClient()
  void supabase
    .from('markets')
    .update({ view_count: (market.view_count || 0) + 1 })
    .eq('id', market.id)
    .then(() => {})

  const closesAt = new Date(market.closes_at)
  const resolvesAt = market.resolves_at ? new Date(market.resolves_at) : null
  const dateFmt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

  // Canonical outcome model — the single place the UI learns binary vs multi.
  const options = market.options ?? []
  const isMulti = isMultiOutcome(market, options)
  const outcomes = normalizeOutcomes(market, options)

  // Recurring "Bitcoin Up or Down" windows (migration 024) carry their strike
  // (reference_price) + duration in metadata and render a LIVE BTC price chart
  // instead of the probability history.
  const meta = (market.metadata ?? {}) as Record<string, unknown>
  const isUpDown = meta.card_kind === 'up_down'
  const btcReferencePrice = Number(meta.reference_price ?? 0)
  const btcWindowSeconds = Number(meta.window_seconds ?? 0)

  // Phase C: does this market trade as N independent per-candidate Yes/No lines?
  // Gated by BOTH the stored pricing mode ('independent') AND the feature-flag
  // kill-switch (flags.independent_options) — deploy ≠ release. When off, the
  // board falls back to the legacy pick-one candidate UI.
  const independent =
    isMulti &&
    isIndependentOptions(market, options) &&
    (await isFeatureEnabled(supabase, 'flags.independent_options'))

  // Beginner-first "Guided 2-Step" checkout (Option B), dark-launched behind a
  // flag so deploy ≠ release. When on, it replaces the pro ticket on the market
  // page + mobile sheet; same LMSR economics, first-timer-friendly UX.
  const guidedBets = await isFeatureEnabled(supabase, 'flags.guided_bet_flow')

  // Polymarket-style compact order ticket (dark launch). Takes precedence over
  // the guided flow when enabled; both share the same LMSR economics + API.
  const pmTicket = await isFeatureEnabled(supabase, 'flags.pm_ticket')

  // Deep-link pre-arm — a Yes/No/Up/Down tap on a market card lands here with
  // ?side=yes|no (& ?option=<id> for multi-outcome boards). We VALIDATE both
  // against this market's real data before priming the ticket so a stale or
  // hand-edited URL can never arm a phantom side/candidate: the side must be
  // exactly 'yes'|'no', and the option id (if present) must belong to a real
  // outcome of THIS market. Invalid values fall through to the component
  // defaults (Yes / front-runner) — never an error.
  const sp = await searchParams
  const initialSide: 'yes' | 'no' | undefined =
    sp.side === 'yes' || sp.side === 'no' ? sp.side : undefined
  const initialOptionId: string | undefined =
    sp.option && options.some((o) => o.id === sp.option) ? sp.option : undefined

  // SEO: structured data for the market as a Q&A / claim.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Question',
    name: market.title,
    text: market.description,
    dateCreated: market.created_at,
    answerCount: outcomes.length,
  }

  // Auto-generated FAQ (shared between the on-page accordion and JSON-LD) so the
  // crawlable answers match exactly what a human reads.
  const faqItems = buildMarketFaq({
    title: market.title,
    isMulti,
    outcomeCount: outcomes.length,
    closesLabel: closesAt.toLocaleDateString('en-GB', dateFmt),
    feePct: `${(market.platform_fee_rate * 100).toFixed(1)}%`,
  })
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div className={`mx-auto max-w-7xl px-4 pt-6 ${market.status === 'active' ? 'pb-28 lg:pb-6' : 'pb-6'}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Breadcrumb */}
      <Link
        href="/markets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-pip-500"
      >
        <IconChevronLeft size={15} /> All markets
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <MarketHeader market={market} outcomes={outcomes} isMulti={isMulti} />

          {isMulti && <CandidateList market={market} options={options} independent={independent} />}

          <div className="card p-4">
            {isUpDown && btcReferencePrice > 0 ? (
              <>
                <SectionTitle icon={<IconTrendUp size={14} />}>Live BTC price</SectionTitle>
                <BtcLiveChart
                  marketId={market.id}
                  slug={market.slug}
                  seriesKey={meta.series_key ? String(meta.series_key) : undefined}
                  referencePrice={btcReferencePrice}
                  closesAt={market.closes_at}
                  windowSeconds={btcWindowSeconds}
                  upLabel={String(meta.yes_label ?? 'Up')}
                  downLabel={String(meta.no_label ?? 'Down')}
                  status={market.status}
                />
              </>
            ) : (
              <>
                <SectionTitle icon={<IconTrendUp size={14} />}>Probability history</SectionTitle>
                <Suspense fallback={<div className="skeleton h-48 rounded-md" />}>
                  <MarketPriceHistory
                    marketId={market.id}
                    options={isMulti ? options : null}
                    currentYes={market.yes_price}
                    volumeUsd={market.total_volume_usd}
                  />
                </Suspense>
              </>
            )}
          </div>

          {/* Settlement / resolution — Rules / Market context tabs (main column
              for exact left-rail ordering: header → chart → rules → community). */}
          <MarketRules
            resolutionCriteria={market.resolution_criteria}
            description={market.description}
            resolutionSource={market.resolution_source}
          />

          {/* Community — Comments / Top holders / Positions / Activity (tabs). */}
          <MarketComments
            marketId={market.id}
            options={isMulti ? options : null}
            resolutionType={market.resolution_type}
          />

          <MarketFaq items={faqItems} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="lg:sticky lg:top-20 lg:space-y-4">
            {/* Desktop shows the inline sticky ticket. On mobile, when the
                market is open, the sticky bottom bar + sheet takes over — hide
                this instance so the ticket isn't duplicated below the fold. */}
            <div className={market.status === 'active' ? 'hidden lg:block' : ''}>
              {pmTicket ? (
                <PmTicket
                  market={market}
                  options={options}
                  independent={independent}
                  initialSide={initialSide}
                  initialOptionId={initialOptionId}
                />
              ) : guidedBets ? (
                <GuidedBetFlow
                  market={market}
                  options={options}
                  hideOptionList={isMulti}
                  independent={independent}
                  initialSide={initialSide}
                  initialOptionId={initialOptionId}
                />
              ) : (
                <BettingPanel
                  market={market}
                  options={options}
                  hideOptionList={isMulti}
                  independent={independent}
                  initialSide={initialSide}
                  initialOptionId={initialOptionId}
                />
              )}
            </div>

            {/* Real-time position & P&L (only renders when the user holds one) */}
            <PositionSummary market={market} options={options} />

            {/* Contract specs */}
            <div className="card p-4">
              <SectionTitle icon={<IconInfo size={14} />}>Contract specs</SectionTitle>
              <dl className="divide-y divide-hairline">
                <SpecRow
                  label="Type"
                  value={isMulti ? `Multiple choice · ${outcomes.length} options` : 'Binary (YES / NO)'}
                />
                <SpecRow label="Total volume" value={formatUSD(market.total_volume_usd)} />
                <SpecRow label="Liquidity" value={formatUSD(market.liquidity_pool_usd)} />
                <SpecRow label="Total bets" value={market.total_bets.toLocaleString()} />
                <SpecRow label="Unique traders" value={market.unique_bettors.toLocaleString()} />
                <SpecRow label="Closes" value={closesAt.toLocaleDateString('en-GB', dateFmt)} />
                {resolvesAt && <SpecRow label="Resolves by" value={resolvesAt.toLocaleDateString('en-GB', dateFmt)} />}
                <SpecRow label="Platform fee" value={`${(market.platform_fee_rate * 100).toFixed(1)}%`} />
                <SpecRow label="Creator reward" value={`${(market.creator_reward_rate * 100).toFixed(2)}%`} />
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <RelatedMarkets marketId={market.id} category={market.category} />
      </div>

      {/* Mobile-only sticky trade bar + bottom sheet (thumb-zone conversion). */}
      {market.status === 'active' && (
        <MobileTradeBar
          market={market}
          options={options}
          independent={independent}
          guided={guidedBets}
          pmTicket={pmTicket}
          initialSide={initialSide}
          initialOptionId={initialOptionId}
        />
      )}
    </div>
  )
}
