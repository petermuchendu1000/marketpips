import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Profile } from '@/types'

// Live market data — render dynamically per request (no static prerender)
export const dynamic = 'force-dynamic'

async function getLeaderboard() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, total_bets, total_wins, win_rate, profit_loss_usd, total_volume_usd')
    .eq('account_status', 'active')
    .order('total_volume_usd', { ascending: false })
    .limit(50)
  return (data || []) as Partial<Profile>[]
}

export default async function LeaderboardPage() {
  const leaders = await getLeaderboard()

  const MEDAL = ['🥇', '🥈', '🥉']

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">🏆 Leaderboard</h1>
      <p className="text-base-content/60 text-sm mb-8">Top predictors ranked by total volume</p>

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-6 w-fit">
        <a className="tab tab-active">Volume</a>
        <a className="tab">Win Rate</a>
        <a className="tab">P&amp;L</a>
      </div>

      {/* Top 3 podium */}
      {leaders.length >= 3 && (
        <div className="flex justify-center items-end gap-4 mb-10">
          {/* 2nd */}
          <div className="flex flex-col items-center">
            <div className="avatar placeholder mb-2">
              <div className="bg-base-300 text-base-content rounded-full w-14">
                <span className="text-xl">🥈</span>
              </div>
            </div>
            <p className="text-sm font-semibold truncate max-w-[80px] text-center">
              {leaders[1]?.display_name || 'Anonymous'}
            </p>
            <p className="text-xs text-base-content/60">${(leaders[1]?.total_volume_usd || 0).toFixed(0)}</p>
            <div className="bg-base-300 h-16 w-20 rounded-t-xl flex items-center justify-center text-2xl mt-2">2</div>
          </div>
          {/* 1st */}
          <div className="flex flex-col items-center">
            <div className="avatar placeholder mb-2">
              <div className="bg-yellow-400 text-white rounded-full w-16">
                <span className="text-2xl">🥇</span>
              </div>
            </div>
            <p className="text-sm font-bold truncate max-w-[90px] text-center">
              {leaders[0]?.display_name || 'Anonymous'}
            </p>
            <p className="text-xs text-base-content/60">${(leaders[0]?.total_volume_usd || 0).toFixed(0)}</p>
            <div className="bg-yellow-400 text-white h-24 w-24 rounded-t-xl flex items-center justify-center text-3xl mt-2 font-bold">1</div>
          </div>
          {/* 3rd */}
          <div className="flex flex-col items-center">
            <div className="avatar placeholder mb-2">
              <div className="bg-orange-300 text-white rounded-full w-12">
                <span className="text-lg">🥉</span>
              </div>
            </div>
            <p className="text-sm font-semibold truncate max-w-[80px] text-center">
              {leaders[2]?.display_name || 'Anonymous'}
            </p>
            <p className="text-xs text-base-content/60">${(leaders[2]?.total_volume_usd || 0).toFixed(0)}</p>
            <div className="bg-orange-300 h-12 w-20 rounded-t-xl flex items-center justify-center text-2xl mt-2">3</div>
          </div>
        </div>
      )}

      {/* Full table */}
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Trader</th>
              <th className="text-right">Volume</th>
              <th className="text-right">Bets</th>
              <th className="text-right">Win %</th>
              <th className="text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((p, i) => (
              <tr key={p.id} className="hover">
                <td className="font-bold text-base-content/60">
                  {i < 3 ? MEDAL[i] : i + 1}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="avatar placeholder">
                      <div className="bg-neutral text-neutral-content rounded-full w-8">
                        <span className="text-xs">
                          {(p.display_name || 'A')[0].toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.display_name || 'Anonymous'}</p>
                      {p.username && <p className="text-xs text-base-content/50">@{p.username}</p>}
                    </div>
                  </div>
                </td>
                <td className="text-right font-mono text-sm">
                  ${(p.total_volume_usd || 0).toFixed(2)}
                </td>
                <td className="text-right text-sm">{p.total_bets || 0}</td>
                <td className="text-right text-sm">
                  <span className={`badge badge-sm ${
                    (p.win_rate || 0) >= 0.5 ? 'badge-success' : 'badge-warning'
                  }`}>
                    {Math.round((p.win_rate || 0) * 100)}%
                  </span>
                </td>
                <td className={`text-right font-mono text-sm font-semibold ${
                  (p.profit_loss_usd || 0) >= 0 ? 'text-success' : 'text-error'
                }`}>
                  {(p.profit_loss_usd || 0) >= 0 ? '+' : ''}${(p.profit_loss_usd || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
