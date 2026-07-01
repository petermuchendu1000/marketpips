import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — KYC & Compliance' }

export default async function Page() {
  await requirePageCapability('kyc:review')
  return (
    <SectionPlaceholder
      title="KYC & Compliance"
      description="Review identity documents, manage AML flags, and enforce tiered limits."
      phase="Phase B"
      bullets={[
        "Review queue over KYC documents and profile status",
        "Approve / reject with reason and notification",
        "AML / sanctions screening hooks",
        "Tiered limits by KYC level and self-exclusion",
      ]}
    />
  )
}
