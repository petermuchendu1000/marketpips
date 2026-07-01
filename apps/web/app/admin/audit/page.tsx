import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Audit & Security' }

export default async function Page() {
  await requirePageCapability('audit:read')
  return (
    <SectionPlaceholder
      title="Audit & Security"
      description="Search the audit log and review security events across the platform."
      phase="Phase F"
      bullets={[
        "Searchable audit log (actor, entity, before/after)",
        "Filter by actor / entity / date; export",
        "Security events: logins, role changes, impersonation, secret rotation",
      ]}
    />
  )
}
