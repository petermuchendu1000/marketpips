import type { Config } from 'tailwindcss'

/**
 * MarketPips — "Pip" design system Tailwind theme.
 * Colors/radii mirror app/globals.css tokens. Fonts come from next/font
 * (--font-inter UI, --font-geist-mono numerics). Green/red are DESATURATED
 * market semantics (YES/NO), never neon; brand is Pip Blue.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // Measured Polymarket type-scale tokens (globals.css @layer components).
  // Safelisted so the scale ships for adoption even before every component
  // references it. See docs/design/TYPOGRAPHY.md.
  safelist: [{ pattern: /^pm-/ }],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Brand — Pip Blue
        pip: {
          100: '#E7EEFE', 300: '#A9C0FB', 400: '#5C82F2',
          500: '#2B50E4', 600: '#1E44C9',
          // Theme-aware "pip as text" token. Maps to --pip-text: #2B50E4 in
          // light, #8FB0FA in dark, so link/icon text on the page background
          // clears WCAG AA (4.5:1) in BOTH themes (raw pip-500 is only 3.14:1
          // on the dark ink-950 surface). Use text-pip-text for on-surface text.
          text: 'var(--pip-text)',
        },
        brass: { 100: '#F7ECD4', 500: '#D9A036', 600: '#B57E22' },
        // Market semantics (desaturated). `green`/`red` kept as aliases so
        // existing text-green-*/bg-red-* utilities render on-system.
        green: { DEFAULT: '#1F9D6B', light: '#1F9D6B', dark: '#177C54', dim: 'var(--yes-tint)', faint: 'var(--yes-tint)' },
        red:   { DEFAULT: '#D1495B', light: '#D1495B', dark: '#B23446', dim: 'var(--no-tint)', faint: 'var(--no-tint)' },
        amber: { DEFAULT: '#C98A1E', light: '#D9A036', dim: 'var(--brass-100)' },
        yes:   { DEFAULT: '#1F9D6B', 700: '#177C54' },
        no:    { DEFAULT: '#D1495B', 700: '#B23446' },
        // Semantic surfaces (from CSS vars)
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        hairline: 'var(--hairline)',
        border:  'var(--hairline)',
        ink: {
          50: '#F5F7FA', 100: '#E8EBEF', 200: '#D2D7DE', 300: '#AAB2BF', 400: '#808A99',
          500: '#5A6473', 600: '#3C4453', 700: '#2A303B', 800: '#1A1F27', 900: '#111419', 950: '#0A0C10',
        },
        text: {
          primary:   'var(--text)',
          secondary: 'var(--text-2)',
          muted:     'var(--text-3)',
        },
      },
      // TEXT color overrides only (bg-/border- keep the base fill colors).
      // Semantic Yes/No as small text must clear WCAG AA 4.5:1 on every themed
      // surface; the base #1F9D6B/#D1495B only reach ~3.2-4.4:1 as text. Point
      // the text-yes/text-no utilities at the theme-aware -700 shades (via the
      // --yes-text/--no-text vars) while preserving text-yes-700/text-no-700.
      textColor: {
        yes: { DEFAULT: 'var(--yes-text)', 700: 'var(--yes-700)' },
        no: { DEFAULT: 'var(--no-text)', 700: 'var(--no-700)' },
      },
      borderRadius: {
        sm:  '8px',
        DEFAULT: '8px',
        md:  '12px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '16px',
        pill: '999px',
      },
      boxShadow: {
        e1: '0 1px 2px rgba(10,12,16,.05)',
        e2: '0 4px 16px rgba(10,12,16,.08)',
        e3: '0 16px 48px rgba(10,12,16,.16)',
        sm: '0 1px 2px rgba(10,12,16,.05)',
        DEFAULT: '0 1px 2px rgba(10,12,16,.05)',
        md: '0 4px 16px rgba(10,12,16,.08)',
        lg: '0 16px 48px rgba(10,12,16,.16)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(.2,0,0,1)',
        move: 'cubic-bezier(.4,0,.2,1)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease',
        'slide-up':  'slideUp 0.28s cubic-bezier(.2,0,0,1)',
        'scale-in':  'scaleIn 0.12s ease',
        'ticker':    'ticker 40s linear infinite',
        'shimmer':   'shimmer 1.4s ease-in-out infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        scaleIn:  { from: { transform: 'scale(0.97)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        ticker:   { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        shimmer:  { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      screens: {
        xs: '390px',
      },
    },
  },
  plugins: [],
}

export default config
