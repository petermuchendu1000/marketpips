import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — User Management' }

export default async function Page() {
  await requirePageCapability('users:read')
  return (
    <SectionPlaceholder
      title="User Management"
      description="Search, inspect, and manage every system user — traders, creators, marketers, and staff."
      phase="Phase B"
      bullets={[
        "Server-side search & segmentation across all profiles",
        "User detail: profile, wallet, KYC, activity, roles",
        "Suspend / reactivate / close, force logout, reset password",
        "Balance adjustment with reason (audited)",
        "Audited, time-boxed impersonation",
        "Role & permission assignment (guardrailed)",
      ]}
    />
  )
}
