// lib/jobs/runner.ts — shared scaffolding for background-job cron workers.
//
// Every worker: (1) records a `job_runs` row on start, (2) does its work,
// (3) records the derived status + structured result on finish. Status
// derivation is a pure function so it can be unit-tested exhaustively. The
// wrapper is defensive: a thrown handler still writes a 'failed' run row before
// the error propagates, so observability never has a silent gap.

import type { SupabaseClient } from '@supabase/supabase-js'

export type JobStatus = 'success' | 'partial' | 'failed'

/**
 * Derive a run's terminal status from success/failure counts.
 *   - no failures            -> success (includes clean no-ops)
 *   - some ok AND some failed -> partial
 *   - only failures          -> failed
 * Negative inputs are clamped to 0.
 */
export function deriveJobStatus(counts: { succeeded: number; failed: number }): JobStatus {
  const ok = Math.max(0, counts.succeeded | 0)
  const failed = Math.max(0, counts.failed | 0)
  if (failed <= 0) return 'success'
  if (ok > 0) return 'partial'
  return 'failed'
}

/** Minimal RPC surface we need from the admin Supabase client. */
type RpcCapable = Pick<SupabaseClient, 'rpc'>

/** Result a job handler returns: its terminal status and a structured summary. */
export interface JobOutcome {
  status: JobStatus
  result: Record<string, unknown>
}

/**
 * Run a job handler wrapped in start/finish observability. Records a job_runs
 * row, invokes the handler, then finalizes with the handler's status/result.
 * If the handler throws, records a 'failed' run (capturing the message) and
 * rethrows so the route can return a 5xx.
 */
export async function withJobRun(
  sb: RpcCapable,
  jobName: string,
  requestId: string,
  handler: () => Promise<JobOutcome>,
): Promise<JobOutcome & { runId: string | null }> {
  let runId: string | null = null
  try {
    const { data } = await sb.rpc('record_job_start' as never, {
      p_job_name: jobName,
      p_request_id: requestId,
    } as never)
    runId = (data as string | null) ?? null
  } catch {
    runId = null // observability is best-effort; never block the job on it.
  }

  try {
    const outcome = await handler()
    await finish(sb, runId, outcome.status, outcome.result, null)
    return { ...outcome, runId }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'job handler error'
    await finish(sb, runId, 'failed', { error: message }, message)
    throw e
  }
}

async function finish(
  sb: RpcCapable,
  runId: string | null,
  status: JobStatus,
  result: Record<string, unknown>,
  error: string | null,
): Promise<void> {
  if (!runId) return
  try {
    await sb.rpc('record_job_finish' as never, {
      p_id: runId,
      p_status: status,
      p_result: result,
      p_error: error,
    } as never)
  } catch {
    // swallow — a lost finish row must not fail the job response.
  }
}
