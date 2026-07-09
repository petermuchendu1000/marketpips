// lib/markets/btc-price.ts
// ---------------------------------------------------------------------------
// Server-side BTC/USD spot price with a resilient, key-less fallback chain.
//
// The recurring "Bitcoin Up or Down" engine samples this every minute. We try
// several free, generous, public endpoints in order until one returns a sane
// positive number, so a single provider outage never stalls the engine.
// Binance is intentionally omitted — it returns HTTP 451 from many regions.
// ---------------------------------------------------------------------------

export interface BtcSpot {
  /** BTC/USD spot price. */
  price: number
  /** Which provider answered (for the oracle audit trail). */
  source: string
}

const TIMEOUT_MS = 6000

async function fetchJson(url: string): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

/** Coerce a string|number to a finite, strictly-positive number, else null. */
function positiveNumber(x: unknown): number | null {
  const n = typeof x === 'string' ? parseFloat(x) : typeof x === 'number' ? x : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

interface PriceSource {
  name: string
  url: string
  pick: (json: unknown) => number | null
}

// Ordered by preference: Coinbase (fast, stable) → Kraken → CoinGecko.
const SOURCES: PriceSource[] = [
  {
    name: 'coinbase',
    url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
    pick: (j) => positiveNumber((j as { data?: { amount?: unknown } })?.data?.amount),
  },
  {
    name: 'kraken',
    url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
    pick: (j) => {
      const result = (j as { result?: Record<string, { c?: unknown[] }> })?.result
      const key = result && Object.keys(result)[0]
      const last = key ? result[key]?.c?.[0] : undefined
      return positiveNumber(last)
    },
  },
  {
    name: 'coingecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    pick: (j) => positiveNumber((j as { bitcoin?: { usd?: unknown } })?.bitcoin?.usd),
  },
]

/**
 * Fetch BTC/USD spot, trying each source until one succeeds.
 * @throws if every source fails or returns an unparseable payload.
 */
export async function fetchBtcSpot(): Promise<BtcSpot> {
  const errors: string[] = []
  for (const source of SOURCES) {
    try {
      const json = await fetchJson(source.url)
      const price = source.pick(json)
      if (price != null) return { price, source: source.name }
      errors.push(`${source.name}: unparseable payload`)
    } catch (e) {
      errors.push(`${source.name}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }
  throw new Error(`All BTC price sources failed — ${errors.join('; ')}`)
}
