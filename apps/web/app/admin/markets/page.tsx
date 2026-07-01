import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Market Management' }

export default async function Page() {
  await requirePageCapability(['markets:approve','markets:resolve','markets:cancel'])
  return (
    <SectionPlaceholder
      title="Market Management"
      description="Review, approve, resolve, cancel, feature, and handle disputes for markets."
      phase="Phase C"
      bullets={[
        "Review queue: approve / reject / request changes",
        "Edit metadata, feature/trend toggles, close early",
        "Atomic resolution and cancel/refund via RPCs",
        "Dispute queue with SLA tracking",
      ]}
    />
  )
}
