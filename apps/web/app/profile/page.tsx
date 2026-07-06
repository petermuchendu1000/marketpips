// /profile — user identity, stats, positions history, wallets and settings
// entry. Pip system, no emoji, no DaisyUI. Personal surface → noindex.
import type { Metadata } from 'next'
import { ProfileView } from '@/components/profile/profile-view'

export const metadata: Metadata = {
  title: 'My Profile',
  robots: { index: false, follow: false },
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ProfileView />
    </div>
  )
}
