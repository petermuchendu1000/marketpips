# PM candidate Order-Book drawer — measured ground truth (desktop)

Source: live `https://polymarket.com/event/presidential-election-winner-2028`,
desktop 1440-wide, captured with `tools/pm-parity/capture_drawer.py` +
`capture_drawer2.py` (Playwright, computed styles + pixel geometry) on
2026-07-18. Target candidate: **JD Vance**. Every value is read from the
running page — not a guess. Screenshots: `02-after-candidate-click.png`,
`04-tab-order-book.png`, `06-ob-full.png`.

## Behavior (what clicking a candidate does)
Clicking a candidate **row** (name/price area — NOT the Buy buttons) **does not
navigate**. It **expands an inline drawer in place**, directly under that row:
+276 DOM nodes, **+409px** page height. Clicking again collapses it. The right-
rail Buy ticket simultaneously **arms** to that candidate (Yes/No prices update).
Only one candidate drawer is open at a time (accordion).

The drawer has a **tab bar**: **Order Book** (default/active, near-black) ·
**Graph** · **Resolution** (inactive, muted). To the right of the tabs:
🪙 **Maker Rebate** (gold), **+ Rewards** (blue link), a refresh icon, and a
**0.1¢** tick chip (muted).

## Candidate row (the click target)
| Element | Measured |
|---|---|
| Avatar | rounded-square entity image, left |
| Name | e.g. "JD Vance", bold near-black |
| Sub-label | e.g. "$14,685,617 Vol." muted `rgb(119,128,141)` |
| Center | big **20%** probability + **▼7%** change chip in red `rgb(226,57,57)` |
| Right | **Buy Yes 19.8%** (green filled) + **Buy No 80.3%** (red/pink tint) pills |

## Tab bar
`Order Book` · `Graph` · `Resolution` — text buttons, active = near-black,
inactive = muted. Right cluster: `Maker Rebate` (gold `#F5B23B`,
`lab(72.7 31.9 97.9)`, 14px/600), `Rewards` (pip-blue link, 14px/600),
refresh icon, `0.1¢` chip (`rgb(119,128,141)`, 12px/500).

## Order-book table — layout & geometry
Four logical columns; **row pitch = 36px**.
| Column | Header (10px/600, uppercase, muted `rgb(119,128,141)`) | x (1440 vp) |
|---|---|---|
| Toggle | **Trade Yes** (10px/600 muted) + switch icon → flips book to **Trade No** | 64 |
| Price | **PRICE** | 506 |
| Shares | **SHARES** | 684 |
| Total | **TOTAL** | 872 |

Rows are ordered **asks descending → Last/Spread divider → bids descending**.

