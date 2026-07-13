// lib/__tests__/a11y-contrast.test.ts
// ------------------------------------------------------------
// Deterministic WCAG 2.1 AA contrast guard for the semantic Yes/No TEXT colors,
// run in the fast unit job (not just the browser axe job). This closes the exact
// gap the CI axe run surfaced: small text using var(--no) (#D1495B) on the dark
// card surface #111419 was 4.23:1 — below the 4.5:1 AA threshold — and light-mode
// var(--yes)/var(--no) were worse. The fix routes semantic small text through the
// theme-aware --yes-text/--no-text tokens (the -700 shades). This test parses the
// ACTUAL globals.css so it recomputes if any token changes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CSS = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8')

/** Extract the `--name: value;` declarations inside a `selector { ... }` block. */
function blockVars(selector: string): Record<string, string> {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm')
  const body = CSS.match(re)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const rootVars = blockVars(':root')
const darkVars = { ...rootVars, ...blockVars('\\.dark') } // dark overrides root

/** Resolve a token (or literal) to a #rrggbb hex within a theme var map. */
function resolveHex(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 12) throw new Error(`var cycle resolving ${value}`)
  let v = value.trim()
  const varMatch = v.match(/^var\((--[\w-]+)\)$/)
  if (varMatch) return resolveHex(vars[varMatch[1]] ?? '', vars, depth + 1)
  const hex = v.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return `#${h.toLowerCase()}`
  }
  throw new Error(`cannot resolve to hex: "${value}"`)
}

function lin(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(fg: string, bg: string) {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const AA_TEXT = 4.5
const AA_GRAPHIC = 3.0

// Surfaces semantic text can render on, per theme.
const SURFACE_TOKENS = ['--bg', '--surface', '--surface-2'] as const

describe('a11y — semantic Yes/No TEXT tokens clear WCAG AA (4.5:1)', () => {
  for (const [theme, vars] of [
    ['light', rootVars],
    ['dark', darkVars],
  ] as const) {
    for (const token of ['--yes-text', '--no-text'] as const) {
      for (const surf of SURFACE_TOKENS) {
        it(`${theme}: ${token} on ${surf} >= 4.5:1`, () => {
          const fg = resolveHex(`var(${token})`, vars)
          const bg = resolveHex(`var(${surf})`, vars)
          expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
        })
      }
    }
  }
})

describe('a11y — base --yes/--no remain valid for graphics/fills (3:1)', () => {
  // They are intentionally NOT text-safe; this documents that they still pass
  // the non-text graphics threshold so chips/lines/dots are fine.
  for (const [theme, vars] of [
    ['light', rootVars],
    ['dark', darkVars],
  ] as const) {
    for (const token of ['--yes', '--no'] as const) {
      it(`${theme}: ${token} on --surface >= 3:1 (graphics)`, () => {
        const fg = resolveHex(`var(${token})`, vars)
        const bg = resolveHex('var(--surface)', vars)
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_GRAPHIC)
      })
    }
  }
})
