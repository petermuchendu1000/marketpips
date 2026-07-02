// lib/integrations/fx.ts — foreign-exchange rate ingestion.
//
// Source of the `update-exchange-rates` background job. Fetches live USD-base
// quotes from OpenExchangeRates (the `exchange_rates.source` default), inverts
// them into the canonical local->USD form the platform stores, and merges over
// last-known-good fallbacks so the result always covers every supported
// currency. Pure inversion/merge logic is isolated for unit testing; the
// network call is a thin, defensively-typed wrapper that never throws.

import type { CurrencyCode } from '@/types'
import { SUPPORTED_CURRENCIES, FALLBACK_USD_RATES } from '@/lib/currency'

/** How many units of a currency equal 1 USD (provider "USD-base" quote). */
export type UsdBaseRates = Partial<Record<string, number>>

export interface FxFetchResult {
  /** Complete local->USD map (every supported currency), merged over fallbacks. */
  rates: Record<CurrencyCode, number>
  /** Currencies whose rate came from the live provider (not the fallback). */
  live: CurrencyCode[]
  /** Provider identifier recorded on each upserted row. */
  source: string
}

const OER_LATEST_URL = 'https://openexchangerates.org/api/latest.json'
const DEFAULT_TIMEOUT_MS = 8000

/**
 * Invert USD-base quotes (units per USD) into local->USD rates (USD per unit),
 * restricted to supported currencies. USD maps to 1. Non-finite / non-positive
 * quotes are dropped so a bad datapoint never becomes a poisoned rate.
 *
 * Pure & side-effect free — the unit-tested core of the FX job.
 */
export function invertUsdRates(usdBase: UsdBaseRates): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {}
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === 'USD') {
      out.USD = 1
      continue
    }
    const perUsd = usdBase[code]
    if (typeof perUsd === 'number' && Number.isFinite(perUsd) && perUsd > 0) {
      // local->USD = 1 / (units per USD)
      out[code] = 1 / perUsd
    }
  }
  return out
}

/**
 * Merge live local->USD rates over the last-known-good fallbacks, guaranteeing a
 * complete map for every supported currency. Returns the merged map plus the
 * list of currencies that were actually sourced live. Pure.
 */
export function mergeWithFallback(
  live: Partial<Record<CurrencyCode, number>>,
): { rates: Record<CurrencyCode, number>; live: CurrencyCode[] } {
  const rates: Record<CurrencyCode, number> = { ...FALLBACK_USD_RATES }
  const sourced: CurrencyCode[] = []
  for (const code of SUPPORTED_CURRENCIES) {
    const v = live[code]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      rates[code] = v
      if (code !== 'USD') sourced.push(code)
    }
  }
  return { rates, live: sourced }
}

/**
 * Shape the merged rates into the row array `upsert_exchange_rates(jsonb)`
 * expects: one { from_currency, rate } per non-USD supported currency. Pure.
 */
export function toUpsertRows(
  rates: Record<CurrencyCode, number>,
): Array<{ from_currency: CurrencyCode; rate: number }> {
  return SUPPORTED_CURRENCIES.filter((c) => c !== 'USD').map((c) => ({
    from_currency: c,
    rate: rates[c],
  }))
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch live local->USD rates from OpenExchangeRates. Never throws: on missing
 * key or any provider error it returns the fallback map with `live: []`, so the
 * caller can still upsert a sane, currency-correct set and self-heal next run.
 */
export async function fetchUsdRates(
  opts?: { appId?: string; timeoutMs?: number },
): Promise<FxFetchResult> {
  const appId = opts?.appId ?? process.env.OPENEXCHANGERATES_APP_ID
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (!appId) {
    const merged = mergeWithFallback({})
    return { rates: merged.rates, live: merged.live, source: 'fallback' }
  }

  try {
    const url = `${OER_LATEST_URL}?app_id=${encodeURIComponent(appId)}&base=USD`
    const json = (await fetchJson(url, timeoutMs)) as { rates?: Record<string, number> }
    const usdBase: UsdBaseRates = json?.rates ?? {}
    const inverted = invertUsdRates(usdBase)
    const merged = mergeWithFallback(inverted)
    return {
      rates: merged.rates,
      live: merged.live,
      source: merged.live.length > 0 ? 'openexchangerates' : 'fallback',
    }
  } catch {
    const merged = mergeWithFallback({})
    return { rates: merged.rates, live: merged.live, source: 'fallback' }
  }
}
