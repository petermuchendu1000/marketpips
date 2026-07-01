import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — System Settings' }

export default async function Page() {
  await requirePageCapability('settings:write')
  return (
    <SectionPlaceholder
      title="System Settings"
      description="Edit fees, limits, feature flags, maintenance mode, and branding without a deploy."
      phase="Phase D"
      bullets={[
        "Fees & economics (platform / creator / marketer)",
        "Deposit/withdrawal limits and KYC thresholds",
        "Feature flags and maintenance mode",
        "Branding, support email, legal links",
      ]}
    />
  )
}
