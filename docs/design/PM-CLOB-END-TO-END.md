# Polymarket CLOB — end-to-end (behavior · backend · frontend · hard data)

Comprehensive reference for how PM's per-candidate **Central Limit Order Book**
works when you click a market option, and how our system mirrors it. Ground
truth is **live-measured** from `polymarket.com/event/presidential-election-winner-2028`
(desktop, 1440-wide, 2× DPR) on **2026-07-18** with Playwright — computed styles,
pixel geometry, font stacks, transitions, and hover states pulled from the
running page. Capture harness: `tools/pm-parity/` + `/home/user/pm-live/`.

Companion docs: `CLOB-ARCHITECTURE.md` (why/design), `PM-CLOB-DRAWER-MEASURED-2026-07.md`
(first measurement pass). This file is the consolidated end-to-end + fresh
hard-data appendix + the parity refinements applied to our drawer.

---

## 0. TL;DR of the interaction

Clicking a **candidate row** (avatar / name / big % — *not* the Buy pills) does
**not navigate**. It expands an **inline accordion drawer in place**, directly
under that row (+276 DOM nodes, **+409px** page height, re-measured live). Only
one drawer is open at a time. The right-rail Buy ticket simultaneously **arms**
to that candidate (header shows `Presidential Election Winner 2028 / JD Vance · Yes`,
Yes/No prices update). Clicking the row again collapses it.

The drawer has three tabs — **Order Book** (default) · **Graph** · **Resolution** —
plus a right-hand chrome cluster: 🪙 **Maker Rebate** (gold) · **+ Rewards**
(blue) · refresh icon · **0.1¢** tick chip.

---

## 1. State machine (what each state renders + where its data comes from)

### 1a. Order Book (default tab)
**Frontend.** A depth table with a heading row (`TRADE YES` + a 2-column layout
glyph, then `PRICE / SHARES / TOTAL`), then rows ordered **asks descending →
Last/Spread divider → bids descending**:
- **Price** cell = two parts: `XX.X%` bold, colored by side (asks red, bids
  green) + `(XX.X¢)` muted — probability % and ¢ price are numerically identical
  on a $1 contract.
- **Shares** = resting size at that level; **Total** = **cumulative** notional
  from the inside price outward (not per-row).
- **Depth bar** = left-anchored tinted fill behind each row, side-colored, full
  row height (36px), width ∝ cumulative size ÷ deepest cumulative on that side.
- **Asks / Bids pills** = small white-on-color badges on the boundary rows.
- **Last / Spread** divider between the two sides (`Last: 19.8% (19.8¢)` ·
  `Spread: 0.1¢`).
The table **auto-refreshes live** (top of book was observed moving between polls);
the refresh icon forces a re-fetch.

**Backend.** `GET /api/markets/[id]/book?option=&side=` → `clob_get_book`
(SECURITY DEFINER RPC). Returns aggregated `bids`, `asks`, `last`, `best_bid`,
`best_ask`, `spread`. The **NO/opposite side is synthesized** from the YES book
(a resting BUY NO @ q is an implied SELL YES @ 100−q via minting), so one book
powers both perspectives. No counterparty identity leaks (aggregated depth only).
Public, cached 1–2s. The UI adds cumulative TOTAL + depth ratios client-side via
`shapeBook`/`withCumulativeTotals` in `lib/clob.ts`.

**States:** `loading` (skeleton) · `empty` ("No open orders on this book yet.")
· `error` ("Could not load the order book") · `live` (polled every 4s while the
tab is visible; polling stops when you switch tabs — saves requests + battery).

### 1b. Graph tab
**Frontend.** The candidate's **YES-probability line chart** inside the drawer:
a large **blue** current value (e.g. `19.7%`) + a change chip (`▼7%` red), a
single blue line (this candidate only), auto-scaled y-axis (~10%→35% here), a
faint `Polymarket` watermark, and the time-range buttons `1H · 6H · 1D · 1W ·
1M · ALL`.

**Backend.** `GET /api/markets/[id]/price-history?option=&max_points=200` →
per-option `price_history`. Lazy-loaded the first time Graph opens; reuses the
shared `PriceChart` component (same chart engine as the top market chart).

**States:** `loading` (pulse) · `empty` ("No price history yet.") · `loaded`.

