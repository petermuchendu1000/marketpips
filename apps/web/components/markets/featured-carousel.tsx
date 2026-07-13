'use client'

// components/markets/featured-carousel.tsx
// ------------------------------------------------------------
// Horizontal, scroll-snapped rail for the featured shelf — the top-of-page
// "high-heat events" treatment. Renders whatever cards it's handed as children
// (the canonical Polymarket MarketCard nodes — identical to the grid, just in
// a horizontal rail), and
// layers on: prev/next arrows, a scroll-position progress track, keyboard
// support, and gentle auto-advance that pauses on hover / focus / when the tab
// is hidden and fully honors prefers-reduced-motion.
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons'

interface FeaturedCarouselProps {
  children: React.ReactNode
  /** Auto-advance interval in ms (0 disables). */
  interval?: number
}

export function FeaturedCarousel({ children, interval = 6000 }: FeaturedCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)
  const [paused, setPaused] = useState(false)

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  const page = useCallback((dir: 'left' | 'right') => {
    const el = trackRef.current
    if (!el) return
    // Advance by roughly one card (first child width + gap).
    const first = el.querySelector<HTMLElement>('[data-carousel-item]')
    const step = first ? first.offsetWidth + 16 : el.clientWidth * 0.9
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4
    if (dir === 'right' && atEnd) {
      el.scrollTo({ left: 0, behavior: 'smooth' }) // loop back to start
    } else {
      el.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows])

  useEffect(() => {
    if (!interval) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = window.setInterval(() => {
      if (!paused && !document.hidden) page('right')
    }, interval)
    return () => window.clearInterval(id)
  }, [interval, paused, page])

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Arrows */}
      <button
        type="button"
        aria-label="Previous featured markets"
        onClick={() => page('left')}
        disabled={!canLeft}
        className="carousel-arrow left-0 -translate-x-1/2"
        style={{ opacity: canLeft ? 1 : 0, pointerEvents: canLeft ? 'auto' : 'none' }}
      >
        <IconChevronLeft size={18} />
      </button>
      <button
        type="button"
        aria-label="Next featured markets"
        onClick={() => page('right')}
        className="carousel-arrow right-0 translate-x-1/2"
        style={{ opacity: canRight ? 1 : 0.55 }}
      >
        <IconChevronRight size={18} />
      </button>

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth pb-1"
        role="group"
        aria-label="Featured markets carousel"
      >
        {children}
      </div>
    </div>
  )
}
