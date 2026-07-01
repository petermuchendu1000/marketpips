// lib/admin/csv.ts — Minimal, correct CSV serialization for admin exports.
// RFC-4180-ish: quotes fields containing comma/quote/newline and doubles quotes.

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv<T>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const head = columns.map((c) => csvCell(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(',')).join('\n')
  return body ? head + '\n' + body : head + '\n'
}
