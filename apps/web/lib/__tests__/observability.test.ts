import { describe, it, expect } from 'vitest'
import {
  redactFields,
  resolveLevel,
  buildRecord,
  createLogger,
  LOG_LEVELS,
} from '@/lib/observability/logger'
import {
  newRequestId,
  sanitizeRequestId,
  resolveRequestId,
  REQUEST_ID_HEADER,
} from '@/lib/observability/request-id'
import {
  AppError,
  httpStatusForPgCode,
  normalizeError,
  serializeError,
  errorBody,
  PG_SQLSTATE_HTTP,
} from '@/lib/observability/errors'

describe('logger: redaction', () => {
  it('redacts sensitive keys recursively', () => {
    const out = redactFields({
      user: 'a',
      password: 'p',
      nested: { api_key: 'k', ok: 1 },
      list: [{ token: 't' }],
    }) as Record<string, unknown>
    expect(out.user).toBe('a')
    expect(out.password).toBe('***redacted***')
    expect((out.nested as Record<string, unknown>).api_key).toBe('***redacted***')
    expect((out.nested as Record<string, unknown>).ok).toBe(1)
    expect(((out.list as unknown[])[0] as Record<string, unknown>).token).toBe('***redacted***')
  })

  it('leaves primitives untouched', () => {
    expect(redactFields(5)).toBe(5)
    expect(redactFields('x')).toBe('x')
    expect(redactFields(null)).toBe(null)
  })
})

describe('logger: levels & records', () => {
  it('resolves level from env-like values', () => {
    expect(resolveLevel('debug')).toBe('debug')
    expect(resolveLevel('WARN')).toBe('warn')
    expect(resolveLevel(undefined)).toBe('info')
    expect(resolveLevel('nonsense')).toBe('info')
  })

  it('buildRecord merges context+fields and redacts', () => {
    const rec = buildRecord('info', 'hi', { request_id: 'r1' }, { secret: 'x', a: 1 }, '2020-01-01T00:00:00Z')
    expect(rec.ts).toBe('2020-01-01T00:00:00Z')
    expect(rec.level).toBe('info')
    expect(rec.msg).toBe('hi')
    expect(rec.request_id).toBe('r1')
    expect(rec.secret).toBe('***redacted***')
    expect(rec.a).toBe(1)
  })

  it('filters below the minimum level', () => {
    const lines: Record<string, unknown>[] = []
    const log = createLogger({ level: 'warn', sink: (_l, r) => lines.push(r), now: () => 'T' })
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(lines.map((l) => l.level)).toEqual(['warn', 'error'])
  })

  it('child loggers bind context', () => {
    const lines: Record<string, unknown>[] = []
    const log = createLogger({ level: 'debug', sink: (_l, r) => lines.push(r), now: () => 'T' })
    log.child({ request_id: 'abc' }).info('hello', { extra: true })
    expect(lines[0].request_id).toBe('abc')
    expect(lines[0].extra).toBe(true)
  })

  it('exposes the expected level set', () => {
    expect(LOG_LEVELS).toContain('silent')
  })
})

describe('request-id', () => {
  it('generates ids that validate', () => {
    const id = newRequestId()
    expect(sanitizeRequestId(id)).toBe(id)
  })

  it('rejects malformed inbound ids', () => {
    expect(sanitizeRequestId('short')).toBeNull()
    expect(sanitizeRequestId('has space')).toBeNull()
    expect(sanitizeRequestId('bad\nnewline-xxxxxxxx')).toBeNull()
    expect(sanitizeRequestId(null)).toBeNull()
    expect(sanitizeRequestId('valid-trace-id-123456')).toBe('valid-trace-id-123456')
  })

  it('resolves from header or mints', () => {
    const good = resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: 'inbound-id-123456' }))
    expect(good).toBe('inbound-id-123456')
    const minted = resolveRequestId(new Headers())
    expect(sanitizeRequestId(minted)).toBe(minted)
  })
})

describe('errors', () => {
  it('maps SQLSTATE codes to statuses', () => {
    expect(httpStatusForPgCode('23505')).toBe(409)
    expect(httpStatusForPgCode('42501')).toBe(403)
    expect(httpStatusForPgCode('P0002')).toBe(404)
    expect(httpStatusForPgCode('unknown')).toBe(400)
    expect(httpStatusForPgCode(null)).toBe(400)
    expect(Object.keys(PG_SQLSTATE_HTTP).length).toBeGreaterThan(5)
  })

  it('exposes AppError messages, hides internals', () => {
    const exposed = normalizeError(new AppError('Bad input', { status: 422, code: 'validation' }))
    expect(exposed).toMatchObject({ status: 422, code: 'validation', message: 'Bad input' })

    const hidden = normalizeError(new AppError('secret detail', { status: 500, expose: false }))
    expect(hidden.message).not.toContain('secret detail')
    expect(hidden.status).toBe(500)
  })

  it('honours per-route overrides then generic pg mapping', () => {
    const overridden = normalizeError({ code: 'P0006' }, { P0006: { status: 402, error: 'Insufficient balance' } })
    expect(overridden).toMatchObject({ status: 402, message: 'Insufficient balance' })

    const generic = normalizeError({ code: '23505', message: 'dup' })
    expect(generic.status).toBe(409)

    const raise = normalizeError({ code: 'P0001', message: 'Market is closed' })
    expect(raise.status).toBe(400)
    expect(raise.message).toBe('Market is closed')
  })

  it('collapses unknown errors to a generic 500', () => {
    const n = normalizeError(new Error('boom stack leak'))
    expect(n.status).toBe(500)
    expect(n.message).not.toContain('boom')
  })

  it('serializeError captures name/message/stack', () => {
    const s = serializeError(new AppError('x', { code: 'c', status: 400 }))
    expect(s.name).toBe('AppError')
    expect(s.code).toBe('c')
    expect(typeof s.stack).toBe('string')
  })

  it('errorBody includes request id when provided', () => {
    const b = errorBody({ status: 400, code: 'bad', message: 'nope' }, 'r1')
    expect(b).toMatchObject({ error: 'nope', code: 'bad', request_id: 'r1' })
  })
})
