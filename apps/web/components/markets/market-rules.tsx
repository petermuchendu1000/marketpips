'use client'

// components/markets/market-rules.tsx
// Polymarket-parity "Rules / Market context" tabbed section for the market
// detail main column. Pip tokens only; no lucide, no emoji. Long resolution
// text is progressively disclosed with a Show more / Show less control.
import { useState } from 'react'
import { format } from 'date-fns'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { IconShield, IconInfo, IconExternalLink } from '@/components/ui/icons'

type Tab = 'rules' | 'context'

const CLAMP = 420 // characters before truncation kicks in

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > CLAMP
  const shown = open || !long ? text : `${text.slice(0, CLAMP).trimEnd()}…`
  return (
    <div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{shown}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs font-semibold text-pip-500 hover:underline"
          aria-expanded={open}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  )
}

export function MarketRules({ market }: { market: Market }) {
  const [tab, setTab] = useState<Tab>('rules')
  const category = CATEGORY_LABELS[market.category]
  const dateFmt = { day: 'numeric', month: 'short', year: 'numeric' } as const

  const tabs: { key: Tab; label: string }[] = [
    { key: 'rules', label: 'Rules' },
    { key: 'context', label: 'Market context' },
  ]

  return (
    <div className="card p-4">
      {/* Tab header (Polymarket: Rules | Market Context) */}
      <div role="tablist" aria-label="Market information" className="mb-4 flex gap-5 border-b border-hairline">
        {tabs.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'border-pip-500 text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'rules' ? (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <IconShield size={13} /> Resolution
          </h3>
          <Expandable text={market.resolution_criteria || 'Resolution criteria will be published before this market closes.'} />
          {market.resolution_source && (
            <a
              href={market.resolution_source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-pip-500 hover:underline"
            >
              <IconExternalLink size={13} /> Resolution source
            </a>
          )}
        </div>
      ) : (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <IconInfo size={13} /> About this market
          </h3>
          <Expandable text={market.description || 'No additional context provided.'} />
          <dl className="mt-3 divide-y divide-hairline border-t border-hairline">
            <Fact label="Category" value={category.label} />
            <Fact label="Created" value={format(new Date(market.created_at), 'd MMM yyyy')} />
            <Fact label="Closes" value={new Date(market.closes_at).toLocaleDateString('en-GB', dateFmt)} />
            {market.resolves_at && (
              <Fact label="Resolves by" value={new Date(market.resolves_at).toLocaleDateString('en-GB', dateFmt)} />
            )}
            {market.creator && (
              <Fact
                label="Created by"
                value={market.creator.display_name || market.creator.username || 'Anonymous'}
              />
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
