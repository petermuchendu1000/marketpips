// components/admin/SectionPlaceholder.tsx — Guarded stub for admin sections
// whose full functionality lands in a later rollout phase (docs/08-ADMIN.md §8).
// Ensures every nav route resolves to a real, access-controlled page (no dead
// links) while the section is built out.
import Link from 'next/link'

export function SectionPlaceholder({
  title,
  description,
  phase,
  bullets,
}: {
  title: string
  description: string
  phase?: string
  bullets?: string[]
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-black">{title}</h1>
        {phase && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {phase}
          </span>
        )}
      </div>
      <p className="mb-6 text-muted-foreground">{description}</p>

      {bullets && bullets.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-3 text-sm font-semibold">Planned in this section</p>
          <ul className="flex flex-col gap-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <Link href="/admin" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  )
}
