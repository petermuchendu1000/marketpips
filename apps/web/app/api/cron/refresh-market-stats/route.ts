// app/api/cron/refresh-market-stats/route.ts — trailing-24h market-stats rollup.
//
// Scheduled every ~5 min. Recomputes the denormalized volume_24h_usd /
// trades_24h / last_trade_at columns via the atomic refresh_market_stats RPC so
// the markets grid and cards never aggregate over `orders` at request time.
// CRON_SECRET-gated; recorded in job_runs via the shared runner.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withJobRun } from '@/lib/jobs/runner'
import { logger } from '@/lib/observability/logger'
import { resolveRequestId } from '@/lib/observability/request-id'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const JOB_NAME = 'refresh-market-stats'

async function handle(req: NextRequest) {
  const requestId = resolveRequestId(req.headers)
  const log = logger.child({ request_id: requestId, route: '/api/cron/refresh-market-stats' })

  if (!isAuthorizedCron(req.headers, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = await createAdminClient()

  try {
    const outcome = await withJobRun(sb, JOB_NAME, requestId, async () => {
      const { data, error } = await sb.rpc('refresh_market_stats' as never, {} as never)
      if (error) throw new Error(error.message)
      const r = (data as { updated?: number } | null) ?? {}
      return { status: 'success' as const, result: { updated: r.updated ?? 0 } }
    })
    log.info('refresh-market-stats complete', { ...outcome.result })
    return NextResponse.json({ ok: true, ...outcome.result, request_id: requestId })
  } catch (e) {
    log.error('refresh-market-stats failed', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ error: 'refresh_market_stats_failed', request_id: requestId }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
