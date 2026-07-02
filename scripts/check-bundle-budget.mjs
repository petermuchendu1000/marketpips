#!/usr/bin/env node
// scripts/check-bundle-budget.mjs — fail CI on first-load JS regressions.
//
// Parses a captured `next build` log and asserts the "First Load JS shared by
// all" size stays within budget (Module 15 §2). Deterministic — no flakiness.
//
// Usage: node scripts/check-bundle-budget.mjs <build-log-file> [budgetKB]
//   env: BUNDLE_BUDGET_KB (default 130)
import { readFileSync } from 'node:fs'

const logFile = process.argv[2]
const budgetKB = Number(process.argv[3] || process.env.BUNDLE_BUDGET_KB || 130)

if (!logFile) {
  console.error('usage: check-bundle-budget.mjs <build-log-file> [budgetKB]')
  process.exit(2)
}

const text = readFileSync(logFile, 'utf8')

// Match e.g. "First Load JS shared by all              103 kB"
const m = text.match(/First Load JS shared by all\s+([\d.]+)\s*kB/i)
if (!m) {
  console.error('✖ Could not find "First Load JS shared by all" in build log.')
  process.exit(2)
}

const sharedKB = parseFloat(m[1])
if (sharedKB > budgetKB) {
  console.error(`✖ Shared first-load JS ${sharedKB} kB exceeds budget ${budgetKB} kB`)
  process.exit(1)
}
console.log(`✓ Shared first-load JS ${sharedKB} kB within budget ${budgetKB} kB`)
