import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Announcements' }

export default async function Page() {
  await requirePageCapability('announcements:send')
  return (
    <SectionPlaceholder
      title="Announcements"
      description="Compose and schedule broadcast or segmented notifications across channels."
      phase="Phase F"
      bullets={[
        "Broadcast or segment by country / role / cohort",
        "Schedule delivery and track stats",
        "In-app + SMS (Africa's Talking) + email (Resend)",
      ]}
    />
  )
}
