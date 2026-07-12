// lib/__tests__/btc-chart.test.ts
// Unit coverage for the pure BTC Up/Down chart helpers (no React / network).
import { describe, it, expect } from 'vitest'
import {
  impliedUpProb,
  pickGranularity,
  isWindowClosed,
  outcomeOf,
  outcomeFromPrices,
  windowOutcome,
  pickLiveWindow,
  pickSuccessorWindow,
  pastWindows,
  candleBucketMs,
  bucketCandles,
  mergeLiveCandle,
  type SeriesWindow,
  type Pt,
  type Candle,
} from '@/lib/markets/btc-chart'

const iso = (ms: number) => new Date(ms).toISOString()

describe('impliedUpProb', () => {
  it('is 50% when spot equals the strike', () => {
    expect(impliedUpProb(64000, 64000, 300)).toBeCloseTo(50, 5)
  })

  it('leans above 50% when spot is above the strike', () => {
    expect(impliedUpProb(64100, 64000, 300)).toBeGreaterThan(50)
  })

  it('leans below 50% when spot is below the strike', () => {
    expect(impliedUpProb(63900, 64000, 300)).toBeLessThan(50)
  })

  it('saturates (but stays clamped) as time runs out with price separated', () => {
    const p = impliedUpProb(64100, 64000, 3)
    expect(p).toBeGreaterThan(80)
    expect(p).toBeLessThanOrEqual(99)
  })

  it('clamps into [1, 99]', () => {
    expect(impliedUpProb(90000, 64000, 5)).toBeLessThanOrEqual(99)
    expect(impliedUpProb(10000, 64000, 5)).toBeGreaterThanOrEqual(1)
  })

  it('is defensive against bad inputs', () => {
    expect(impliedUpProb(64000, 0, 300)).toBe(50)
    expect(impliedUpProb(NaN, 64000, 300)).toBe(50)
  })
})

describe('pickGranularity', () => {
  it('uses 60s for the short windows (5M/15M/30M/1H)', () => {
    expect(pickGranularity(300)).toBe(60)
    expect(pickGranularity(900)).toBe(60)
    expect(pickGranularity(1800)).toBe(60)
    expect(pickGranularity(3600)).toBe(60)
  })

  it('returns a supported Coinbase granularity for large windows', () => {
    const g = pickGranularity(86400)
    expect([60, 300, 900, 3600, 21600, 86400]).toContain(g)
    expect(g).toBeGreaterThan(60)
  })

  it('never exceeds a quarter of the window', () => {
    expect(pickGranularity(300)).toBeLessThanOrEqual(300 / 4 > 60 ? 300 / 4 : 60)
  })

  it('is defensive against bad inputs', () => {
    expect(pickGranularity(0)).toBe(60)
    expect(pickGranularity(-5)).toBe(60)
  })
})

describe('isWindowClosed', () => {
  const now = 1_000_000
  it('is open while active and before close', () => {
    expect(isWindowClosed('active', now + 5000, now)).toBe(false)
  })
  it('is closed once the clock reaches close (no refresh)', () => {
    expect(isWindowClosed('active', now, now)).toBe(true)
    expect(isWindowClosed('active', now - 1, now)).toBe(true)
  })
  it('is closed when the server already moved it off active', () => {
    expect(isWindowClosed('resolved', now + 5000, now)).toBe(true)
    expect(isWindowClosed('closed', now + 5000, now)).toBe(true)
  })
  it('defaults an undefined status to active', () => {
    expect(isWindowClosed(undefined, now + 5000, now)).toBe(false)
  })
})

describe('outcome helpers', () => {
  it('maps resolved_outcome to a direction', () => {
    expect(outcomeOf('yes')).toBe('up')
    expect(outcomeOf('no')).toBe('down')
    expect(outcomeOf(null)).toBeNull()
    expect(outcomeOf(undefined)).toBeNull()
  })

  it('derives an outcome from settle vs reference', () => {
    expect(outcomeFromPrices(64000, 64100)).toBe('up')
    expect(outcomeFromPrices(64000, 63900)).toBe('down')
    expect(outcomeFromPrices(64000, 64000)).toBe('up') // tie ⇒ up (settle ≥ ref)
    expect(outcomeFromPrices(null, 64000)).toBeNull()
    expect(outcomeFromPrices(64000, null)).toBeNull()
  })

  it('prefers the stored flag, falls back to prices', () => {
    expect(windowOutcome({ resolvedOutcome: 'no', referencePrice: 1, settlePrice: 2 })).toBe('down')
    expect(windowOutcome({ resolvedOutcome: null, referencePrice: 100, settlePrice: 120 })).toBe('up')
    expect(windowOutcome({ resolvedOutcome: null, referencePrice: null, settlePrice: null })).toBeNull()
  })
})

function w(part: Partial<SeriesWindow>): SeriesWindow {
  return {
    slug: 'x',
    status: 'active',
    closesAt: iso(0),
    windowSeconds: 300,
    label: '5M',
    ...part,
  }
}

