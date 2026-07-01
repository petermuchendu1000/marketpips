import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Marketer Management' }

export default async function Page() {
  await requirePageCapability('marketers:manage')
  return (
    <SectionPlaceholder
      title="Marketer Management"
      description="Manage affiliates, commission plans, campaigns, attribution, and anti-fraud."
      phase="Phase E"
      bullets={[
        "Onboarding & unique tracking/campaign codes",
        "Attribution: referrals, activation, retained volume",
        "Commission plans (CPA / rev-share / hybrid)",
        "Promo campaigns with budgets and caps",
        "Anti-fraud: self-referral & multi-account detection",
      ]}
    />
  )
}
