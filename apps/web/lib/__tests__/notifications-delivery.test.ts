import { describe, it, expect } from 'vitest'
import {
  backoffSeconds,
  shouldRetry,
  isValidE164,
  isValidDestination,
  truncateSms,
  normalizeProviderResult,
  summarizeBatch,
  SMS_MAX_LENGTH,
  DELIVERY_CHANNELS,
} from '@/lib/notifications/delivery'
import {
  constantTimeEqual,
  extractBearer,
  isAuthorizedCron,
  CRON_SECRET_HEADER,
} from '@/lib/cron-auth'

describe('delivery: backoff & retry', () => {
  it('follows the exponential schedule and caps', () => {
    expect(backoffSeconds(1)).toBe(60)
    expect(backoffSeconds(2)).toBe(300)
    expect(backoffSeconds(3)).toBe(1800)
    expect(backoffSeconds(4)).toBe(7200)
    expect(backoffSeconds(5)).toBe(21600)
    expect(backoffSeconds(9)).toBe(21600) // capped
    expect(backoffSeconds(0)).toBe(60) // clamps to first
  })

  it('shouldRetry respects the attempt cap', () => {
    expect(shouldRetry(0, 5)).toBe(true)
    expect(shouldRetry(4, 5)).toBe(true)
    expect(shouldRetry(5, 5)).toBe(false)
    expect(shouldRetry(6, 5)).toBe(false)
  })
})

describe('delivery: destination validation', () => {
  it('validates E.164 phone numbers', () => {
    expect(isValidE164('+254712345678')).toBe(true)
    expect(isValidE164('+256701234567')).toBe(true)
    expect(isValidE164('0712345678')).toBe(false) // no +
    expect(isValidE164('+0712345678')).toBe(false) // leading zero after +
    expect(isValidE164('+12')).toBe(false) // too short
    expect(isValidE164('not-a-phone')).toBe(false)
  })

  it('validates destinations per channel', () => {
    expect(isValidDestination('sms', '+254712345678')).toBe(true)
    expect(isValidDestination('sms', 'a@b.co')).toBe(false)
    expect(isValidDestination('email', 'user@example.com')).toBe(true)
    expect(isValidDestination('email', 'nope')).toBe(false)
    expect(isValidDestination('push', 'opaque-token')).toBe(true)
    expect(isValidDestination('email', '')).toBe(false)
  })
})

describe('delivery: SMS truncation', () => {
  it('leaves short messages intact', () => {
    expect(truncateSms('short message')).toBe('short message')
  })
  it('truncates long messages with an ellipsis', () => {
    const long = 'x'.repeat(SMS_MAX_LENGTH + 50)
    const out = truncateSms(long)
    expect(out.length).toBe(SMS_MAX_LENGTH)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('delivery: results & summaries', () => {
  it('normalizes provider results', () => {
    expect(normalizeProviderResult(true, { providerMessageId: 'm1' })).toEqual({
      success: true,
      providerMessageId: 'm1',
    })
    const fail = normalizeProviderResult(false, { error: 'boom' })
    expect(fail.success).toBe(false)
    expect(fail.error).toBe('boom')
  })

  it('summarizes a batch of outcomes', () => {
    const s = summarizeBatch([
      { status: 'sent' },
      { status: 'sent' },
      { status: 'failed' },
      { status: 'skipped' },
    ])
    expect(s).toEqual({ claimed: 4, sent: 2, failed: 1, skipped: 1 })
  })

  it('exposes the channel set', () => {
    expect(DELIVERY_CHANNELS).toContain('email')
    expect(DELIVERY_CHANNELS).toContain('sms')
  })
})

describe('cron-auth', () => {
  it('constant-time compares strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })

  it('extracts bearer tokens', () => {
    expect(extractBearer('Bearer xyz')).toBe('xyz')
    expect(extractBearer('bearer   spaced ')).toBe('spaced')
    expect(extractBearer('Basic abc')).toBeNull()
    expect(extractBearer(null)).toBeNull()
  })

  it('authorizes via Authorization or x-cron-secret; fails closed', () => {
    const secret = 'super-secret'
    expect(isAuthorizedCron(new Headers({ authorization: `Bearer ${secret}` }), secret)).toBe(true)
    expect(isAuthorizedCron(new Headers({ [CRON_SECRET_HEADER]: secret }), secret)).toBe(true)
    expect(isAuthorizedCron(new Headers({ authorization: 'Bearer wrong' }), secret)).toBe(false)
    expect(isAuthorizedCron(new Headers(), secret)).toBe(false)
    // Fails closed when no secret configured.
    expect(isAuthorizedCron(new Headers({ [CRON_SECRET_HEADER]: 'anything' }), undefined)).toBe(false)
    expect(isAuthorizedCron(new Headers({ [CRON_SECRET_HEADER]: '' }), '')).toBe(false)
  })
})
