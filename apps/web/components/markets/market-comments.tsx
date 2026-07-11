'use client'

// components/markets/market-comments.tsx
// Community block for the market detail page — a tabbed panel that unifies the
// four social/data views seen on leading prediction markets:
//   Comments · Top Holders · Positions · Activity
// Each non-comment tab lazy-loads its data from Supabase on first open and
// renders a tasteful empty state until there is something to show. All trading
// numbers come straight from the `positions` / `market_activity` tables.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { avatarColor, formatUSD } from '@/lib/utils'
import { MarketActivity } from '@/components/markets/market-activity'
import { TopHolders } from '@/components/markets/top-holders'
import { IconComments, IconArrowRight, IconTrophy, IconPortfolio, IconClock } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import type { Comment, MarketOption } from '@/types'

type TabKey = 'comments' | 'holders' | 'positions' | 'activity'

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}

function TabLoading() {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 flex-none skeleton rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 skeleton rounded" />
            <div className="h-3 w-16 skeleton rounded" />
          </div>
          <div className="h-4 w-14 skeleton rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-text-muted">{children}</p>
}

// ---- data shapes ----------------------------------------------------------
interface HolderRow {
  user_id: string
  side: 'yes' | 'no' | null
  shares: number
  current_value_usd: number | null
  user?: { display_name: string | null; username: string | null } | null
}
interface ActivityRow {
  id: string
  user_id: string
  action: string
  amount_usd: number | null
  side: 'yes' | 'no' | null
  price: number | null
  created_at: string | null
  user?: { display_name: string | null; username: string | null }
}

function displayName(u?: { display_name: string | null; username: string | null } | null, id?: string) {
  return u?.display_name || u?.username || `User…${(id || '').slice(-4)}`
}

function Avatar({ id, u }: { id: string; u?: { display_name: string | null; username: string | null } | null }) {
  return (
    <div className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(id)}`}>
      {(u?.display_name || u?.username || '?')[0]?.toUpperCase() || '?'}
    </div>
  )
}

// ---- Holders / Positions rows ---------------------------------------------
function HolderList({ rows, showOwnerNames = true }: { rows: HolderRow[]; showOwnerNames?: boolean }) {
  if (!rows.length) return null
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={`${r.user_id}-${r.side}-${i}`} className="flex items-center gap-3">
          <Avatar id={r.user_id} u={r.user} />
          <div className="min-w-0 flex-1">
            {showOwnerNames && (
              <p className="truncate text-sm font-medium text-text-primary">{displayName(r.user, r.user_id)}</p>
            )}
            <p className="text-xs text-text-muted">
              <span
                className={`font-semibold ${r.side === 'no' ? 'text-no' : 'text-yes'}`}
              >
                {r.side === 'no' ? 'No' : 'Yes'}
              </span>{' '}
              · {Math.round(r.shares).toLocaleString()} shares
            </p>
          </div>
          <span className="flex-none tabular-nums text-sm font-semibold text-text-primary">
            {formatUSD(r.current_value_usd ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

interface MarketCommentsProps {
  marketId: string
  options?: MarketOption[] | null
  resolutionType?: string | null
}

export function MarketComments({ marketId, options, resolutionType }: MarketCommentsProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<TabKey>('comments')

  // ---- comments state -----------------------------------------------------
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ---- lazy tab state -----------------------------------------------------
  // Top Holders is delegated to <TopHolders/> (its own RPC-backed board).
  const [positions, setPositions] = useState<HolderRow[] | null>(null)
  const [activity, setActivity] = useState<ActivityRow[] | null>(null)

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, user:profiles!comments_user_id_fkey(id, display_name, avatar_url, username)')
      .eq('market_id', marketId)
      .eq('is_deleted', false)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(50)
    setComments((data as Comment[]) || [])
    setIsLoading(false)
  }, [supabase, marketId])

  useEffect(() => {
    fetchComments()
    const channel = supabase
      .channel(`comments:${marketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `market_id=eq.${marketId}` },
        () => fetchComments(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [marketId, supabase, fetchComments])

  // Lazy-load a tab's data the first time it's opened.
  useEffect(() => {
    if (tab === 'positions' && positions === null) {
      if (!user) {
        setPositions([])
        return
      }
      supabase
        .from('positions')
        .select('user_id, side, shares, current_value_usd, user:profiles!positions_user_id_fkey(display_name, username)')
        .eq('market_id', marketId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('current_value_usd', { ascending: false })
        .then(({ data }) => setPositions(((data as unknown) as HolderRow[]) || []))
    }
    if (tab === 'activity' && activity === null) {
      supabase
        .from('market_activity')
        .select('id, user_id, action, amount_usd, side, price, created_at, user:profiles!market_activity_user_id_fkey(display_name, username)')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(30)
        .then(({ data }) => setActivity(((data as unknown) as ActivityRow[]) || []))
    }
  }, [tab, marketId, supabase, user, positions, activity])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast.error('Sign in to comment')
      return
    }
    if (!newComment.trim() || newComment.length < 2) return
    setIsSubmitting(true)
    const { error } = await supabase.from('comments').insert({
      market_id: marketId,
      user_id: user.id,
      content: newComment.trim(),
    })
    if (error) {
      toast.error('Failed to post comment')
    } else {
      setNewComment('')
      await fetchComments()
    }
    setIsSubmitting(false)
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'comments', label: `Comments${comments.length ? ` ${comments.length}` : ''}`, icon: <IconComments size={13} /> },
    { key: 'holders', label: 'Top holders', icon: <IconTrophy size={13} /> },
    { key: 'positions', label: 'Positions', icon: <IconPortfolio size={13} /> },
    { key: 'activity', label: 'Activity', icon: <IconClock size={13} /> },
  ]

  return (
    <div className="card p-4">
      {/* Tab bar */}
      <div role="tablist" aria-label="Community" className="mb-4 flex gap-1 overflow-x-auto border-b border-hairline">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex flex-none items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
                active ? 'border-pip-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Comments */}
      {tab === 'comments' && (
        <>
          {user && (
            <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
              <label htmlFor="market-comment" className="sr-only">
                Share your analysis
              </label>
              <input
                id="market-comment"
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your analysis…"
                maxLength={500}
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={isSubmitting || !newComment.trim()}
                className="btn btn-primary flex-none"
                aria-label="Post comment"
              >
                {isSubmitting ? <Spinner /> : <IconArrowRight size={16} />}
              </button>
            </form>
          )}
          {isLoading ? (
            <TabLoading />
          ) : comments.length === 0 ? (
            <EmptyState>No comments yet. Be the first to share your prediction.</EmptyState>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar id={comment.user_id} u={comment.user} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {comment.user?.display_name || comment.user?.username || 'Anonymous'}
                      </span>
                      <span className="flex-none text-xs text-text-muted">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-text-secondary">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Top holders — RPC-backed Yes/No board (Board→Peek→Profile). */}
      {tab === 'holders' && (
        <TopHolders marketId={marketId} options={options} resolutionType={resolutionType} />
      )}

      {/* My positions */}
      {tab === 'positions' &&
        (positions === null ? (
          <TabLoading />
        ) : !user ? (
          <EmptyState>Sign in to see your positions in this market.</EmptyState>
        ) : positions.length === 0 ? (
          <EmptyState>You don’t hold a position in this market yet.</EmptyState>
        ) : (
          <HolderList rows={positions} showOwnerNames={false} />
        ))}

      {/* Activity */}
      {tab === 'activity' &&
        (activity === null ? (
          <TabLoading />
        ) : (
          <MarketActivity activity={activity} />
        ))}
    </div>
  )
}
