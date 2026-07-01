import { requirePageCapability } from '@/lib/admin/page-guard'
import { SectionPlaceholder } from '@/components/admin/SectionPlaceholder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Payment Gateways' }

export default async function Page() {
  await requirePageCapability('gateways:read')
  return (
    <SectionPlaceholder
      title="Payment Gateways"
      description="Configure per-provider, per-country payment gateways from the UI — paybill, keys, callbacks, limits — with live test and secret rotation."
      phase="Phase D ⭐"
      bullets={[
        "DB-backed, encrypted, per-provider & per-country config",
        "Edit paybill/shortcode, keys, passkeys, callbacks — no deploy",
        "Enable/disable, sandbox ↔ production, failover priority",
        "Live connection test; write-only secrets; rotation (superadmin)",
      ]}
    />
  )
}
