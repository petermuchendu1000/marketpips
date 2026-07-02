// lib/observability/logger.ts — structured JSON logging (edge & node safe).
//
// Emits one JSON object per line (ingestible by any log platform). Supports
// level filtering (LOG_LEVEL), bound context (request id, actor, route), and
// automatic redaction of sensitive keys. The formatting core is pure and
// unit-tested; only `emit` touches console.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

export type LogFields = Record<string, unknown>

const DEFAULT_SENSITIVE = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'passkey',
  'consumer_secret',
  'client_secret',
  'security_credential',
  'pin',
  'access_token',
  'refresh_token',
  'service_role',
]

/** Recursively redact sensitive keys in an object (pure; bounded depth). */
export function redactFields(
  input: unknown,
  sensitive: string[] = DEFAULT_SENSITIVE,
  depth = 0
): unknown {
  if (depth > 6 || input == null) return input
  if (Array.isArray(input)) return input.map((v) => redactFields(v, sensitive, depth + 1))
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = sensitive.some((s) => k.toLowerCase().includes(s))
        ? '***redacted***'
        : redactFields(v, sensitive, depth + 1)
    }
    return out
  }
  return input
}

/** Resolve the active minimum level from an env value (defaults to info). */
export function resolveLevel(raw: string | undefined | null): LogLevel {
  const v = (raw ?? '').toLowerCase()
  return (LOG_LEVELS as readonly string[]).includes(v) ? (v as LogLevel) : 'info'
}

/** Build a single structured log record (pure). */
export function buildRecord(
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  context: LogFields,
  fields: LogFields | undefined,
  now: string
): Record<string, unknown> {
  return {
    ts: now,
    level,
    msg: message,
    ...(redactFields({ ...context, ...(fields ?? {}) }) as Record<string, unknown>),
  }
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  /** Return a new logger with additional bound context. */
  child(context: LogFields): Logger
}

export interface LoggerOptions {
  level?: LogLevel
  context?: LogFields
  /** Sink for testing; defaults to console. */
  sink?: (level: Exclude<LogLevel, 'silent'>, record: Record<string, unknown>) => void
  /** Clock for testing. */
  now?: () => string
}

function defaultSink(level: Exclude<LogLevel, 'silent'>, record: Record<string, unknown>): void {
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Create a logger. Level defaults to LOG_LEVEL env (or info). */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? resolveLevel(process.env.LOG_LEVEL)
  const min = LEVEL_RANK[level]
  const context = opts.context ?? {}
  const sink = opts.sink ?? defaultSink
  const now = opts.now ?? (() => new Date().toISOString())

  function log(l: Exclude<LogLevel, 'silent'>, msg: string, fields?: LogFields) {
    if (LEVEL_RANK[l] < min) return
    sink(l, buildRecord(l, msg, context, fields, now()))
  }

  return {
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    child: (extra) => createLogger({ ...opts, level, context: { ...context, ...extra } }),
  }
}

/** Process-wide base logger. */
export const logger = createLogger()
