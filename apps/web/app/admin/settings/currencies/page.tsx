import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Currencies & FX' }

export default async function Page() {
  await requirePageCapability('settings:write')
  return (
    <SectionPlaceholder
      title="Currencies & FX"
      description="Enable currencies, manage exchange rates, and configure the FX source and cadence."
      phase="Phase D"
      bullets={[
        "Enable/disable supported currencies",
        "Manage exchange_rates with source & refresh cadence",
        "Manual override with expiry",
      ]}
    />
  )
}
