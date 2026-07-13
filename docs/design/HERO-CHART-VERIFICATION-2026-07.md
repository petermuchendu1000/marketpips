# Hero Binary Chart — Endpoint Verification & Domain Fix (2026-07)

> Closes the open diagnostic thread from the previous session: "the binary
> hero legend says *Yes 46.0%* but the chart line appears to end near ~60% on a
> 50–90% axis." Verified end-to-end against live Supabase data — **no rendering
> bug existed**; the mismatch was stale Next.js dev-fetch cache. While
> confirming this, an exhaustive scan surfaced a **real latent domain bug** that
> is now fixed and regression-guarded.

## 1. Endpoint anchoring — VERIFIED CORRECT

Replicated `getOptionSeries` (binary path) + `ProbLines` domain math against the
live Ruto market (`fd87f013-3819-4f68-be5b-8460beb0de60`):

| Check | Result |
| --- | --- |
| price_history rows (yes line, `market_option_id IS NULL`) | 90 points, Apr 14 → Jul 13 |
| Series endpoint value | `0.46` — **exactly** equals market `yes_price` (legend) |
| Series min / max | `0.46` / `0.71618` |
| Computed auto-domain | **40 / 50 / 60 / 70 / 80%** (not the stale 50–90%) |
| Endpoint position | 15% up from the bottom → sits just under the 50% line, at 46% ✓ |

The old screenshot (endpoint ~60% on a 50–90 axis) was rendered *before* the
final 90-day re-seed and served from the dev server's in-memory fetch cache.
Current code + data render the endpoint at the correct 46%.

## 2. Binary line colour — trend-based is CORRECT

The single Yes line is coloured green when the current probability is ≥ the
period-start probability, red otherwise (`var(--yes)` / `var(--no)`). This
matches Polymarket's measured semantics (ground-truth doc: *YES/up = green
`#42c772`, NO/down = red `#e23939`*; detail header delta ▲green / ▼red). A prior
prose note suggested "always green" — that was an unimplemented assumption and
would have been wrong. No change made.

## 3. `niceDomain` clipping bug — FIXED

The old `niceDomain` floored `lo` to a step boundary then set `hi = lo + 4·step`,
which could leave `hi < max`. An exhaustive scan over 1%-granular ranges found
**240 inputs** where the data max fell above `hi` and got clamped flat against
the top gridline (via the `yOf` clamp). Example: `min=0.07, max=0.21` → old
domain `[0, 0.20]`, clipping the 0.21 peak.

**Fix** (`lib/markets/chart-domain.ts`, extracted from `prob-lines.tsx` so it is
unit-testable): select the smallest "nice" step whose 5-tick band provably
contains the padded data range. Guarantees for every input in [0,1]:
`lo ≤ min`, `hi ≥ max`, `0 ≤ lo < hi ≤ 1`, exactly 5 strictly-increasing ticks,
and a readable minimum span for near-flat data. The Ruto case is unchanged
(`[0.4, 0.8]`).

Regression guard: `lib/__tests__/chart-domain.test.ts` (exhaustive coverage +
the previously-clipping cases + the Ruto endpoint invariant).
