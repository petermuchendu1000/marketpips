import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Navbar } from '@/components/layout/navbar'
import { SiteFooter } from '@/components/layout/site-footer'
import { Providers } from '@/components/layout/providers'
import { WebVitals } from '@/components/perf/web-vitals'
import { ServiceWorkerRegister } from '@/components/perf/service-worker-register'

// UI typeface — refined humanist grotesque (headings + body)
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

// Numerics — Bloomberg-grade tabular monospace for prices/probabilities
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex',
  display: 'swap',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'MarketPips — East Africa Prediction Markets',
    template: '%s · MarketPips',
  },
  description: 'Trade on real-world outcomes. Pay with M-Pesa, MTN MoMo, and Airtel Money. Built for East Africa.',
  keywords: ['prediction market', 'M-Pesa', 'Kenya', 'East Africa', 'sports betting', 'elections', 'crypto'],
  // Locale-aware SEO (Module 17.4). We use cookie/profile-based locale selection
  // (no per-locale URL segment), so every language is served from the same
  // canonical URL; the hreflang map advertises the supported languages and an
  // x-default for crawlers. See docs/i18n/TRANSLATION.md §SEO for rationale.
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      sw: '/',
      fr: '/',
      am: '/',
      'x-default': '/',
    },
  },
  authors: [{ name: 'MarketPips' }],
  creator: 'MarketPips',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    siteName: 'MarketPips',
    title: 'MarketPips — The clearest view of what happens next',
    description: 'A transparent East African prediction market. Read live probabilities on elections, the economy, sports and more. KES-native, M-Pesa-ready.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'MarketPips' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketPips',
    description: 'East Africa\'s premier prediction market',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2B50E4',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Active locale + messages (next-intl, cookie/profile-based). `lang` reflects
  // the real locale for assistive tech & SEO (WCAG 3.1.1).
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className={`${hanken.variable} ${plexMono.variable} antialiased`}>
        {/* Skip-to-content: first focusable element, visible on keyboard focus (WCAG 2.4.1). */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <Navbar />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
            <SiteFooter />
            <WebVitals />
            <ServiceWorkerRegister />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
