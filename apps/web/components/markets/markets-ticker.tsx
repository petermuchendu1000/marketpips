import Link from 'next/link'
import type { Market } from '@/types'

/**
 * Live market marquee — proof of liveness. Pure CSS animation (.ticker-track),
 * pauses on hover, honors prefers-reduced-motion (globals.css), edge-faded.
 * The list is duplicated once so the -50% translate loops seamlessly.
 */
export function MarketsTicker({ markets }: { markets: Market[] }) {
  if (!markets.length) return null
  const items = [...markets, ...markets]

  return (
    <div
      className="relative overflow-hidden"
      style={{ borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}
    >
      {/* edge fades */}
      <div aria-hidden className="absolute inset-y-0 left-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, var(--surface), transparent)' }} />
      <div aria-hidden className="absolute inset-y-0 right-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(270deg, var(--surface), transparent)' }} />

      <div className="ticker-track flex gap-8 py-3 w-max" aria-label="Live markets">
        {items.map((m, i) => {
          const yesPct = Math.max(1, Math.min(99, Math.round(m.yes_price * 100)))
          const leansYes = yesPct >= 50
          return (
            <Link
              key={`${m.id}-${i}`}
              href={`/markets/${m.slug}`}
              className="flex items-center gap-2.5 whitespace-nowrap text-sm"
              aria-hidden={i >= markets.length ? true : undefined}
              tabIndex={i >= markets.length ? -1 : undefined}
            >
              <span className="w-[6px] h-[6px] rounded-full flex-none" style={{ background: leansYes ? 'var(--yes)' : 'var(--no)' }} />
              <span className="max-w-[280px] truncate" style={{ color: 'var(--text)' }}>{m.title}</span>
              <span className="font-mono font-semibold" style={{ color: leansYes ? 'var(--yes-700)' : 'var(--no-700)' }}>
                {yesPct}%
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
