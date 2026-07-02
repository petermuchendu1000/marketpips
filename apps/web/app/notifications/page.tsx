'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences'
import type { Notification } from '@/types'

const TYPE_EMOJI: Record<string, string> = {
  market_resolved: '✅',
  bet_won: '🎉',
  bet_lost: '📉',
  deposit_completed: '💰',
  withdrawal_completed: '🏧',
  withdrawal_failed: '❌',
  referral_bonus: '🎁',
  kyc_approved: '✔️',
  kyc_rejected: '⛔',
  market_created: '📣',
  market_closing_soon: '⏰',
  price_alert: '📊',
  bet_filled: '✅',
  system_announcement: '📢',
}

export default function NotificationsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setNotifications((data as Notification[]) || [])
      setFetching(false)
    }
    load()

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const markAllRead = async () => {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const markRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="loading loading-spinner loading-lg" />
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          🔔 Notifications
          {unreadCount > 0 && (
            <span className="badge badge-primary badge-sm ml-2">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <NotificationPreferences />

      {fetching ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 skeleton rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-base-content/50">
          <div className="text-5xl mb-4">🔔</div>
          <p>No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`card cursor-pointer transition-all ${
                n.is_read ? 'bg-base-200 opacity-70' : 'bg-base-200 border border-primary/20 shadow-sm'
              }`}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div className="card-body py-3 px-4 flex flex-row gap-3 items-start">
                <span className="text-xl mt-0.5">{TYPE_EMOJI[n.type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{n.title}</p>
                    {!n.is_read && <span className="badge badge-primary badge-xs">New</span>}
                  </div>
                  <p className="text-xs text-base-content/70 mt-0.5">{n.body}</p>
                  <p className="text-xs text-base-content/40 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
