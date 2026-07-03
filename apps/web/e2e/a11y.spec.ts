// e2e/a11y.spec.ts — automated WCAG checks with axe-core across key pages
// (Module 17.1). Fails the build on any critical/serious violation, so a11y
// regressions can't merge. Public pages are covered without auth; authed
// journeys (portfolio, wallet) are exercised in the deep-pass manual audit
// (docs/a11y/AUDIT.md) and can be added here with a storage-state fixture.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Key public journeys every release must keep accessible.
const KEY_PAGES: { name: string; path: string }[] = [
  { name: 'Home', path: '/' },
  { name: 'Markets', path: '/markets' },
  { name: 'Leaderboard', path: '/leaderboard' },
  { name: 'Search', path: '/search' },
  { name: 'Sign in', path: '/auth/login' },
  { name: 'Sign up', path: '/auth/register' },
]

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

for (const page of KEY_PAGES) {
  test(`a11y: ${page.name} has no critical/serious violations`, async ({ page: p }) => {
    await p.goto(page.path, { waitUntil: 'networkidle' })

    const results = await new AxeBuilder({ page: p }).withTags(WCAG_TAGS).analyze()

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    // Attach a readable report for CI triage.
    if (blocking.length) {
      console.error(
        `axe violations on ${page.name}:\n` +
          blocking
            .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
            .join('\n')
      )
    }

    expect(blocking, `critical/serious a11y violations on ${page.name}`).toEqual([])
  })
}
