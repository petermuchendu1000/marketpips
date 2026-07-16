// lib/markets/chart-scale.ts
// ------------------------------------------------------------
// Shared "nice" probability Y-axis scaling for the market-detail charts.
//
// Polymarket does NOT pin the probability axis to 0–100%. It zooms to the data:
// the axis starts at 0, rises to a rounded ceiling with ~30% headroom above the
// series' historical max, and lands on nice round ticks with ~4–5 gridlines.
// Verified live (2026-07):
//   • multi-outcome board, leader hist-max ~22%  -> 0 / 10 / 20 / 30%
//   • binary market, "24% chance", hist-max ~45% -> 0 / 15 / 30 / 45 / 60%
//
// Passing the SAME series max through this helper reproduces both exactly.

/** Round step candidates (as probabilities 0–1), smallest first. */
const STEPS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 1]

/**
 * Compute a PM-style dynamic axis for a set of probability values (0–1).
 * @param maxVal highest plotted probability across the visible series/history.
 * @returns `{ max, ticks }` — the axis ceiling and the ordered tick values.
 */
export function niceProbScale(maxVal: number): { max: number; ticks: number[] } {
  if (!(maxVal > 0)) maxVal = 0.1
  const target = Math.min(1, maxVal * 1.3)
  let step = 1
  for (const s of STEPS) {
    if (target / s <= 5) {
      step = s
      break
    }
  }
  const max = Math.min(1, Math.ceil(target / step - 1e-9) * step)
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(4)))
  return { max, ticks }
}
