import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Financial Management' }

export default async function Page() {
  await requirePageCapability(['finance:ledger','finance:deposits','finance:withdrawals'])
  return (
    <SectionPlaceholder
      title="Financial Management"
      description="Operate deposits and withdrawals, reconcile the ledger, and export accounting data."
      phase="Phase C"
      bullets={[
        "Deposits console with provider payload inspection",
        "Withdrawals: approve / reject / retry",
        "Unified transactions ledger + reconciliation",
        "Fees & revenue breakdown, CSV/accounting export",
      ]}
    />
  )
}
