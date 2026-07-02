import { describe, it, expect } from 'vitest'
import {
  parseVitalReport,
  shouldSample,
  resolveSampleRate,
  DEFAULT_SAMPLE_RATE,
  VITAL_NAMES,
} from '@/lib/perf/vitals'

describe('vitals: parseVitalReport', () => {
  it('accepts a well-formed report', () => {
    const r = parseVitalReport({ name: 'LCP', value: 1234.5, rating: 'good', id: 'v1-abc', path: '/markets' })
    expect(r).not.toBeNull()
    expect(r?.name).toBe('LCP')
    expect(r?.value).toBe(1234.5)
  })

  it('accepts every supported metric name', () => {
    for (const name of VITAL_NAMES) {
      expect(parseVitalReport({ name, value: 1, id: 'x', path: '/' })).not.toBeNull()
    }
  })

  it('rejects unknown metric names', () => {
    expect(parseVitalReport({ name: 'BOGUS', value: 1, id: 'x', path: '/' })).toBeNull()
  })

  it('rejects negative / non-finite values', () => {
    expect(parseVitalReport({ name: 'CLS', value: -1, id: 'x', path: '/' })).toBeNull()
    expect(parseVitalReport({ name: 'CLS', value: Infinity, id: 'x', path: '/' })).toBeNull()
  })

  it('rejects missing id/path', () => {
    expect(parseVitalReport({ name: 'TTFB', value: 5 })).toBeNull()
    expect(parseVitalReport({ name: 'TTFB', value: 5, id: '', path: '' })).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(parseVitalReport(null)).toBeNull()
    expect(parseVitalReport('nope')).toBeNull()
  })
})

describe('vitals: sampling', () => {
  it('rate <= 0 disables, rate >= 1 always samples', () => {
    expect(shouldSample(0)).toBe(false)
    expect(shouldSample(-0.5)).toBe(false)
    expect(shouldSample(1)).toBe(true)
    expect(shouldSample(2)).toBe(true)
  })

  it('is deterministic given an injected rng', () => {
    expect(shouldSample(0.1, () => 0.05)).toBe(true)
    expect(shouldSample(0.1, () => 0.5)).toBe(false)
    expect(shouldSample(0.1, () => 0.1)).toBe(false) // strict <
  })

  it('rejects non-finite rate', () => {
    expect(shouldSample(Number.NaN)).toBe(false)
  })
})

describe('vitals: resolveSampleRate', () => {
  it('defaults on invalid input', () => {
    expect(resolveSampleRate(undefined)).toBe(DEFAULT_SAMPLE_RATE)
    expect(resolveSampleRate('abc')).toBe(DEFAULT_SAMPLE_RATE)
  })
  it('clamps to [0,1]', () => {
    expect(resolveSampleRate('0.25')).toBe(0.25)
    expect(resolveSampleRate('5')).toBe(1)
    expect(resolveSampleRate('-3')).toBe(0)
  })
})
