'use client'

// Auto-generated FAQ accordion — improves comprehension for first-time traders
// and adds crawlable long-tail SEO surface. Questions/answers are derived from
// this market's own data (title, category, close date, fee) with MarketPips
// original copy. A matching FAQPage JSON-LD block is emitted server-side on the
// market page so search engines can index the same Q&A.

import { useState } from 'react'
import { IconChevronDown } from '@/components/ui/icons'

export type FaqItem = { q: string; a: string }

/** Build the market's FAQ from its data. Shared by the page (for JSON-LD). */
export function buildMarketFaq(input: {
  title: string
  isMulti: boolean
  outcomeCount: number
  closesLabel: string
  feePct: string
}): FaqItem[] {
  const { title, isMulti, outcomeCount, closesLabel, feePct } = input
  const items: FaqItem[] = [
    {
      q: `What does "${title}" mean?`,
      a: isMulti
        ? `This is a multiple-choice prediction market with ${outcomeCount} possible outcomes. Each outcome trades as its own probability between 0% and 100%; you buy shares in the outcome you believe is most likely.`
        : `This is a Yes/No prediction market. The price of Yes reflects the market's estimated probability of the event happening — a price of 65¢ implies roughly a 65% chance. Buying Yes profits if the event occurs; buying No profits if it does not.`,
    },
    {
      q: 'How do I place a bet on MarketPips?',
      a: 'Pick an outcome, enter how much you want to stake, and confirm. Prices are set automatically by our LMSR market maker, so your order always fills — larger orders move the price along the curve. You can fund your wallet with M-Pesa, MTN MoMo, Airtel Money, or PesaPal.',
    },
    {
      q: 'When and how will this market resolve?',
      a: `Trading closes on ${closesLabel}. After the outcome is known, the market is resolved against the verifiable source listed in the Rules tab. Winning shares each pay out 1 unit; losing shares expire worthless.`,
    },
    {
      q: 'What fees does MarketPips charge?',
      a: `A ${feePct} platform fee is applied per trade, a small portion of which is shared with the market creator. There are no hidden spreads — the price you see from the market maker is the price you trade at.`,
    },
    {
      q: 'Can I sell before the market resolves?',
      a: 'Yes. Positions are tradable at any time while the market is open. You can sell some or all of your shares back to the market maker at the current price to lock in profit or cut a loss before resolution.',
    },
  ]
  return items
}

function FaqRow({ item, defaultOpen }: { item: FaqItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
      >
        <span className="text-sm font-semibold text-text-primary">{item.q}</span>
        <IconChevronDown
          size={16}
          className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="pb-4 pr-6 text-sm leading-relaxed text-text-secondary">{item.a}</p>}
    </div>
  )
}

export function MarketFaq({ items }: { items: FaqItem[] }) {
  if (!items.length) return null
  return (
    <div className="card p-4">
      <h2 className="mb-1 text-sm font-semibold text-text-secondary">Frequently asked questions</h2>
      <div>
        {items.map((item, i) => (
          <FaqRow key={i} item={item} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  )
}
