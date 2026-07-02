// app/api/cron/close-markets/route.ts — auto-close expired markets.
//
// Scheduled every ~5 min (pg_cron -> this endpoint with the CRON_SECRET header).
// Transitions active markets past their closes_at to 'closed' via the atomic,
// set-based close_due_markets RPC (system audit + holder notices included).
// Idempotent and safe to run concurrently (RPC uses FOR UPDATE SKIP LOCKED).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withJobRun } from '@/lib/jobs/runner'
import { logger } from '@/lib/observability/logger'
import { resolveRequestId } from '@/lib/observability/request-id'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const JOB_NAME = 'close-markets'

async function handle(req: NextRequest) {
  const requestId = resolveRequestId(req.headers)
  const log = logger.child({ request_id: requestId, route: '/api/cron/close-markets' })

  if (!isAuthorizedCron(req.headers, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 500, 1), 2000)
  const sb = await createAdminClient()

  try {
    const outcome = await withJobRun(sb, JOB_NAME, requestId, async () => {
      const { data, error } = await sb.rpc('close_due_markets' as never, { p_limit: limit } as never)
      if (error) throw new Error(error.message)
      const r = (data as { closed?: number; notified?: number; market_ids?: string[] } | null) ?? {}
      return {
        status: 'success' as const,
        result: { closed: r.closed ?? 0, notified: r.notified ?? 0, market_ids: r.market_ids ?? [] },
      }
    })
    log.info('close-markets complete', { ...outcome.result })
    return NextResponse.json({ ok: true, ...outcome.result, request_id: requestId })
  } catch (e) {
    log.error('close-markets failed', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ error: 'close_markets_failed', request_id: requestId }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Some schedulers only issue GET — accept both.
export async function GET(req: NextRequest) {
  return handle(req)
}
