import { describe, it, expect } from 'vitest'
import {
  parseGatewayListParams,
  nonSecretFields,
  secretFields,
  maskSecret,
  secretMeta,
  envFallbackConfig,
  PROVIDER_SCHEMAS,
  GATEWAY_PROVIDERS,
} from '@/lib/admin/gateways'

describe('parseGatewayListParams', () => {
  it('applies safe defaults', () => {
    expect(parseGatewayListParams({})).toEqual({
      provider: null,
      environment: null,
      country: null,
      enabled: null,
    })
  })

  it('whitelists provider and environment', () => {
    expect(parseGatewayListParams({ provider: 'mpesa' }).provider).toBe('mpesa')
    expect(parseGatewayListParams({ provider: 'hax' }).provider).toBeNull()
    expect(parseGatewayListParams({ environment: 'production' }).environment).toBe('production')
    expect(parseGatewayListParams({ environment: 'staging' }).environment).toBeNull()
  })

  it('normalises country and parses tri-state enabled', () => {
    expect(parseGatewayListParams({ country: 'ke' }).country).toBe('KE')
    expect(parseGatewayListParams({ country: 'kenya' }).country).toBe('KE')
    expect(parseGatewayListParams({ enabled: 'true' }).enabled).toBe(true)
    expect(parseGatewayListParams({ enabled: 'false' }).enabled).toBe(false)
    expect(parseGatewayListParams({ enabled: 'maybe' }).enabled).toBeNull()
  })
})

describe('provider field schema', () => {
  it('exposes a schema for every provider enum value', () => {
    for (const p of GATEWAY_PROVIDERS) {
      expect(PROVIDER_SCHEMAS[p]).toBeDefined()
      expect(PROVIDER_SCHEMAS[p].provider).toBe(p)
    }
  })

  it('splits secret vs non-secret fields cleanly', () => {
    const secrets = secretFields('mpesa').map((f) => f.key)
    const nons = nonSecretFields('mpesa').map((f) => f.key)
    expect(secrets).toContain('consumer_secret')
    expect(secrets).toContain('passkey')
    expect(nons).toContain('business_shortcode')
    // no overlap
    expect(secrets.some((k) => nons.includes(k))).toBe(false)
  })

  it('internal provider has no fields', () => {
    expect(PROVIDER_SCHEMAS.internal.fields).toHaveLength(0)
    expect(secretFields('internal')).toHaveLength(0)
  })
})

describe('secret masking & metadata', () => {
  it('masks with last4 or fully', () => {
    expect(maskSecret('4321')).toBe('•••• 4321')
    expect(maskSecret(null)).toBe('•••• ••••')
  })

  it('reads secret_ref metadata without exposing values', () => {
    const ref = { passkey: { last4: '9999', updated_at: '2026-01-01T00:00:00Z' } }
    expect(secretMeta(ref, 'passkey')).toMatchObject({ set: true, last4: '9999' })
    expect(secretMeta(ref, 'consumer_secret')).toEqual({ set: false })
    expect(secretMeta(null, 'passkey')).toEqual({ set: false })
  })
})

describe('envFallbackConfig', () => {
  it('maps env vars into config/secrets by field type', () => {
    const cfg = envFallbackConfig('mpesa', {
      MPESA_SHORTCODE: '123456',
      MPESA_CONSUMER_KEY: 'ckey',
      MPESA_CONSUMER_SECRET: 'csecret',
      MPESA_PASSKEY: 'pkey',
    })
    expect(cfg.source).toBe('env')
    expect(cfg.gatewayId).toBeNull()
    expect(cfg.config.business_shortcode).toBe('123456')
    expect(cfg.config.consumer_key).toBe('ckey')
    // secrets kept separate from non-secret config
    expect(cfg.secrets.consumer_secret).toBe('csecret')
    expect(cfg.secrets.passkey).toBe('pkey')
    expect(cfg.config.consumer_secret).toBeUndefined()
  })

  it('is disabled when no env values are present', () => {
    const cfg = envFallbackConfig('mpesa', {})
    expect(cfg.enabled).toBe(false)
    expect(cfg.config).toEqual({})
    expect(cfg.secrets).toEqual({})
  })

  it('reads production environment from PAYMENTS_ENV', () => {
    const cfg = envFallbackConfig('pesapal', { PAYMENTS_ENV: 'production', PESAPAL_CONSUMER_KEY: 'k' })
    expect(cfg.environment).toBe('production')
  })
})
