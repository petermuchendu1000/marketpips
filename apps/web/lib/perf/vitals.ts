// lib/perf/vitals.ts — Core Web Vitals RUM: shared types, validation, sampling.
//
// Field data (RUM) complements the synthetic Lighthouse budgets. The client
// reporter (components/perf/web-vitals.tsx) collects web-vitals metrics and
// POSTs them to /api/telemetry/vitals, which validates with the schema here and
// forwards to the structured logger (Module 13). All logic in this module is
// pure so it can be unit-tested and shared by client + server.

import { z } from 'zod'

/** Metrics we collect (subset of web-vitals). */
export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const
export type VitalName = (typeof VITAL_NAMES)[number]

/** Default RUM sample rate (10%) — tune via NEXT_PUBLIC_VITALS_SAMPLE_RATE. */
export const DEFAULT_SAMPLE_RATE = 0.1

/** A single reported metric. `rating` follows web-vitals thresholds. */
export const VitalReportSchema = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().nonnegative(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  id: z.string().min(1).max(120),
  path: z.string().min(1).max(512),
  navigationType: z.string().max(40).optional(),
})

export type VitalReport = z.infer<typeof VitalReportSchema>

/** Parse & validate an incoming report body. Returns null on invalid input. */
export function parseVitalReport(input: unknown): VitalReport | null {
  const r = VitalReportSchema.safeParse(input)
  return r.success ? r.data : null
}

/**
 * Deterministic sampling decision. `rng` defaults to Math.random; injectable for
 * tests. A rate ≤ 0 disables, ≥ 1 always samples.
 */
export function shouldSample(rate: number, rng: () => number = Math.random): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false
  if (rate >= 1) return true
  return rng() < rate
}

/** Resolve the configured client sample rate (env, clamped to [0,1]). */
export function resolveSampleRate(raw?: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_SAMPLE_RATE
  return Math.min(1, Math.max(0, n))
}
