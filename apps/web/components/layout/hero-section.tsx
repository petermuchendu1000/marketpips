'use client'

// components/layout/hero-section.tsx
import Link from 'next/link'
import { TrendingUp, Shield, Smartphone } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b bg-gradient-to-br from-brand-950 via-background to-background">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #22c55e 0%, transparent 50%), radial-gradient(circle at 80% 50%, #16a34a 0%, transparent 50%)',
        }} />
      </div>

      <div className="container mx-auto px-4 max-w-7xl py-12 md:py-20 relative z-10">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium mb-6">
            🌍 East Africa&apos;s First Prediction Market
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4 leading-tight">
            Predict the Future.
            <br />
            <span className="text-primary">Get Paid.</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-8 max-w-xl leading-relaxed">
            Trade on real-world outcomes — elections, sports, economics, and more.
            Pay with M-Pesa, MTN MoMo, or Airtel Money. Built for East Africa.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              Browse Markets
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
            >
              Start Predicting →
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-6 mt-10 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />
              M-Pesa, MTN MoMo, Airtel
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Secure &amp; Transparent
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              KES · UGX · TZS · RWF
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
