import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Payout Runs' }

export default async function Page() {
  await requirePageCapability('payouts:run')
  return (
    <SectionPlaceholder
      title="Payout Runs"
      description="Compute, review, approve, and disburse creator/marketer commission payouts."
      phase="Phase E"
      bullets={[
        "Compute accrued commissions for a period",
        "Review → approve → disburse via payment rails",
        "Statement export and clawback handling",
      ]}
    />
  )
}
