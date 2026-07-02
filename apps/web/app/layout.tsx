import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { Providers } from '@/components/layout/providers'
import { WebVitals } from '@/components/perf/web-vitals'
import { ServiceWorkerRegister } from '@/components/perf/service-worker-register'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'MarketPips — East Africa Prediction Markets',
    template: '%s · MarketPips',
  },
  description: 'Trade on real-world outcomes. Pay with M-Pesa, MTN MoMo, and Airtel Money. Built for East Africa.',
  keywords: ['prediction market', 'M-Pesa', 'Kenya', 'East Africa', 'sports betting', 'elections', 'crypto'],
  authors: [{ name: 'MarketPips' }],
  creator: 'MarketPips',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    siteName: 'MarketPips',
    title: 'MarketPips — Predict the Future, Get Paid',
    description: 'East Africa\'s premier prediction market. Trade on elections, sports, crypto. Pay with M-Pesa.',
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
  themeColor: '#16a34a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <Providers>
          <Navbar />
          <main>{children}</main>
          <WebVitals />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  )
}
