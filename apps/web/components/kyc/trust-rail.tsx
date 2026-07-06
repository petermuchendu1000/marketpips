// components/kyc/trust-rail.tsx
// Assurance cluster for the KYC console. Verification is a trust transaction - the
// moment we ask for a government ID and a selfie, the UI must radiate institutional
// care. This surfaces the concrete assurances (encryption, human review, privacy,
// data-protection alignment) at the point of friction. Pure Pip system, custom
// icons, defensible copy only (no fabricated certifications).
import { IconShield, IconEye, IconCheck, IconClock } from '@/components/ui/icons'

const ASSURANCES: { icon: React.ReactNode; title: string; detail: string }[] = [
  {
    icon: <IconShield size={14} />,
    title: 'AES-256 encryption',
    detail: 'Documents are encrypted in transit and at rest.',
  },
  {
    icon: <IconEye size={14} />,
    title: 'Never sold or shared',
    detail: 'Used only to verify you — never marketed to third parties.',
  },
  {
    icon: <IconCheck size={14} strokeWidth={2.5} />,
    title: 'Reviewed by people',
    detail: 'A trained compliance officer checks every submission.',
  },
  {
    icon: <IconClock size={14} />,
    title: 'Decision in 1–2 days',
    detail: 'We email you the moment your account is verified.',
  },
]

// Short regulator/standard chips. Phrased as alignment, not certification claims.
const STANDARDS = ['Data-protection aligned', 'KYC / AML controls', '256-bit TLS']

export function TrustRail() {
  return (
    <section aria-label="Security and trust" className="space-y-4">
      <ul className="space-y-3">
        {ASSURANCES.map((a) => (
          <li key={a.title} className="flex items-start gap-2.5">
            <span className="mt-px flex h-7 w-7 flex-none items-center justify-center rounded-sm bg-pip-100 text-pip-500">
              {a.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-text-secondary">{a.title}</span>
              <span className="block text-[11px] leading-snug text-text-muted">{a.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-3">
        {STANDARDS.map((s) => (
          <span
            key={s}
            className="rounded-sm border border-hairline bg-surface px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-muted"
          >
            {s}
          </span>
        ))}
      </div>
    </section>
  )
}
