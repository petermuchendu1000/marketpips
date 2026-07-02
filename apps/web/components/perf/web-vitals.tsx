'use client'

// components/perf/web-vitals.tsx — client RUM reporter.
//
// Mounted once in the root layout. Subscribes to Core Web Vitals and posts each
// metric to /api/telemetry/vitals (sampled) using sendBeacon when available so
// reporting never blocks navigation. Renders nothing.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { onCLS, onINP, onLCP, onTTFB, onFCP, type Metric } from 'web-vitals'
import { resolveSampleRate, shouldSample, type VitalReport } from '@/lib/perf/vitals'

function send(report: VitalReport) {
  const body = JSON.stringify(report)
  const url = '/api/telemetry/vitals'
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      return
    }
  } catch {
    // fall through to fetch
  }
  void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
    () => {},
  )
}

export function WebVitals() {
  const pathname = usePathname()

  useEffect(() => {
    const rate = resolveSampleRate(process.env.NEXT_PUBLIC_VITALS_SAMPLE_RATE)
    if (!shouldSample(rate)) return

    const report = (m: Metric) => {
      send({
        name: m.name as VitalReport['name'],
        value: Math.round(m.value * 1000) / 1000,
        rating: m.rating,
        id: m.id,
        path: pathname || '/',
        navigationType: m.navigationType,
      })
    }

    onCLS(report)
    onINP(report)
    onLCP(report)
    onTTFB(report)
    onFCP(report)
  }, [pathname])

  return null
}
