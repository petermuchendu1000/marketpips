// /notifications — unread-first, time-grouped feed with typed icons, group
// filters, live updates, and collapsible per-channel delivery preferences.
// Pip system, no emoji, no DaisyUI. Personal surface → noindex.
import type { Metadata } from 'next'
import { NotificationsView } from '@/components/notifications/notifications-view'

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <NotificationsView />
    </div>
  )
}
