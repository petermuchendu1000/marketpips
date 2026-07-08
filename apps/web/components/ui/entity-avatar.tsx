'use client'

// components/ui/entity-avatar.tsx
// ------------------------------------------------------------
// The single avatar primitive for markets & outcomes (company logos, people
// photos, crypto marks) — Kalshi/Polymarket-style per-market imagery.
//
// Efficiency model: a stored/explicit image is rendered as a lazy, async <img>
// (small squares don't benefit from the next/image optimiser, and a plain tag
// is robust to ANY stored host without touching next.config); if it is missing
// OR fails to load, we fall back to a deterministic monogram (initials + a
// brand colour hashed from the name) — zero network, no broken images, no CLS.
import { useState } from 'react'
import { monogram, isHttpUrl } from '@/lib/media/entity-image'

interface EntityAvatarProps {
  /** Entity name — drives initials + fallback colour, and the alt text. */
  name: string
  /** Stored/explicit image URL. Missing or broken → monogram. */
  imageUrl?: string | null
  /** Rendered square size in px. */
  size?: number
  /** Corner style: soft square (logos) or circle (people). */
  shape?: 'squircle' | 'circle'
  className?: string
}

export function EntityAvatar({
  name,
  imageUrl,
  size = 40,
  shape = 'squircle',
  className = '',
}: EntityAvatarProps) {
  const [failed, setFailed] = useState(false)
  const mono = monogram(name)
  const radius = shape === 'circle' ? '9999px' : `${Math.round(size * 0.22)}px`
  const showImage = isHttpUrl(imageUrl) && !failed

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: '0 0 auto',
  }

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl as string}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
        style={{ ...base, background: 'var(--surface-2)' }}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex select-none items-center justify-center font-semibold leading-none ${className}`}
      style={{
        ...base,
        background: mono.bg,
        color: mono.fg,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        letterSpacing: '-0.02em',
      }}
    >
      {mono.initials}
    </span>
  )
}
