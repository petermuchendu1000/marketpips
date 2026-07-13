'use client'

// components/layout/hero-carousel.tsx
// ------------------------------------------------------------
// Thin client controller for the homepage hero. It receives PRE-RENDERED server
// slides (each a full spotlight card, charts and all) and only owns the
// interaction layer — active index, pagination dots, prev/next title pills,
// autoplay (paused on hover/focus/tab-hidden), touch swipe, keyboard arrows,
// and prefers-reduced-motion. Because the slides themselves are server
// components passed as props, the heavy chart SVG stays 0 first-load JS.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons'

interface HeroCarouselProps {
  slides: React.ReactNode[]
  /** Slide titles — used for the prev/next pill labels and dot a11y. */
  titles: string[]
  /** Autoplay interval in ms (0 disables). Default 7000. */
  autoPlayMs?: number
}

export function HeroCarousel({ slides, titles, autoPlayMs = 7000 }: HeroCarouselProps) {
  const n = slides.length
  const [active, setActive] = useState(0)
  const [reduced, setReduced] = useState(false)
  const pausedRef = useRef(false)
  const dragX = useRef<number | null>(null)

  const go = useCallback((i: number) => setActive(((i % n) + n) % n), [n])
  const next = useCallback(() => go(active + 1), [active, go])
  const prev = useCallback(() => go(active - 1), [active, go])

  // Honor reduced-motion (no autoplay, no slide transition).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // Autoplay — paused on hover/focus, when reduced-motion, or the tab is hidden.
  useEffect(() => {
    if (n <= 1 || autoPlayMs <= 0 || reduced) return
    const id = window.setInterval(() => {
      if (!pausedRef.current && !document.hidden) setActive((a) => (a + 1) % n)
    }, autoPlayMs)
    return () => window.clearInterval(id)
  }, [n, autoPlayMs, reduced])

  const prevIdx = (active - 1 + n) % n
  const nextIdx = (active + 1) % n

  const pause = () => { pausedRef.current = true }
  const resume = () => { pausedRef.current = false }

  const onPointerDown = (e: React.PointerEvent) => { dragX.current = e.clientX; pause() }
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragX.current !== null) {
      const dx = e.clientX - dragX.current
      if (Math.abs(dx) > 44) (dx < 0 ? next : prev)()
      dragX.current = null
    }
    resume()
  }

  const dots = useMemo(() => Array.from({ length: n }, (_, i) => i), [n])
  if (n === 0) return null

  return (
    // The carousel region legitimately owns Left/Right arrow navigation per the
    // WAI-ARIA APG carousel pattern; the disable is scoped to that intent.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="flex flex-col gap-3"
      role="group"
      aria-roledescription="carousel"
      aria-label="Featured markets"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); next() }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      }}
    >
      {/* Slide stack — all slides occupy the same grid cell so the viewport
          auto-sizes to the tallest card (no layout jump between slides). */}
      <div
        className="grid"
        style={{ gridTemplateAreas: '"stack"' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-live="polite"
      >
        {slides.map((slide, i) => {
          const isActive = i === active
          return (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}: ${titles[i] ?? ''}`}
              aria-hidden={!isActive}
              className="min-w-0"
              style={{
                gridArea: 'stack',
                opacity: isActive ? 1 : 0,
                transform: reduced ? 'none' : isActive ? 'translateX(0)' : 'translateX(12px)',
                transition: reduced ? 'none' : 'opacity .34s var(--ease-out), transform .34s var(--ease-out)',
                pointerEvents: isActive ? 'auto' : 'none',
                visibility: isActive ? 'visible' : 'hidden',
              }}
            >
              {slide}
            </div>
          )
        })}
      </div>

      {/* Controls: pagination dots (left) + prev/next title pills (right). */}
      {n > 1 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose featured market">
            {dots.map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Show market ${i + 1}: ${titles[i] ?? ''}`}
                onClick={() => go(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === active ? 20 : 8,
                  background: i === active ? 'var(--pip-500)' : 'var(--hairline-strong)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              className="group hidden items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors sm:inline-flex"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text-3)' }}
              aria-label={`Previous: ${titles[prevIdx] ?? ''}`}
            >
              <IconChevronLeft size={13} />
              <span className="max-w-[16ch] truncate">{titles[prevIdx]}</span>
            </button>
            <button
              type="button"
              onClick={next}
              className="group hidden items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors sm:inline-flex"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text-3)' }}
              aria-label={`Next: ${titles[nextIdx] ?? ''}`}
            >
              <span className="max-w-[16ch] truncate">{titles[nextIdx]}</span>
              <IconChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
