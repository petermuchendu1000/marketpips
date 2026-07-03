#!/usr/bin/env node
// scripts/check-i18n-keys.mjs — CI guard for i18n catalog integrity (Module 17.3).
// Ensures every non-default locale catalog only uses keys that exist in the
// English source of truth (no orphan/typo keys), and reports keys missing from
// each locale (informational — partial locales are allowed pre-launch).
// Exit 1 on structural errors (orphan keys / invalid JSON), 0 otherwise.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = join(here, '..', 'apps', 'web', 'messages')
const SOURCE = 'en'

function flatten(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key))
    else out.push(key)
  }
  return out
}

function load(locale) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'))
}

let errors = 0
const enKeys = new Set(flatten(load(SOURCE)))
console.log(`i18n: source '${SOURCE}' has ${enKeys.size} keys`)

const locales = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))
  .filter((l) => l !== SOURCE)

for (const locale of locales) {
  let keys
  try {
    keys = flatten(load(locale))
  } catch (e) {
    console.error(`::error::i18n: ${locale}.json is invalid JSON: ${e.message}`)
    errors++
    continue
  }
  const orphan = keys.filter((k) => !enKeys.has(k))
  const missing = [...enKeys].filter((k) => !keys.includes(k))
  if (orphan.length) {
    errors++
    console.error(`::error::i18n: '${locale}' has ${orphan.length} orphan key(s) not in '${SOURCE}': ${orphan.slice(0, 10).join(', ')}`)
  }
  const pct = Math.round(((enKeys.size - missing.length) / enKeys.size) * 100)
  console.log(`i18n: '${locale}' ${pct}% translated (${missing.length} missing — allowed pre-launch)`)
}

if (errors) {
  console.error(`\ni18n: FAILED with ${errors} structural error(s).`)
  process.exit(1)
}
console.log('\ni18n: OK — no orphan keys, all catalogs valid.')