### Price cell (two-part, per row)
- Primary `XX.X%` — **bold**, colored by side.
- Secondary `(XX.X¢)` — muted `rgb(119,128,141)`, same value in cents.
- **Asks** primary color = red `rgb(226,57,57)` (== repo `--no` #E23939).
- **Bids** primary color = green `rgb(48,161,89)` (== repo `--yes` #30A159).
- Shares & Total = near-black **`rgb(24,24,27)`** (zinc-900 #18181B — note desktop
  uses zinc-900, not the mobile sheet's `rgb(14,15,17)`), `tabular-nums`.

### Side pills (badge on the boundary row)
| Pill | Measured |
|---|---|
| **Asks** | white text `rgb(255,255,255)` 10px/500 on red `rgb(226,57,57)` badge, **absolute**, ~36×20, left (x≈70), sits on the last ask row |
| **Bids** | white text on green `rgb(48,161,89)` badge, ~33×20, left (x≈70), on first bid row |

### Depth bars
Left-anchored horizontal fill behind each row, colored by side
(asks red `rgb(226,57,57)`, bids green `rgb(48,161,89)`), height = full row
(36px), **width ∝ cumulative size** at that level (measured 28–36px at these low-
depth levels; grows toward the row width for deep levels). Rendered as a tinted
bar under the text (subtle, low-opacity look in-page).

### Last / Spread divider (between asks and bids)
`Last: 19.7% (19.7¢)` (left) · `Spread: 0.1¢` (center-right, x≈484) — both
**12px/600**, muted `rgb(119,128,141)`.

## Captured snapshot (JD Vance, 2026-07-18) — exact ladder
```
        PRICE            SHARES        TOTAL
Asks  20.3% (20.3¢)     3,300.62     $11,838.53
      20.2% (20.2¢)     3,079.91     $11,168.50
      20.1% (20.1¢)     7,345.00     $10,546.36
      20.0% (20.0¢)    15,646.93      $9,070.01
      19.9% (19.9¢)    25,960.71      $5,940.62
      19.8% (19.8¢)     3,911.33        $774.44   [Asks]
Last: 19.7% (19.7¢)                 Spread: 0.1¢
      19.7% (19.7¢)    29,879.72      $5,886.30   [Bids]
      19.6% (19.6¢)    20,685.43      $9,940.64
      19.5% (19.5¢)     2,917.71     $10,509.59
      19.4% (19.4¢)     7,429.26     $11,950.87
      19.3% (19.3¢)       412.00     $12,030.39
      19.2% (19.2¢)       412.00     $12,109.49
      19.1% (19.1¢)     6,712.00     $13,391.48
```
Note **TOTAL is cumulative** down each side from the inside price outward
(e.g. bids: 5,886.30 → 9,940.64 → … increasing), not per-row notional.

## Tab states (all three captured)
### Order Book (default)
The depth table documented above. Header row shows **`TRADE YES`** (10px/600
muted) + a small layout icon — this is a **static heading** (the book already
shows both sides: asks = Yes sells, bids = Yes buys); it is not a Yes/No flip.
The book **auto-refreshes** live (observed top ask move 20.3% → 20.5% between
polls) — the refresh icon in the tab-bar right cluster forces a re-fetch.

### Graph (`04-tab-graph.png`)
Per-candidate **Yes-probability line chart** inside the drawer:
- Header: large **blue** current value (e.g. `19.7%`) + change chip
  (`▼7%` red) — the candidate's implied Yes probability + period change.
- Single line (this candidate only, blue), y-axis auto-scaled (~10%→35% here),
  faint `Polymarket` watermark.
- Time-range buttons: **`1H · 6H · 1D · 1W · 1M · ALL`** (same set as the top
  market chart). Default `ALL`.

### Resolution (`04-tab-resolution.png`)
Minimal: a **`Propose resolution`** outlined button (left) + **`View details ↗`**
link (right, opens the UMA/resolution details). No table.

## Color → repo token map
| PM computed | Meaning | Repo token |
|---|---|---|
| `rgb(226,57,57)` | asks / down / No | `--no` `#E23939` |
| `rgb(48,161,89)` | bids / up / Yes | `--yes` `#30A159` |
| `rgb(24,24,27)` | table numerals | zinc-900 `#18181B` |
| `rgb(119,128,141)` | muted labels / ¢ / headers | `--muted` `#77808D` |
| `#F5B23B` (`lab(72.7 31.9 97.9)`) | Maker Rebate | gold/amber |
| pip-blue | Rewards link / Trade btn | `--primary` `#1452F0` |

## Candidate list (full board) — additional observations
From `06-ob-full.png` (whole board with JD Vance expanded):
- **Accordion frame**: the expanded candidate + its drawer are wrapped in a
  single **rounded, hair-lined card** (subtle 1px border) that visually groups
  the row with its order book. Collapsed rows are **borderless** (just a bottom
  hairline divider between rows).
- **Change chip** direction: gainers show **▲ green** (Marco Rubio `▲8%`),
  losers **▼ red** (Gavin Newsom `▼2%`, AOC `▼2%`, JD Vance `▼7%`). Chip color
  matches direction; magnitude in %.
- **Rewards gift icon** 🎁 appears after `$Vol.` on liquidity-rewards-eligible
  candidates (Marco Rubio, Gavin Newsom, AOC, Jon Ossoff) — NOT on all rows.
- **Buy buttons** truncate the side word when the % is wide: `Buy Y... 19.8%`,
  `Buy ... 80.3%`; green = Yes (`--yes` tint bg + green text), red = No
  (`--no` tint bg + red text). Full form on narrower numbers: `Buy Yes 14.1%`,
  `Buy No 86%`.
- Rows are sorted by probability descending; big `%` is the mid/last implied
  Yes probability, left of the change chip.
- Right rail arms to the expanded candidate: header shows entity avatar +
  "Presidential Election Winner 2028 / **JD Vance · Yes**".

## Implications for our CLOB UI (phase 3)
- The drawer is an **accordion under the clicked candidate row**; our
  `candidate-list.tsx` row must render an expandable region (not a route).
- Order-book table is fed by `clob_get_book(market_id, option_id, side)` —
  our function already returns `bids`, `asks`, `last`, `spread`. We must add a
  **cumulative TOTAL** accumulation client-side and the `¢`+`%` dual format.
- `Trade Yes / Trade No` toggle flips which side's book perspective is shown
  (our `clob_get_book` already synthesizes the opposite side).
- Depth bar width = level cumulative size ÷ max cumulative size on that side.
- Tabs Graph/Resolution reuse existing per-option chart + resolution content.
