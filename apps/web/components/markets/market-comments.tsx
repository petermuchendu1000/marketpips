'use client'

// components/markets/market-comments.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { avatarColor, truncate } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Comment } from '@/types'

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
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">
        💬 Discussion ({comments.length})
      </h3>

      {/* Comment form */}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your analysis..."
            maxLength={500}
            className="flex-1 px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            className="px-3 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
        <p className="text-center text-muted-foreground text-sm py-6">
          No comments yet. Be the first to share your prediction!
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex-none flex items-center justify-center text-white text-xs font-bold ${avatarColor(comment.user_id)}`}>
                {comment.user?.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate">
                    {comment.user?.display_name || comment.user?.username || 'Anonymous'}
                  </span>
                  <span className="text-xs text-muted-foreground flex-none">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
