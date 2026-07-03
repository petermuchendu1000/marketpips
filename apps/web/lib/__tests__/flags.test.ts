import { describe, it, expect } from 'vitest'
import {
  FEATURE_FLAG_KEYS,
  flagEnvVar,
  readFlagFromEnv,
  resolveFlag,
} from '@/lib/flags'

describe('feature flags — registry', () => {
  it('includes the dark-launch flags and they default OFF', () => {
    expect(FEATURE_FLAG_KEYS).toContain('flags.new_market_ui')
    expect(FEATURE_FLAG_KEYS).toContain('flags.social_sharing')
    // No env, no stored value -> schema default (off) for dark-launch flags.
    expect(resolveFlag('flags.new_market_ui', undefined, undefined)).toBe(false)
    expect(resolveFlag('flags.social_sharing', undefined, undefined)).toBe(false)
  })

  it('keeps existing flags defaulting ON', () => {
    expect(resolveFlag('flags.deposits_enabled', undefined, undefined)).toBe(true)
  })
})

describe('feature flags — env override mapping', () => {
  it('maps flag keys to FLAG_<UPPER_SNAKE> vars', () => {
    expect(flagEnvVar('flags.social_sharing')).toBe('FLAG_SOCIAL_SHARING')
    expect(flagEnvVar('flags.new_market_ui')).toBe('FLAG_NEW_MARKET_UI')
  })

  it('parses truthy/falsy env values, ignores garbage', () => {
    const env = {
      FLAG_SOCIAL_SHARING: 'true',
      FLAG_NEW_MARKET_UI: 'off',
      FLAG_DEPOSITS_ENABLED: 'garbage',
    } as unknown as NodeJS.ProcessEnv
    expect(readFlagFromEnv('flags.social_sharing', env)).toBe(true)
    expect(readFlagFromEnv('flags.new_market_ui', env)).toBe(false)
    expect(readFlagFromEnv('flags.deposits_enabled', env)).toBeUndefined()
    expect(readFlagFromEnv('flags.leaderboard_enabled', env)).toBeUndefined()
  })
})

describe('feature flags — resolution precedence', () => {
  it('env override beats DB value and default (kill-switch)', () => {
    // DB says on, but env kill-switch forces off.
    expect(resolveFlag('flags.deposits_enabled', true, false)).toBe(false)
    // DB unset, env turns a dark-launch flag on.
    expect(resolveFlag('flags.social_sharing', undefined, true)).toBe(true)
  })

  it('DB value beats default when no env override', () => {
    expect(resolveFlag('flags.social_sharing', true, undefined)).toBe(true)
    expect(resolveFlag('flags.deposits_enabled', false, undefined)).toBe(false)
  })

  it('unknown flags fail safe to false', () => {
    expect(resolveFlag('flags.does_not_exist', true, undefined)).toBe(false)
  })
})
