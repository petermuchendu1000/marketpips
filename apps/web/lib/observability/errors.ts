// lib/observability/errors.ts — error normalization & safe HTTP responses.
//
// Centralises how errors become HTTP responses so handlers never leak internal
// details (stack traces, SQL) to clients, while still logging the full context
// server-side. Includes a general Postgres SQLSTATE -> HTTP mapping that the
// per-route maps (e.g. orders BET_ERRORS) can extend. Pure & unit-tested.

/** Operational (expected) error with a safe client message and status. */
export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly expose: boolean
  readonly details?: unknown
  constructor(
    message: string,
    opts: { status?: number; code?: string; expose?: boolean; details?: unknown } = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.status = opts.status ?? 400
    this.code = opts.code ?? 'bad_request'
    this.expose = opts.expose ?? true
    this.details = opts.details
  }
}

/** Common Postgres SQLSTATE classes -> sensible HTTP statuses. */
export const PG_SQLSTATE_HTTP: Record<string, number> = {
  '23505': 409, // unique_violation
  '23503': 409, // foreign_key_violation
  '23502': 400, // not_null_violation
  '23514': 400, // check_violation
  '22P02': 400, // invalid_text_representation
  '22003': 400, // numeric_value_out_of_range
  '40001': 409, // serialization_failure (retryable)
  '40P01': 409, // deadlock_detected
  '42501': 403, // insufficient_privilege
  P0001: 400, // raise_exception (generic)
  P0002: 404, // no_data_found
  '02000': 404, // no_data
}

/** Map a Postgres error code to an HTTP status (default 400). */
export function httpStatusForPgCode(code: string | null | undefined): number {
  if (!code) return 400
  return PG_SQLSTATE_HTTP[code] ?? 400
}

export interface NormalizedError {
  status: number
  code: string
  /** Client-safe message. */
  message: string
  details?: unknown
}

interface MaybePgError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const GENERIC_500 = 'An unexpected error occurred. Please try again.'

/**
 * Normalise any thrown value into a client-safe response shape. Only AppError
 * (and known operational cases) expose their message; everything else collapses
 * to a generic 500 so we never leak internals.
 */
export function normalizeError(
  err: unknown,
  overrides?: Record<string, { status: number; error: string }>
): NormalizedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.expose ? err.message : GENERIC_500, details: err.details }
  }

  // Supabase/postgrest error-like object with a `code`.
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as MaybePgError
    const code = e.code ?? ''
    if (overrides && overrides[code]) {
      return { status: overrides[code].status, code, message: overrides[code].error }
    }
    if (code && PG_SQLSTATE_HTTP[code] != null) {
      // For raise_exception (P0001) the DB message is author-controlled & safe.
      const message = code === 'P0001' && e.message ? e.message : `Request could not be completed (${code}).`
      return { status: PG_SQLSTATE_HTTP[code], code, message }
    }
  }

  return { status: 500, code: 'internal_error', message: GENERIC_500 }
}

/** Serialize an error for server-side logging (never sent to clients). */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack, ...(err instanceof AppError ? { code: err.code, status: err.status } : {}) }
  }
  if (err && typeof err === 'object') return { ...(err as Record<string, unknown>) }
  return { message: String(err) }
}

/** Standard JSON body for an error response. */
export function errorBody(n: NormalizedError, requestId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { error: n.message, code: n.code }
  if (n.details !== undefined) body.details = n.details
  if (requestId) body.request_id = requestId
  return body
}
