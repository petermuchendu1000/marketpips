import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Staff & Roles' }

export default async function Page() {
  await requirePageCapability('staff:read')
  return (
    <SectionPlaceholder
      title="Staff & Roles"
      description="Manage staff members, roles, and the capability matrix (superadmin-gated for staff grants)."
      phase="Phase B"
      bullets={[
        "Directory of staff and their roles",
        "Grant / revoke roles (staff roles are superadmin-only)",
        "View and tune the role → capability matrix",
        "Superadmin is immutable and cannot be demoted or removed",
      ]}
    />
  )
}
