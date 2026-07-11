'use client'

// components/ui/theme-toggle.tsx
// ------------------------------------------------------------
// Navbar light/dark switch. A single icon button that flips the next-themes
// value between 'light' and 'dark' (resolvedTheme covers the 'system' case, so
// the first tap always does the visually-expected thing). The icon crossfades
// moon ⇄ sun with a small rotate/scale so the change feels intentional, never
// gimmicky.
//
// SSR-safe: theme is unknown on the server, so we render a neutral, correctly
// sized placeholder until mounted to avoid a hydration mismatch and layout
// shift. Fully labelled + keyboard-operable (it is a native <button>).
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { IconSun, IconMoon } from '@/components/ui/icons'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  // Until mounted the theme is unknown on the server, so keep the accessible
  // label/title neutral and identical on both the server render and the first
  // client render. Deriving it from `isDark` before mount makes the server
  // (theme undefined -> "Switch to dark mode") disagree with a dark-theme
  // client ("Switch to light mode"), which is the hydration-attribute mismatch
  // React was warning about. Once mounted we swap to the real, theme-aware label.
  const label = !mounted
    ? 'Toggle theme'
    : isDark
      ? 'Switch to light mode'
      : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pip-500)] ${className}`}
      aria-label={label}
      title={label}
    >
      {/* Placeholder until mounted keeps the button from flashing the wrong icon. */}
      {!mounted ? (
        <span className="h-[18px] w-[18px]" aria-hidden />
      ) : (
        <span className="relative block h-[18px] w-[18px]" aria-hidden>
          {/* Icon reflects the CURRENT theme: moon in dark, sun in light. */}
          <IconMoon
            size={18}
            className={`absolute inset-0 transition-all duration-300 ${
              isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
            }`}
          />
          <IconSun
            size={18}
            className={`absolute inset-0 transition-all duration-300 ${
              isDark ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
        </span>
      )}
    </button>
  )
}