### 1c. Resolution tab
**Frontend.** Minimal: a **`Propose resolution`** outlined pill (left) + a
**`View details ↗`** link (right, opens the UMA/resolution detail). Criteria
text renders below when available.

**Backend.** Static per-market resolution metadata (criteria, `resolves_at`,
UMA proposal link). No table; resolution/settlement itself is the existing admin
resolve flow (`admin_resolve_market_options*` migrations).

---

## 2. Backend end-to-end (the order book itself)

**Data model (migration `030_clob_foundation.sql`).**
- `markets.pricing_engine` `'amm' | 'clob'` (default `'amm'` — additive &
  reversible; rollback = flip the flag).
- `clob_orders` — resting/working orders (market, option, user, wallet, side
  yes|no, action buy|sell, type, `price_cents numeric(4,1)` on a **0.1¢** tick,
  size, filled, status, currency + `exchange_rate_to_usd`, `reserved_usd`,
  timestamps, `client_order_id`).
- `clob_fills` — immutable trade prints (price, size, taker/maker order + user,
  `match_kind` direct|mint|burn).
- Partial indexes for O(log n) best-price scans over open/partially-filled
  orders; RLS: owner-only orders, participant-only fills.

**Matching (`clob_place_order`).** Taker BUY YES @ p fills best-price-then-oldest
against (1) **direct** resting SELL YES @ ask ≤ p, and (2) **mint**: resting BUY
NO @ q with p+q ≥ 100 — $1 mints a YES+NO set (taker pays 100−q, maker pays q).
Symmetric for BUY NO; SELL = direct or **burn**. Execution price = **maker's**
resting price. Remainder of a limit order rests; a market order drops it.
Everything (wallet debit/credit, `positions`, `clob_fills`, `transactions`,
`price_history`, activity ledger) happens in **one atomic RPC** with `FOR UPDATE`
row locks — no double-spend, no partial state. Self-match prevention skips your
own resting orders (anti-wash). `clob_cancel_order` releases escrow.
Buy-side (direct + mint) is live; sell/burn + expiries + maker rebates land in 1b′.

**API layer.** `POST /api/orders` gains a CLOB branch when
`market.pricing_engine='clob'` (authoritative server-side check; market-buy $ →
shares via best ask; zod-validated; SQLSTATE→HTTP map in `lib/clob.ts`
`CLOB_ERRORS`). `POST /api/orders/cancel` → `clob_cancel_order`. A `flags.clob`
kill-switch gates the whole feature.

---

## 3. Frontend end-to-end (our implementation)

- `candidate-list.tsx` renders each option row; on CLOB markets it renders an
  expandable region (accordion) instead of navigating, and enables **Buy No**
  per candidate. Gated on `pricing_engine='clob'` + `flags.clob`.
- `order-book-drawer.tsx` is the drawer: tab state machine, book polling (4s,
  tab-visible only), lazy Graph history, Resolution CTA. Depth table built from
  the shaped book.
- `order-book-table.tsx` is the **shared** order-book module: `useClobBook`
  (fetch + 4s poll while visible), `BookTable` (the depth table), and
  `OrderBookPanel` (self-contained fetch+table). BOTH the desktop
  `OrderBookDrawer` (Order Book tab) and the mobile `MarketDrawer` (Order Book
  section) render it — one rendering, one data path, no drift. The table gaps
  tighten on mobile (`gap-6 sm:gap-10`) to fit the narrow bottom sheet.
- `market-drawer.tsx` (mobile bottom sheet, name-tap target) renders
  `OrderBookPanel` when `pricing_engine==='clob'`, else the honest "depth isn't
  available" message. Previously this section was a hard-coded placeholder — now
  wired to the live book.
- `lib/clob.ts` is the framework-free single source of truth: tick clamp,
  `dualPriceLabel`/`formatCents`/`formatPercent`, `withCumulativeTotals`
  (cumulative TOTAL + `depthPct`), zod schema, error map. Unit-tested
  (`lib/__tests__/clob.test.ts`).
- Tokens: asks `--no #E23939`, bids `--yes #30A159`, muted `--text-3 #77808D`,
  tab-hover `--ink-300 #AEB4BC`, numerals `--text-primary`, gold `--amber`,
  Rewards/links `--pip-text`. All map 1:1 to PM's live-computed colors.

---