describe('pickLiveWindow', () => {
  const now = 1_000_000
  it('returns the soonest-closing active window in the future', () => {
    const windows = [
      w({ slug: 'later', closesAt: iso(now + 60_000) }),
      w({ slug: 'soon', closesAt: iso(now + 10_000) }),
      w({ slug: 'past', closesAt: iso(now - 1000) }),
    ]
    expect(pickLiveWindow(windows, now)?.slug).toBe('soon')
  })
  it('ignores resolved rows', () => {
    const windows = [w({ slug: 'r', status: 'resolved', closesAt: iso(now + 10_000) })]
    expect(pickLiveWindow(windows, now)).toBeNull()
  })
  it('returns null when nothing is live', () => {
    expect(pickLiveWindow([], now)).toBeNull()
  })
})

describe('pickSuccessorWindow', () => {
  const now = 1_000_000
  it('prefers a live window of the same length', () => {
    const windows = [
      w({ slug: 'live-15m', windowSeconds: 900, closesAt: iso(now + 5_000) }),
      w({ slug: 'live-5m', windowSeconds: 300, closesAt: iso(now + 8_000) }),
    ]
    expect(pickSuccessorWindow(windows, 300, now)?.slug).toBe('live-5m')
  })
  it('falls back to any live window when no length match exists', () => {
    const windows = [w({ slug: 'live-15m', windowSeconds: 900, closesAt: iso(now + 5_000) })]
    expect(pickSuccessorWindow(windows, 300, now)?.slug).toBe('live-15m')
  })
  it('returns null when nothing is live', () => {
    expect(pickSuccessorWindow([], 300, now)).toBeNull()
  })
})

describe('pastWindows', () => {
  const now = 5_000_000
  it('returns resolved windows newest-first, capped', () => {
    const windows: SeriesWindow[] = [
      w({ slug: 'a', status: 'resolved', resolvedOutcome: 'yes', closesAt: iso(now - 1000) }),
      w({ slug: 'b', status: 'resolved', resolvedOutcome: 'no', closesAt: iso(now - 3000) }),
      w({ slug: 'c', status: 'resolved', resolvedOutcome: 'yes', closesAt: iso(now - 2000) }),
      w({ slug: 'live', status: 'active', closesAt: iso(now + 1000) }),
    ]
    const past = pastWindows(windows, 2)
    expect(past.map((p) => p.slug)).toEqual(['a', 'c'])
  })
  it('drops resolved rows with no derivable outcome', () => {
    const windows = [w({ slug: 'noout', status: 'resolved', resolvedOutcome: null })]
    expect(pastWindows(windows)).toHaveLength(0)
  })
})

describe('candleBucketMs', () => {
  it('splits the span into ~targetCount buckets with a floor', () => {
    expect(candleBucketMs(0, 44_000, 44)).toBe(4000) // 1000ms/bucket floored to 4000
    expect(candleBucketMs(0, 440_000, 44)).toBe(10_000)
  })
})

describe('bucketCandles', () => {
  it('produces OHLC candles from a spot series', () => {
    const open = 0
    const close = 44_000
    const points: Pt[] = [
      { t: 0, price: 100 },
      { t: 1000, price: 105 },
      { t: 2000, price: 95 },
      { t: 3000, price: 102 },
    ]
    const candles = bucketCandles(points, open, close, 44)
    expect(candles.length).toBeGreaterThan(0)
    const first = candles[0]
    expect(first.o).toBe(100)
    expect(first.c).toBe(102)
    expect(first.h).toBe(105)
    expect(first.l).toBe(95)
  })
  it('returns [] for an empty series', () => {
    expect(bucketCandles([], 0, 1000)).toEqual([])
  })
})

describe('mergeLiveCandle', () => {
  const real: Candle[] = [
    { t: 30_000, o: 100, h: 101, l: 99, c: 100 },
    { t: 90_000, o: 100, h: 102, l: 100, c: 101 },
  ]
  it('appends one live candle from points after the last real bucket', () => {
    // last real t=90_000, granularity 60s ⇒ next bucket starts at 150_000
    const live: Pt[] = [
      { t: 150_000, price: 101 },
      { t: 155_000, price: 104 },
      { t: 158_000, price: 103 },
    ]
    const merged = mergeLiveCandle(real, live, 60)
    expect(merged).toHaveLength(3)
    const tail = merged[2]
    expect(tail.o).toBe(101)
    expect(tail.c).toBe(103)
    expect(tail.h).toBe(104)
  })
  it('returns the real candles unchanged when no fresh points', () => {
    expect(mergeLiveCandle(real, [{ t: 0, price: 1 }], 60)).toBe(real)
  })
  it('returns [] when there are no real candles', () => {
    expect(mergeLiveCandle([], [{ t: 1, price: 1 }], 60)).toEqual([])
  })
})
