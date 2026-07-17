// components/markets/related-markets.tsx
// Polymarket parity (G10): the market-detail "Related" block is a COMPACT
// VERTICAL LIST, not a card grid. Each row is `icon · title · (leading outcome
// name for multi) · mini leading-probability %`, linking to the market. Heading
// reads "Related" (matching PM), and the whole block naturally hides when there
// are no same-category peers.
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { getLeadingOptions } from '@/lib/markets/leading-options'
import { hideSettling } from '@/lib/markets/settling'
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
    .limit(6)

  if (!markets?.length) return null

  // Partial `creator` select (id/display_name/username only) → bridge via
  // unknown, matching the convention in app/markets/[slug]/page.tsx.
  // Hide any active-but-past-close windows so they don't render as "Settling…".
  const typed = hideSettling(markets as unknown as Market[])
  if (!typed.length) return null

  const { leadByMarket } = await getLeadingOptions(
    supabase,
    typed.filter((m) => m.resolution_type === 'multiple_choice').map((m) => m.id),
  )

  return (
    <section aria-labelledby="related-heading">
      <h2 id="related-heading" className="mb-2 text-base font-semibold text-text-primary">
        Related
      </h2>
      <ul className="overflow-hidden rounded-md border border-hairline">
        {typed.map((market) => {
          const isMulti = market.resolution_type === 'multiple_choice'
          const lead = leadByMarket.get(market.id)
          const pct = isMulti
            ? lead
              ? Math.round(lead.price * 100)
              : null
            : Math.round((market.yes_price ?? 0) * 100)

          return (
            <li key={market.id} className="border-b border-hairline-soft last:border-b-0">
              <Link
                href={`/markets/${market.slug}`}
                className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <EntityAvatar
                  name={market.title}
                  imageUrl={market.cover_image_url}
                  size={32}
                  shape="squircle"
                  radius={6}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary group-hover:text-pip-text">
                    {market.title}
                  </span>
                  {isMulti && lead && (
                    <span className="block truncate text-xs text-text-muted">{lead.label}</span>
                  )}
                </span>
                {pct != null && (
                  <span className="flex-none text-sm font-semibold tabular-nums text-text-primary">
                    {pct}%
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
