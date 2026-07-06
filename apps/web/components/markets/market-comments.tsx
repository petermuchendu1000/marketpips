'use client'

// components/markets/market-comments.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { avatarColor } from '@/lib/utils'
import { IconComments, IconArrowRight } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import type { Comment } from '@/types'

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}

interface MarketCommentsProps {
  marketId: string
}

export function MarketComments({ marketId }: MarketCommentsProps) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = useMemo(() => createClient(), [])

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

    // Subscribe to new comments
    const channel = supabase
      .channel(`comments:${marketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `market_id=eq.${marketId}`,
      }, () => {
        fetchComments()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [marketId, supabase, fetchComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { toast.error('Sign in to comment'); return }
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

  return (
    <div className="card p-4">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-pip-100 text-pip-500">
          <IconComments size={14} />
        </span>
        Discussion ({comments.length})
      </h2>

      {/* Comment form */}
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

      {/* Comments list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 skeleton rounded-full flex-none" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 skeleton rounded" />
                <div className="h-4 w-full skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No comments yet. Be the first to share your prediction.
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex-none flex items-center justify-center text-white text-xs font-bold ${avatarColor(comment.user_id)}`}>
                {comment.user?.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {comment.user?.display_name || comment.user?.username || 'Anonymous'}
                  </span>
                  <span className="flex-none text-xs text-text-muted">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
