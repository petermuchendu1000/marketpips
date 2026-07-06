'use client'

// Leaderboard — Pip system. Institutional league table: metric segmented
// control + period pills, a restrained top-3 podium (brass accent on #1, no
// casino gloss), and a monospaced standings table. Backed by GET /api/leaderboard.
import { useEffect, useRef, useState } from 'react'
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  METRIC_META,
  displayName,
  formatUsd,
  formatSignedUsd,
  formatPct,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardEntry,
} from '@/lib/leaderboard'
import Link from 'next/link'
import { IconTrophy, IconTrendUp } from '@/components/ui/icons'

const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  all: 'All-time',
  month: 'This month',
  week: 'This week',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'A'
}

/** Primary metric value for the active metric (podium + emphasized column). */
function primaryValue(e: LeaderboardEntry, metric: LeaderboardMetric): string {
  if (metric === 'winrate') return formatPct(e.win_rate)
  if (metric === 'pnl') return formatSignedUsd(e.profit_loss_usd)
  return formatUsd(e.total_volume_usd)
}

function Avatar({ entry, size = 40 }: { entry: LeaderboardEntry; size?: number }) {
  const name = displayName(entry)
  if (entry.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.avatar_url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, border: '1px solid var(--hairline)' }}
      />
    )
  }
  return (
    <span
      className="avatar shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

/** Segmented control (metric) — roving-focus tablist on the Pip pill track. */
function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = e.key === 'ArrowRight' ? (i + 1) % options.length : (i - 1 + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-pill border border-hairline p-1"
      style={{ background: 'var(--surface-2)' }}
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`tab-pill ${active ? 'active' : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Rank medallion — tinted numeral (never an emoji medal). */
function RankMedallion({ rank, size = 30 }: { rank: number; size?: number }) {
  const styles =
    rank === 1
      ? { background: 'var(--brass-100)', color: 'var(--brass-600)', border: '1px solid color-mix(in srgb, var(--brass-500) 40%, transparent)' }
      : rank === 2
        ? { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--hairline-strong)' }
        : rank === 3
          ? { background: 'color-mix(in srgb, var(--brass-500) 10%, var(--surface-2))', color: 'var(--brass-600)', border: '1px solid var(--hairline)' }
          : { background: 'transparent', color: 'var(--text-3)', border: 'none' }
  return (
    <span
      className="mono inline-flex items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42, ...styles }}
    >
      {rank}
    </span>
  )
}

function Podium({ rows, metric }: { rows: LeaderboardEntry[]; metric: LeaderboardMetric }) {
  // Visual order: #2 (left), #1 (center, tallest), #3 (right).
  const order = [1, 0, 2]
  const plinth = ['h-14', 'h-20', 'h-10']
  return (
    <div className="mb-8 grid grid-cols-3 items-end gap-3 sm:gap-5">
      {order.map((idx, col) => {
        const p = rows[idx]
        if (!p) return <div key={col} />
        const rank = idx + 1
        const isFirst = rank === 1
        return (
          <div key={p.id} className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <Avatar entry={p} size={isFirst ? 64 : 52} />
              <span className="absolute -bottom-1 -right-1">
                <RankMedallion rank={rank} size={isFirst ? 26 : 22} />
              </span>
            </div>
            <p
              className="max-w-[9rem] truncate text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
              title={displayName(p)}
            >
              {displayName(p)}
            </p>
            <p className="mono mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {primaryValue(p, metric)}
            </p>
            <div
              className={`card mt-3 flex w-full ${plinth[col]} items-start justify-center pt-2`}
              style={
                isFirst
                  ? { borderColor: 'color-mix(in srgb, var(--brass-500) 45%, transparent)', background: 'color-mix(in srgb, var(--brass-500) 6%, var(--surface))' }
                  : undefined
              }
            >
              <span className="mono text-lg font-bold" style={{ color: isFirst ? 'var(--brass-600)' : 'var(--text-3)' }}>
                {rank}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function LeaderboardView() {
  const [metric, setMetric] = useState<LeaderboardMetric>('volume')
  const [period, setPeriod] = useState<LeaderboardPeriod>('all')
  const [rows, setRows] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setErrored(false)
      try {
        const params = new URLSearchParams({ metric, period, limit: '50' })
        const res = await fetch(`/api/leaderboard?${params}`, { signal: controller.signal })
        const json = await res.json()
        setRows(Array.isArray(json.data) ? json.data : [])
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setRows([])
          setErrored(true)
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [metric, period])

  return (
    <div className="animate-fade-in">
      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Ranking metric"
          value={metric}
          onChange={(v) => setMetric(v as LeaderboardMetric)}
          options={LEADERBOARD_METRICS.map((m) => ({ value: m, label: METRIC_META[m].label }))}
        />
        <Segmented
          ariaLabel="Time period"
          value={period}
          onChange={(v) => setPeriod(v as LeaderboardPeriod)}
          options={LEADERBOARD_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="mb-8 grid grid-cols-3 items-end gap-4">
            {[52, 64, 44].map((h, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="skeleton h-14 w-14 rounded-full" />
                <div className="skeleton h-3 w-16 rounded" />
                <div className="skeleton w-full rounded-md" style={{ height: h }} />
              </div>
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-md" />
          ))}
        </div>
      ) : errored ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Couldn&apos;t load the leaderboard</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Please try again in a moment.</p>
          <button className="btn btn-secondary btn-sm mt-2" onClick={() => setPeriod((p) => p)}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {rows.length >= 3 && <Podium rows={rows} metric={metric} />}
          <StandingsTable rows={rows} metric={metric} />
        </>
      )}
    </div>
  )
}

function StandingsTable({ rows, metric }: { rows: LeaderboardEntry[]; metric: LeaderboardMetric }) {
  const col = (m: LeaderboardMetric) => (metric === m ? { color: 'var(--text-primary)', fontWeight: 700 } : undefined)
  return (
    <div className="card table-wrapper overflow-x-auto p-0">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
            <th className="w-14 px-4 py-3 text-xs font-semibold">#</th>
            <th className="px-4 py-3 text-xs font-semibold">Trader</th>
            <th className="px-4 py-3 text-right text-xs font-semibold">Volume</th>
            <th className="hidden px-4 py-3 text-right text-xs font-semibold sm:table-cell">Bets</th>
            <th className="px-4 py-3 text-right text-xs font-semibold">Win&nbsp;%</th>
            <th className="px-4 py-3 text-right text-xs font-semibold">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const rank = p.rank ?? i + 1
            const pnlPositive = (p.profit_loss_usd || 0) >= 0
            const winGood = (p.win_rate || 0) >= 0.5
            return (
              <tr
                key={p.id}
                className="border-t transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <td className="px-4 py-3 align-middle">
                  {rank <= 3 ? <RankMedallion rank={rank} size={26} /> : <span className="mono pl-1.5 font-semibold" style={{ color: 'var(--text-3)' }}>{rank}</span>}
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-2.5">
                    <Avatar entry={p} size={32} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold" style={{ color: 'var(--text-primary)' }}>{displayName(p)}</p>
                      {p.username && <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>@{p.username}</p>}
                    </div>
                  </div>
                </td>
                <td className="mono px-4 py-3 text-right align-middle" style={col('volume')}>{formatUsd(p.total_volume_usd)}</td>
                <td className="mono hidden px-4 py-3 text-right align-middle sm:table-cell" style={{ color: 'var(--text-2)' }}>{(p.total_bets || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right align-middle">
                  <span className={`badge ${winGood ? 'badge-green' : 'badge-muted'}`} style={col('winrate')}>{formatPct(p.win_rate)}</span>
                </td>
                <td
                  className="mono px-4 py-3 text-right align-middle font-semibold"
                  style={{ ...(col('pnl') ?? {}), color: pnlPositive ? 'var(--yes-700)' : 'var(--no-700)' }}
                >
                  {formatSignedUsd(p.profit_loss_usd)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: 'var(--pip-100)', color: 'var(--pip-text)' }}
      >
        <IconTrophy size={26} />
      </span>
      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No ranked traders yet</p>
      <p className="max-w-xs text-sm" style={{ color: 'var(--text-muted)' }}>
        Standings appear once traders start placing positions. Be the first to make the board.
      </p>
      <Link href="/markets" className="btn btn-primary btn-sm mt-1 gap-1.5">
        <IconTrendUp size={14} /> Explore markets
      </Link>
    </div>
  )
}
