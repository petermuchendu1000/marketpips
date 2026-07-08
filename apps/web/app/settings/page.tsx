// /settings — account settings hub (profile, security, notifications, language,
// verification). Personal surface → noindex. Auth is enforced by middleware
// (PROTECTED_ROUTES) and re-checked here so a server-rendered fallback redirect
// exists even if the matcher ever changes.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { SettingsView } from '@/components/settings/settings-view'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/login?next=/settings')

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SettingsView />
    </div>
  )
}
