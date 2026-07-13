// lib/__tests__/option-series.test.ts
// ------------------------------------------------------------
// Locks the endpoint-anchoring CONTRACT of getOptionSeries — the exact property
// whose apparent violation a prior session chased for a whole session before
// discovering it was stale dev-fetch cache (the data + math were correct all
// along). These tests pin it so a future refactor can't silently break it:
//
//   • binary  → single "Yes" line; legend price === market.yes_price; the last
//               plotted point === the newest recorded market-level yes_price.
//   • multi   → one line per option, ranked by current price; each line's last
//               plotted point === that option's newest recorded price; the
//               line's price === option.yes_price (the legend value).
//   • no history (<2 pts) → seeded flat line at the current price.
//
// Uses a tiny thenable fake of the Supabase query builder (from().select().in()
// [.order()]) so there is no network/db dependency.
import { describe, it, expect } from 'vitest'
import { getOptionSeries } from '@/lib/markets/option-series'

type Row = Record<string, unknown>

/** Minimal thenable query builder: select/in/order chain, resolves to {data}. */
function makeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const data = tables[table] ?? []
      const builder: any = {
        select: () => builder,
        in: () => builder,
        order: () => builder,
        then: (resolve: (v: { data: Row[] }) => unknown) => resolve({ data }),
      }
      return builder
    },
  } as any
}

describe('getOptionSeries — binary anchoring', () => {
  it('anchors the Yes line endpoint to the newest recorded yes_price and the legend to market.yes_price', async () => {
    const client = makeClient({
      markets: [{ id: 'bin', resolution_type: 'binary', yes_price: 0.46 }],
      market_options: [],
      price_history: [
        { market_id: 'bin', market_option_id: null, yes_price: 0.636, price: null, recorded_at: '2026-04-14T00:00:00Z' },
        { market_id: 'bin', market_option_id: null, yes_price: 0.7, price: null, recorded_at: '2026-05-14T00:00:00Z' },
        { market_id: 'bin', market_option_id: null, yes_price: 0.46, price: null, recorded_at: '2026-07-13T00:00:00Z' },
      ],
    })
    const series = await getOptionSeries(client, ['bin'])
    const s = series.get('bin')!
    expect(s.binary).toBe(true)
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0].label).toBe('Yes')
    expect(s.lines[0].price).toBeCloseTo(0.46, 6) // legend === market.yes_price
    expect(s.lines[0].points.at(-1)).toBeCloseTo(0.46, 6) // endpoint === newest recorded
    expect(s.lines[0].points[0]).toBeCloseTo(0.636, 6) // oldest first
    expect(s.seeded).toBe(false)
  })

  it('seeds a flat 2-point line at the current price when there is no history', async () => {
    const client = makeClient({
      markets: [{ id: 'bin', resolution_type: 'binary', yes_price: 0.3 }],
      market_options: [],
      price_history: [],
    })
    const s = (await getOptionSeries(client, ['bin'])).get('bin')!
    expect(s.seeded).toBe(true)
    expect(s.lines[0].points).toEqual([0.3, 0.3])
    expect(s.startAt).toBeNull()
  })
})

describe('getOptionSeries — multi-outcome anchoring', () => {
  it('draws one ranked line per option, each endpoint anchored to that option newest price', async () => {
    const client = makeClient({
      markets: [{ id: 'm', resolution_type: 'multiple_choice', yes_price: 0.5 }],
      market_options: [
        { id: 'o1', market_id: 'm', label: 'Ruto', price: 0.44, yes_price: 0.44, display_order: 1, image_url: null },
        { id: 'o2', market_id: 'm', label: 'Kalonzo', price: 0.2, yes_price: 0.2, display_order: 2, image_url: null },
        { id: 'o3', market_id: 'm', label: 'Gachagua', price: 0.14, yes_price: 0.14, display_order: 3, image_url: null },
      ],
      price_history: [
        { market_id: 'm', market_option_id: 'o1', yes_price: null, price: 0.6, recorded_at: '2026-04-14T00:00:00Z' },
        { market_id: 'm', market_option_id: 'o1', yes_price: null, price: 0.44, recorded_at: '2026-07-13T00:00:00Z' },
        { market_id: 'm', market_option_id: 'o2', yes_price: null, price: 0.25, recorded_at: '2026-04-14T00:00:00Z' },
        { market_id: 'm', market_option_id: 'o2', yes_price: null, price: 0.2, recorded_at: '2026-07-13T00:00:00Z' },
        { market_id: 'm', market_option_id: 'o3', yes_price: null, price: 0.1, recorded_at: '2026-04-14T00:00:00Z' },
        { market_id: 'm', market_option_id: 'o3', yes_price: null, price: 0.14, recorded_at: '2026-07-13T00:00:00Z' },
      ],
    })
    const s = (await getOptionSeries(client, ['m'])).get('m')!
    expect(s.binary).toBe(false)
    expect(s.seeded).toBe(false)
    expect(s.lines.map((l) => l.label)).toEqual(['Ruto', 'Kalonzo', 'Gachagua']) // ranked desc
    for (const l of s.lines) {
      expect(l.points.at(-1)).toBeCloseTo(l.price, 6) // endpoint === legend
    }
    expect(s.lines[0].points.at(-1)).toBeCloseTo(0.44, 6)
  })
})
