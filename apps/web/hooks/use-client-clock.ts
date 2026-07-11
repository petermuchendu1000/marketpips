'use client'

// hooks/use-client-clock.ts
// ---------------------------------------------------------------------------
// A hydration-safe wall clock for live, ticking UI (countdowns, "time left",
// relative timestamps).
//
// WHY THIS EXISTS
// Reading `Date.now()` directly in a component's render body produces different
// text on the server (render time) and on the client's first render (hydration
// time). React compares the two and throws:
//   "Hydration failed because the server rendered text didn't match the client"
// (see components rendering "10m 7s" vs "10m 9s").
//
// This hook returns `null` on the server AND on the first client render, so both
// agree on a neutral placeholder and hydration succeeds. Immediately after mount
// it adopts the real clock and then ticks on `intervalMs`, so the value is fully
// live — no frozen timestamps, no `suppressHydrationWarning` hacks.
//
// USAGE
//   const now = useClientClock()            // ticks every 1s, null until mounted
//   if (now == null) return <Placeholder /> // stable first paint
//   return <span>{formatCountdown(closesAt, now)}</span>
import { useEffect, useState } from 'react'

export function useClientClock(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now()) // adopt the real clock the instant we're on the client
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
