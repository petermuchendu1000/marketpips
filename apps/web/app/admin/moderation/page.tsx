import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Content Moderation' }

export default async function Page() {
  await requirePageCapability('moderation:read')
  return (
    <SectionPlaceholder
      title="Content Moderation"
      description="Handle reported markets, comments, and profiles with take-down/restore and SLAs."
      phase="Phase F"
      bullets={[
        "Report inbox with SLA tracking",
        "Take-down / restore markets, comments, profiles",
        "Warn / ban users; moderation audit trail",
      ]}
    />
  )
}
