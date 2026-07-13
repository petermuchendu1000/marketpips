'use client'

// components/markets/market-card-actions.tsx
// ------------------------------------------------------------
// The link/share + bookmark icon pair that sits in the top-right of the hero
// spotlight card (mirrors Polymarket's card chrome). Both actions are real and
// self-contained — no backend required:
//   • Share  → copies the market's absolute URL to the clipboard.
//   • Bookmark → toggles the slug in a localStorage watchlist ("mp:watchlist").
// Rendered above the card's overlay link (pointer-events opt back in) so the
// buttons work without navigating.
import { useEffect, useState } from 'react'
import { IconLink, IconBookmark, IconCheck } from '@/components/ui/icons'

const KEY = 'mp:watchlist'

function readList(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function MarketCardActions({ slug, title }: { slug: string; title: string }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setSaved(readList().includes(slug)) }, [slug])

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const list = readList()
    const nextSaved = !list.includes(slug)
    const next = nextSaved ? [...list, slug] : list.filter((s) => s !== slug)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setSaved(nextSaved)
  }

  const share = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const url = `${window.location.origin}/markets/${slug}`
    try {
      if (navigator.share) { await navigator.share({ title, url }); return }
      await navigator.clipboard.writeText(url)
      setCopied(true); window.setTimeout(() => setCopied(false), 1600)
    } catch { /* user cancelled / unsupported */ }
  }

  const btn =
    'pointer-events-auto grid h-8 w-8 place-items-center rounded-full transition-colors'
  const btnStyle: React.CSSProperties = {
    background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--hairline)',
  }

  return (
    <div className="pointer-events-none relative z-20 flex items-center gap-1.5">
      <button type="button" onClick={share} className={btn} style={btnStyle}
        aria-label={copied ? 'Link copied' : 'Copy link to market'} title={copied ? 'Copied!' : 'Copy link'}>
        {copied ? <IconCheck size={15} /> : <IconLink size={15} />}
      </button>
      <button type="button" onClick={toggleSave} className={btn}
        style={{ ...btnStyle, color: saved ? 'var(--pip-text)' : 'var(--text-3)' }}
        aria-pressed={saved} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
        title={saved ? 'Saved' : 'Save'}>
        <IconBookmark size={15} />
      </button>
    </div>
  )
}
