# Portfolio — Design Dossier (Pip system)

Route: `/portfolio` · Status: rebuild on the Pip design system.

## 1. Research (why the references work)
- **IBKR web portfolio dashboard** — dense, trustworthy, numbers-first. A top
  band of KPI tiles (net liq, day P&L, unrealized P&L, cash) anchors the page;
  a sortable holdings grid carries the detail. Monospaced figures + tight rows
  read like an institutional book, not a consumer app. We borrow the KPI band
  and the numeric discipline; we drop the visual clutter and 12-column noise.
- **Tremor / Next.js finance dashboards** — clean KPI `Card`s with a label, a
  large value and a subtle delta; a single accent chart. We borrow the calm
  card rhythm and one focused visualization (allocation donut) rather than a
  wall of charts.

## 2. User goals
1. "What is my account worth right now?" → total value (holdings MTM + cash).
2. "Am I up or down — today and overall?" → day P&L + unrealized P&L, signed.
3. "Which positions drive that?" → holdings table, weight-ranked.
4. "Where is my money concentrated?" → allocation donut.
5. "What happened to my cash?" → transaction history.

## 3. Information architecture
```
Portfolio
├── KPI band        total value · unrealized P&L (%) · today's P&L · cash (USD)
├── Holdings
│   ├── Allocation donut         weight by market value (open positions)
│   └── Holdings table           position · avg cost · live · mkt value · P&L $/% · weight
│                                 (per-row expand → shares, invested, entry, links)
└── Recent activity              deposits, bets, settlements
```

## 4. Valuation model (single source of truth: `lib/portfolio.ts`)
- Open positions are marked to the **live** market price (never the stale
  `positions.current_value_usd` snapshot). Settled positions use their $1/$0
  payout. `summarizePortfolio()` returns both the per-position P&L and totals.
- **Cash (USD):** Σ `localToUsd(wallet.available_balance)` over wallets, using
  `fetchRatesMap()` (anon-readable `exchange_rates`, falls back to last-known).
- **Total value:** open-position market value + cash.
- **Today's P&L:** for each open position, mark it at the earliest
  `price_history` point recorded since 00:00 UTC ("day open") and sum
  `currentValue − dayOpenValue`. Markets with no tick today contribute 0. This
  is honest (no fabricated intraday series) and degrades gracefully.
- **Weight:** `currentValue / Σ open currentValue`.

## 5. Component spec
- `SummaryCards` — 4 KPI tiles, `.card`; signed values use `--yes/--no`; today's
  P&L and unrealized P&L show a signed delta chip. Neutral when flat.
- `AllocationDonut` — recharts `PieChart`, tokenized categorical palette, center
  label = total holdings value; legend rows show weight %. Empty state when no
  open positions.
- `HoldingsTable` — semantic table wrapped in `.table-wrapper` (overflow-x on
  narrow panels). Columns: Position, Avg cost (¢), Live (¢), Mkt value, P&L
  ($ + %), Weight (with a `.prob-bar`-style meter). Each row expands to reveal
  shares, invested, entry price, side, and a link to the market. Gains/losses
  are color-coded; monospace for all figures.
- `TransactionHistory` — custom-icon rows (no emoji), signed amounts.

## 6. A11y / SEO / performance
- Table uses real `<th scope>`; expand buttons are `<button aria-expanded>`.
- Donut has an `aria-label` text summary; color is never the only signal
  (labels + signs carry meaning) — WCAG 1.4.1.
- Page is `force-dynamic` (personal data, no prerender, `noindex`).
- Server-computes all figures; client bundles only the donut + expand state.

## 7. Review gates
Would IBKR traders trust the numbers? (live MTM, no stale snapshot) ✓
Is every figure monospaced and aligned? ✓ · Is color ever the only signal? ✗ (signs/labels too) ✓
Any emoji / lucide / shadcn tokens? ✗ — pure Pip system. ✓
