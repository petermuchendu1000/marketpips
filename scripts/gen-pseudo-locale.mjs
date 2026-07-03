#!/usr/bin/env node
// scripts/gen-pseudo-locale.mjs — pseudo-localization generator (Module 17.4).
//
// Produces apps/web/messages/en-XA.json from the English source of truth. The
// pseudo-locale surfaces three classes of i18n bugs BEFORE real translators are
// engaged:
//   1. Hard-coded strings  — anything still in plain English on screen was NOT
//      routed through the catalog (it won't be accented/bracketed).
//   2. Truncation / overflow — text is padded ~40% longer (many languages,
//      e.g. German/Amharic, run longer than English) to expose clipped UI.
//   3. Concatenation bugs — [brackets] around each string reveal fragments that
//      were glued together in code instead of composed via ICU placeholders.
//
// ICU placeholders ({name}, {count, plural, ...}) and HTML-ish tags are left
// intact so interpolation keeps working. This is a DEV/CI aid only — en-XA is
// intentionally NOT in i18n/config.ts LOCALES, so it never ships to users. Load
// it locally by temporarily setting the NEXT_LOCALE cookie to `en-XA` after
// adding it to LOCALES in a scratch branch, or diff it visually.
//
// Usage:  node scripts/gen-pseudo-locale.mjs           # write en-XA.json
//         node scripts/gen-pseudo-locale.mjs --check   # verify it is current (CI)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = join(here, '..', 'apps', 'web', 'messages')
const SOURCE = join(MESSAGES_DIR, 'en.json')
const TARGET = join(MESSAGES_DIR, 'en-XA.json')

// Latin-1 accent map: readable but visibly "foreign" so untranslated English
// stands out instantly.
const ACCENTS = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í',
  j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ĉ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í',
  J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ĉ', Y: 'Ý', Z: 'Ž',
}

// Segments we must NOT accent: ICU placeholders/args and simple tags.
const PRESERVE = /(\{[^}]*\}|<[^>]+>)/g

function accentSegment(text) {
  let out = ''
  for (const ch of text) out += ACCENTS[ch] ?? ch
  return out
}

function pseudo(value) {
  const parts = value.split(PRESERVE)
  const body = parts
    .map((part, i) => (i % 2 === 1 ? part : accentSegment(part)))
    .join('')
  // ~40% length expansion using a repeated marker; brackets bound the string.
  const visibleLen = value.replace(PRESERVE, '').length
  const padCount = Math.max(1, Math.round(visibleLen * 0.4))
  const pad = '·'.repeat(padCount)
  return `⟦${body}${pad}⟧`
}

function transform(node) {
  if (typeof node === 'string') return pseudo(node)
  if (Array.isArray(node)) return node.map(transform)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = transform(v)
    return out
  }
  return node
}

const source = JSON.parse(readFileSync(SOURCE, 'utf8'))
const generated = JSON.stringify(transform(source), null, 2) + '\n'

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    /* missing => stale */
  }
  if (current !== generated) {
    console.error(
      'pseudo-locale: en-XA.json is stale. Run `node scripts/gen-pseudo-locale.mjs` and commit.'
    )
    process.exit(1)
  }
  console.log('pseudo-locale: en-XA.json is up to date.')
} else {
  writeFileSync(TARGET, generated)
  console.log(`pseudo-locale: wrote ${TARGET}`)
}
