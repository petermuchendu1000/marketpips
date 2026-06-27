// app/layout.tsx - Root layout
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { QueryProvider } from '@/components/layout/query-provider'
import { Navbar } from '@/components/layout/navbar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'MarketPips — East Africa\'s Prediction Market',
    template: '%s | MarketPips',
  },
  description:
    'Trade on real-world events in East Africa. Predict outcomes in politics, sports, economics, and more. Powered by M-Pesa, MTN MoMo, and Airtel Money.',
  keywords: [
    'prediction market',
    'east africa',
    'kenya',
    'uganda',
    'tanzania',
    'rwanda',
    'betting',
    'forecasting',
    'm-pesa',
    'mtn momo',
  ],
  authors: [{ name: 'MarketPips Team' }],
  creator: 'MarketPips',
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: 'MarketPips — East Africa\'s Prediction Market',
    description: 'Trade on real-world events. Predict what happens next.',
    siteName: 'MarketPips',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MarketPips - East Africa Prediction Market',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketPips — East Africa\'s Prediction Market',
    description: 'Trade on real-world events. Predict what happens next.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #333',
                  borderRadius: '12px',
                },
                success: {
                  iconTheme: {
                    primary: '#22c55e',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
