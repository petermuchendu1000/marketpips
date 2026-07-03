// components/layout/site-footer.tsx — accessible <footer> landmark (WCAG 1.3.1).
// Also surfaces the legal/compliance links required for launch (Module 17.5/17.7).
import Link from 'next/link'

const YEAR = new Date().getFullYear()

const LINKS: { href: string; label: string }[] = [
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/responsible-play', label: 'Responsible play' },
  { href: '/help', label: 'Help' },
]

export function SiteFooter() {
  return (
    <footer
      className="mt-16 border-t border-[var(--border)] py-8 text-[13px] text-[var(--text-secondary)]"
      aria-label="Site footer"
    >
      <div className="max-w-7xl mx-auto px-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>© {YEAR} MarketPips · East Africa prediction markets</p>
        <nav aria-label="Legal and help">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
