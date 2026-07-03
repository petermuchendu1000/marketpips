// components/content/legal-page.tsx — shared layout for legal/help prose pages.
// Renders inside the root <main> landmark (do NOT add another <main>). Uses
// logical spacing + readable measure; accessible headings come from the caller.
import type { ReactNode } from 'react'

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated?: string
  children: ReactNode
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      {updated ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Last updated: {updated}</p>
      ) : null}
      <div className="mt-8 space-y-6 text-[15px] leading-7 text-gray-700 dark:text-gray-300 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_a]:text-green-700 dark:[&_a]:text-green-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_li]:marker:text-gray-400">
        {children}
      </div>
    </article>
  )
}
