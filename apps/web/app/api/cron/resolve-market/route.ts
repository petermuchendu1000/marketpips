// app/api/cron/resolve-market/route.ts — flag markets due for resolution.
//
// Scheduled every ~15 min. Marks closed markets whose resolves_at has passed
// (via flag_markets_due_for_resolution) and notifies the resolver/admin cohort
// so a human can settle the outcome with admin_resolve_market. It deliberately
// does NOT auto-pay-out: real-money settlement stays a deliberate, audited human
// action, keeping this automated job's financial blast radius at zero.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withJobRun } from '@/lib/jobs/runner'
import { logger } from '@/lib/observability/logger'
import { resolveRequestId } from '@/lib/observability/request-id'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const JOB_NAME = 'resolve-market'

async function handle(req: NextRequest) {
  const requestId = resolveRequestId(req.headers)
  const log = logger.child({ request_id: requestId, route: '/api/cron/resolve-market' })

  if (!isAuthorizedCron(req.headers, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 500, 1), 2000)
  const sb = await createAdminClient()

  try {
    const outcome = await withJobRun(sb, JOB_NAME, requestId, async () => {
      const { data, error } = await sb.rpc(
        'flag_markets_due_for_resolution' as never,
        { p_limit: limit } as never,
      )
      if (error) throw new Error(error.message)
      const r = (data as { flagged?: number; notified?: number; market_ids?: string[] } | null) ?? {}
      return {
        status: 'success' as const,
        result: { flagged: r.flagged ?? 0, notified: r.notified ?? 0, market_ids: r.market_ids ?? [] },
      }
    })
    log.info('resolve-market complete', { ...outcome.result })
    return NextResponse.json({ ok: true, ...outcome.result, request_id: requestId })
  } catch (e) {
    log.error('resolve-market failed', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ error: 'resolve_market_failed', request_id: requestId }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
