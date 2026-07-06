'use client'

// app/kyc/page.tsx — Identity verification (stepped flow)
// Thin client wrapper: guards auth, resolves the current KYC status, and hands
// off to the KycWizard. Verified / pending users see a terminal state instead.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { KycWizard } from '@/components/kyc/kyc-wizard'
import { LevelBadge } from '@/components/kyc/level-badge'
import { IconCheck, IconClock } from '@/components/ui/icons'

export default function KYCPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [status, setStatus] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    supabase
      .from('kyc_documents')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setStatus(data?.status ?? profile?.kyc_status ?? 'unverified')
        setReady(true)
      })
  }, [user, profile, supabase])

  if (loading || !user || !ready) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="skeleton h-8 w-48 rounded-md" />
        <div className="skeleton mt-6 h-64 w-full rounded-md" />
      </div>
    )
  }

  if (status === 'verified') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-pill bg-yes/10 text-yes">
            <IconCheck size={28} strokeWidth={2.5} />
          </div>
          <div className="mb-3 flex justify-center">
            <LevelBadge level="enhanced" />
          </div>
          <h1 className="font-display text-2xl text-text-primary">Identity verified</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
            You&apos;re fully verified — all deposit, withdrawal and trading features are unlocked.
          </p>
          <Link href="/portfolio" className="btn btn-secondary mt-6">
            Go to portfolio
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-pill bg-amber/10 text-amber">
            <IconClock size={28} />
          </div>
          <div className="mb-3 flex justify-center">
            <LevelBadge level="enhanced" pending />
          </div>
          <h1 className="font-display text-2xl text-text-primary">Under review</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
            Your documents are with our compliance team. This usually takes 1–2 business days, and
            we&apos;ll email you as soon as you&apos;re verified.
          </p>
          <Link href="/portfolio" className="btn btn-secondary mt-6">
            Back to portfolio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-8">
      <KycWizard
        user={user}
        initialPhone={profile?.phone_number ?? ''}
        initialCountry={profile?.country_code ?? 'KE'}
      />
    </div>
  )
}
