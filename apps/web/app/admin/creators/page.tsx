import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Creator Management' }

export default async function Page() {
  await requirePageCapability('creators:manage')
  return (
    <SectionPlaceholder
      title="Creator Management"
      description="Approve creators, configure tiers and rewards, and run creator payouts."
      phase="Phase E"
      bullets={[
        "Applications & approval (user → creator)",
        "Configurable creator tiers and reward rates",
        "Directory: markets, volume, accuracy, rewards",
        "Payout runs via existing disbursement rails",
      ]}
    />
  )
}