## 4. Hard-data appendix (live-measured 2026-07-18, `/home/user/pm-live/`)

**Document.** Font stack `inter, "inter Fallback", sans-serif`. Drawer hairline
border = `rgb(230,232,234)` (== `--ink-100 #E6E8EA`).

**Tab bar** (`Order Book / Graph / Resolution`), row at y≈502:
| Prop | Value |
|---|---|
| font | 14px / 600, `inter` |
| active color | `rgb(24,24,27)` (zinc-900) |
| inactive color | `rgb(119,128,141)` (== `--text-3`) |
| **hover (inactive)** | color **lightens** `rgb(119,128,141) → rgb(174,180,188)` (== `--ink-300`); active tab unchanged |
| letter-spacing | `-0.09px` |
| line-height | 16px |
| transition | `color/background/border 0.15s cubic-bezier(0.4,0,0.2,1)` |
| tab gap | ~16px |

**Right chrome:** Maker Rebate `14px/600` gold `lab(72.72 31.87 97.94)` (≈
`#F5B23B`), x≈712 · Rewards `14px/600` pip-blue link, x≈844 · `0.1¢` tick
`12px/500` muted `rgb(119,128,141)` in a bordered chip, x≈957.

**Depth table:** heading `TRADE YES` `10px/600` uppercase, letter-spacing
`0.5px`, muted, y≈545. Row pitch **36px**. Depth bars left-anchored at x≈62,
height 36px, asks `rgb(226,57,57)` (7–8px wide at these levels), bids
`rgb(48,161,89)` (20–35px, growing with cumulative). Asks/Bids pills `36×20` /
`33×20` on the boundary rows.

**Fresh ladder (JD Vance):**
```
        PRICE            SHARES        TOTAL(cum)
Asks  20.1% (20.1¢)     7,345.00     $10,659.37
      20.0% (20.0¢)    15,446.93      $9,183.02
      19.9% (19.9¢)    26,585.71      $6,093.63
      19.8% (19.8¢)     4,055.89        $803.07   [Asks]
Last: 19.8% (19.8¢)                 Spread: 0.1¢
      19.7% (19.7¢)    30,879.72      $6,083.30   [Bids]
      19.6% (19.6¢)    20,399.43     $10,081.59
      19.5% (19.5¢)     3,565.71     $10,776.90
      19.4% (19.4¢)     7,413.26     $12,215.07
```
TOTAL is cumulative from the inside price outward (confirms `withCumulativeTotals`).

---

## 5. Parity refinements applied to `order-book-drawer.tsx` (this pass)

Backed by §4 hard data:
1. **Tab hover fixed direction** — was darkening to `text-secondary`; now
   **lightens** to `var(--ink-300)` (#AEB4BC), matching PM exactly. Added
   `duration-150` + `tracking-[-0.09px]`.
2. **Right chrome sizing** — Maker Rebate + Rewards now `text-sm` (14px), the
   tick is a `text-xs` (12px) **bordered chip** (was plain 12px text).
3. **`TRADE YES` heading** — added the small 2-column layout glyph PM shows.
4. **Resolution tab** — added the **`View details ↗`** link (right) alongside
   `Propose resolution`; criteria text moved below.

Transitions already matched (Tailwind `transition-colors` = 150ms
cubic-bezier(0.4,0,0.2,1)); depth-bar cumulative normalization already matched.

---

## 6. Cross-cutting checklist (where each concern lives)

Security/authz: RLS owner-only orders, SECURITY DEFINER aggregated book, server
authoritative `pricing_engine` check · Validation: zod + tick/range/size, wallet
currency, self-match prevention · Concurrency: `FOR UPDATE` locks + serialization
retry · Rate limiting: per-user order cap (1b′) · Observability: structured
match logs, fills→analytics, `audit_log` · Testing: pgTAP invariants (ΣYES=ΣNO,
no negatives, price-time priority), vitest units on `lib/clob.ts`, E2E on the
drawer · Migrations/rollback: forward-only idempotent SQL, rollback = flag ·
Performance: partial indexes + edge cache 1–2s · i18n/currency: orders carry
currency + FX, book shown in viewer currency, matched in USD-cents · Feature
flags: `flags.clob` kill-switch · a11y: `role=tablist/tab`, `aria-selected`,
`aria-label`s on refresh/pills.
