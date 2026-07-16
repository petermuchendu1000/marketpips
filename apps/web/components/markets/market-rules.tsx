'use client'

// Rules / Market Context — tabbed resolution panel with progressive "Show more"
// truncation. Mirrors the two-tab pattern found on leading prediction markets
// (settlement rules vs. background context) while staying on MarketPips tokens
// and copy. Text-first, SSR-friendly content is passed in from the server page.

import { useId, useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { IconShield, IconInfo, IconExternalLink } from '@/components/ui/icons'

type TabKey = 'rules' | 'context'

/** Collapsible long-form body: clamps to `lines`, reveals in full on demand. */
function Expandable({ text, lines = 6 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false)
  // Only offer the toggle when the body is genuinely long enough to clip.
  const isLong = text.trim().length > 320
  return (
    <div>
      <p
        className="whitespace-pre-line text-sm leading-relaxed text-text-secondary"
        style={
          !open && isLong
            ? {
                display: '-webkit-box',
                WebkitLineClamp: lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs font-semibold text-pip-500 transition-colors hover:text-pip-600"
          aria-expanded={open}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export function MarketRules({
  resolutionCriteria,
  description,
  resolutionSource,
  createdBy,
  closesAt,
  resolvedAt,
  isResolved = false,
}: {
  resolutionCriteria: string
  description: string
  resolutionSource?: string | null
  /** Market author display name (moved out of the header identity strip). */
  createdBy?: string | null
  /** ISO close date — always shown in the context meta row. */
  closesAt: string
  /** ISO resolved date, when the market has settled. */
  resolvedAt?: string | null
  isResolved?: boolean
}) {
  const [tab, setTab] = useState<TabKey>('rules')
  const baseId = useId()
  const hasDescription = Boolean(description && description.trim().length > 0)

  // The context tab now ALSO carries the market's provenance (author + close /
  // resolution date) that used to sit under the title, so it is always present.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'rules', label: 'Rules', icon: <IconShield size={13} /> },
    { key: 'context', label: 'Market context', icon: <IconInfo size={13} /> },
  ]

  return (
    <div className="card p-4">
      {/* Tab bar */}
      <div role="tablist" aria-label="Market resolution details" className="mb-4 flex gap-1 border-b border-hairline">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
                active
                  ? 'border-pip-500 text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'rules' && (
        <div role="tabpanel" id={`${baseId}-panel-rules`} aria-labelledby={`${baseId}-tab-rules`}>
          <Expandable text={resolutionCriteria} />
          {resolutionSource && (
            <a
              href={resolutionSource}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-pip-500 hover:underline"
            >
              <IconExternalLink size={13} /> Resolution source
            </a>
          )}
        </div>
      )}

      {tab === 'context' && (
        <div role="tabpanel" id={`${baseId}-panel-context`} aria-labelledby={`${baseId}-tab-context`}>
          {hasDescription ? (
            <Expandable text={description} />
          ) : (
            <p className="text-sm text-text-muted">No additional context was provided for this market.</p>
          )}

          {/* Provenance + resolution source — relocated here from the header
              identity strip (keeps the top of the page lean, options higher). */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-3 text-xs text-text-muted">
            {createdBy && (
              <>
                <span>
                  by <span className="font-medium text-text-secondary">{createdBy}</span>
                </span>
                <span aria-hidden>&middot;</span>
              </>
            )}
            <span>
              {isResolved && resolvedAt
                ? `Resolved ${formatDistanceToNow(new Date(resolvedAt), { addSuffix: true })}`
                : `Closes ${format(new Date(closesAt), 'MMM d, yyyy')}`}
            </span>
            {resolutionSource && (
              <>
                <span aria-hidden>&middot;</span>
                <a
                  href={resolutionSource}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-pip-500 hover:underline"
                >
                  <IconExternalLink size={13} /> Source
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
