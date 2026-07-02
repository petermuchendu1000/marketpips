'use client'

// components/perf/service-worker-register.tsx — registers /sw.js in production.
//
// Renders nothing. Registers the app-shell service worker after load so it never
// competes with first paint. Disabled outside production to keep dev HMR clean.

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registration failures are non-fatal
      })
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
