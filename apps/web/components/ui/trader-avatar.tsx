'use client'

// components/ui/trader-avatar.tsx
// ------------------------------------------------------------
// Identity avatar for PEOPLE (traders/holders). Polymarket derives a smooth,
// recognizable multi-hue gradient from the wallet address so every account has
// a distinct mark with zero empty-avatar states. We do the same from the user
// uuid: a deterministic 3-stop radial gradient (two hues + angle hashed from the
// id). A stored photo, when present, wins; a broken photo falls back to the
// gradient (never a blank). An optional verification pip overlaps the corner.
//
// Kept separate from EntityAvatar (markets/logos) on purpose: entities want
// monogram+brand-colour squares; people want circular identity gradients.
import { useState } from 'react'
import { traderGradient } from '@/lib/trader'

interface TraderAvatarProps {
  /** Stable user id — seeds the deterministic gradient. */
  id: string
  /** Optional display name — drives alt text + monogram letter. */
  name?: string | null
  /** Stored photo URL. Missing/broken → gradient. */
  imageUrl?: string | null
  /** Rendered diameter in px. */
  size?: number
  /** Show the corner verification pip. */
  verified?: boolean
  className?: string
}

export function TraderAvatar({
  id,
  name,
  imageUrl,
  size = 32,
  verified = false,
  className = '',
}: TraderAvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!imageUrl && /^https?:\/\//i.test(imageUrl) && !failed
  const letter = (name?.trim()?.[0] || '?').toUpperCase()
  const pip = Math.max(10, Math.round(size * 0.38))

  return (
    <span
      className={`relative inline-block flex-none ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl as string}
          alt={name || 'Trader avatar'}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-cover"
          style={{ background: 'var(--surface-2)' }}
        />
      ) : (
        <span
          role="img"
          aria-label={name || 'Trader avatar'}
          className="flex h-full w-full items-center justify-center rounded-full font-bold leading-none text-white"
          style={{
            backgroundImage: traderGradient(id),
            fontSize: Math.max(9, Math.round(size * 0.42)),
            textShadow: '0 1px 2px rgba(0,0,0,.25)',
          }}
        >
          {letter}
        </span>
      )}
      {verified && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2"
          style={{
            width: pip,
            height: pip,
            background: 'var(--pip-500)',
            // ring color matches the surface the avatar sits on
            ['--tw-ring-color' as string]: 'var(--surface)',
          }}
        >
          <svg width={Math.round(pip * 0.6)} height={Math.round(pip * 0.6)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
      )}
    </span>
  )
}
