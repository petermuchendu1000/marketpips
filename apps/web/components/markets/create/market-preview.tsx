'use client'

// components/markets/create/market-preview.tsx
// Sticky live preview of the market card as it will appear, plus contextual
// guidance for the active step. Gives creators immediate feedback and keeps the
// authoring flow honest (they see exactly what they're shipping). Pip system.
import type { MarketCategory } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { CategoryIcon, IconClock, IconInfo, IconShield } from '@/components/ui/icons'

interface MarketPreviewProps {
  title: string
  category: MarketCategory | null
  yesPct: number
  tags: string[]
  closesAt: string
  step: number
}

const GUIDANCE: { title: string; body: string }[] = [
  {
    title: 'Pick a clear structure',
    body: 'Binary markets resolve to a single YES or NO. Choose the category that best fits so traders can find it.',
  },
  {
    title: 'Write a verifiable question',
    body: 'Phrase it so the answer is unambiguous at close. Set the opening probability to your honest estimate — it seeds the starting price.',
  },
  {
    title: 'Make resolution deterministic',
    body: 'Name one credible, primary source and the exact UTC cutoff. Pre-declare how ties and cancellations resolve so there is nothing to dispute.',
  },
  {
    title: 'Review before publishing',
    body: 'Check every field. User-created markets go to review before they go live; you earn a share of trading volume as the creator.',
  },
]

export function MarketPreview({ title, category, yesPct, tags, closesAt, step }: MarketPreviewProps) {
  const cat = category ? CATEGORY_LABELS[category] : null
  const noPct = 100 - yesPct
  const closeLabel = closesAt
    ? new Date(closesAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const g = GUIDANCE[step] ?? GUIDANCE[0]

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Live preview
        </span>
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-pip-100 text-pip-500">
              <CategoryIcon category={category ?? 'other'} size={15} />
            </span>
            <span className="text-xs font-medium text-text-secondary">
              {cat?.label ?? 'Choose a category'}
            </span>
          </div>

          <p className={`font-display text-[15px] leading-snug ${title ? 'text-text-primary' : 'text-text-muted'}`}>
            {title || 'Your question will appear here'}
          </p>

          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="price-yes text-sm">YES {yesPct}%</span>
              <span className="price-no text-sm">NO {noPct}%</span>
            </div>
            <div className="prob-bar">
              <div className="prob-bar-fill" style={{ width: `${yesPct}%` }} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <IconClock size={12} /> Closes {closeLabel}
            </span>
            {tags.length > 0 && (
              <span className="truncate text-xs text-text-muted">
                {tags.slice(0, 2).map((t) => `#${t}`).join(' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contextual guidance */}
      <div className="rounded-md border border-hairline bg-surface-2 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <IconInfo size={13} className="text-pip-500" /> {g.title}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{g.body}</p>
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
        <IconShield size={12} /> Markets are reviewed before they go live.
      </p>
    </div>
  )
}
