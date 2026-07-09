'use client'

// theme-provider.tsx
// ------------------------------------------------------------
// Client theme controller (next-themes) driving the `class` strategy in
// tailwind.config.ts + the :root / .dark token sets in globals.css.
//
//   • attribute="class"      → toggles `dark` on <html> (matches Tailwind).
//   • defaultTheme="dark"    → preserves the product's institutional dark look
//                              for first-time / no-preference visitors.
//   • enableSystem           → honours the OS preference until the user makes an
//                              explicit choice, which then persists.
//   • disableTransitionOnChange → no color-token cross-fade flicker on toggle.
//
// The inline script next-themes injects sets the class before paint, so there
// is no light/dark flash on load (paired with suppressHydrationWarning on
// <html> in app/layout.tsx).
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  )
}
