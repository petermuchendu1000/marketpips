# Kalshi Hero — Ground-Truth Teardown

> Source of truth: the **fully-rendered Kalshi homepage hero DOM** (captured in a real
> browser after Kalshi's Vercel Security Checkpoint) plus Kalshi's **compiled CSS
> design tokens**. Live re-scraping is blocked by Vercel bot protection (HTTP 429 →
> JS challenge), so the captured DOM + tokens are authoritative. A local re-render of
> the captured DOM is stored at `docs/design/assets/kalshi_hero_groundtruth_slide.png`.
>
> This doc supersedes the Polymarket teardown for the hero. Our current hero is a
> Polymarket reproduction and must be re-mapped element-by-element to Kalshi.

---

## 0. High-level anatomy

The hero is a **single auto-advancing carousel** — one card, one visible slide at a time,
7 slides cycling. It is NOT the Polymarket "big card + rail" split we currently ship.

```
┌──────────────────────────────────────────────────────────────────┐
│ [icon] CATEGORY (overline)                                          │  ← header row
│ Condensed bold headline (market/event title)                        │
│                                                                     │
│  ── one of three body layouts ──                                    │
│  A) Multi-outcome table   B) Binary Yes/No   C) Chart-led (BTC)     │
│                                                                     │
│ $X vol                                             N more           │  ← footer row
└──────────────────────────────────────────────────────────────────┘
        ● ● ● ● ● ● ●   ← carousel progress dots / auto-advance
```

### Container
- Class stack: `relative flex flex-col justify-between w-full gap-1 p-3 pb-2 overflow-hidden
  border border-solid market-slide-container bg-container-x40 border-stroke-x40 rounded-x40 sm:mt-2 sm:p-2`
- **Fixed height: `26rem` (416px)**, `touch-action: pan-y` (vertical scroll allowed, horizontal swipes the carousel).
- `overflow-hidden` — content below the fold (e.g. the news/comment peek) is intentionally clipped.
- Background `--container-x40: #80808005` (near-transparent grey), border `--stroke-x40: #0000000f`, radius `rounded-x40` = **12px**.
- Slides are absolutely stacked (`absolute top-0 left-0`), transitioning with
  `transition-all duration-300 ease-in-out`, using `opacity` + `translate-x-full/0` (slide-in from right).
- Mobile: padding drops `p-3 → sm:p-2`, adds `sm:mt-2`.

### The 7 captured slides (proves the layout variants)
| # | Category | Title | Body layout |
|---|----------|-------|-------------|
| 1 | Sports | 2026 FIFA World Cup Winner | A — multi-outcome (France 40%, England 22%, +2 more) |
| 2 | Elections | South Carolina Republican Senate special primary winner? | A — multi-outcome |
| 3 | Elections | Maine Democratic Senate nominee on Jul 31, 2026? | A — multi-outcome |
| 4 | Elections | Maine Senate winner? (Person) | A — multi-outcome |
| 5 | Crypto | BTC 15 min | C — chart-led, intraday x-axis |
| 6 | International | When will traffic at the Strait of Hormuz return to normal? | mixed |
| 7 | Economics/Finance | Taco Bell Crunchwrap Supreme price in July 2026 | chart-led |

---

## 1. Design tokens (from Kalshi compiled CSS — EXACT)

### Text colors
- `--text-x10: #000000e6` (rgba 0,0,0,.9) — primary text
- `--text-x20: #0000008c` (rgba 0,0,0,.55) — secondary/muted
- `--text-x30: #0000004d` (rgba 0,0,0,.3) — tertiary/disabled
- `--text-white / --text-inverse: #fff`

### Fills / surfaces / strokes
- `--fill-x40:#0000001a` (.10), `--fill-x50:#00000012` (.07), `--fill-x55:#0000000d` (.05), `--fill-x60:#00000008` (.03)
- `--surface-x10..x40: #fff`, `--surface-inverse:#1a1a1a`, `--surface-overlay:#0006`
- `--container-x40:#80808005`, `--container-x30:#0000000d`
- `--stroke-x10:#000000e6`, `--stroke-x20:#0003`, `--stroke-x30:#0000001a`, `--stroke-x40:#0000000f`

### Semantic market colors (YES/NO = green/red)
- YES/green: `--green-x10 / --kalshi-palette-yes-x10 = rgba(10,194,133,1) = #0ac285`
  - x20 `.08` tint, x30 `.16` tint, x40 `#08a370`, x50 `#067450`
- NO/red: `--red-x10 / --kalshi-palette-no-x10 = rgba(217,22,22,1) = #d91616`
  - x20 `.06`, x30 `.10`, x50 `#820d3e`
- **Brand mint** (used for chart lines, NOT green-x10): `--brand-primary = #28cc95 = rgba(40,204,149,1)`,
  `--brand-secondary=#003221`, `--kalshi-palette-brand-x60=rgba(0,195,130,1)`
- Chart accent palette: `--blue-x10:#265cff`, `--orange-x10:#ff6a00`, `--teal-x10:#00b5d9`,
  `--purple-x10:#a0f`, `--yellow-x10:#ffd600`
- Brand gradient: `radial-gradient(100% 100% at 0% 100%, #00B5D9 0%, #265CFF 31.77%, #AA00FF 66.15%, #D90048 100%)`

### Radii (mapped from usage)
- `rounded-x20 ≈ 6px`, `rounded-x30 ≈ 8px`, `rounded-x40 = 12px`, `rounded-x50 = 16px`, `rounded-full`

### Fonts
- `--font-kalshi-sans: "kalshiSans"` — body / UI / numbers (with `tnum lnum case` feature settings)
- `--font-kalshi-condensed: "kalshiCondensed"` — headlines (`typ-headline-*`, `typ-title-*`)
- `--font-graphik-wide-super[-italic]` — display/marketing only (not in hero body)
- Global: `font-synthesis:none; text-rendering:optimizeLegibility; -webkit-text-size-adjust:100%`

### Layout tokens
- `--content-width:1320px`, `--top-navbar-height:107px`, `--header-height` = banner+navbar+announcement stack
- `--trader-drawer-width:360px` (lg 300px), `--mobile-bottom-navbar-height:68px`

### ⚠ GAP for pixel-perfection
The compiled definitions of the **`typ-*` classes** (exact font-size / line-height / weight /
letter-spacing) are NOT in the captured token file. Current best-known values are used as
placeholders (see §2) and must be replaced with the exact rules. One DevTools copy of the
computed `.typ-headline-x20`, `.typ-body-x20`, `.typ-emphasis-x20`, `.typ-overline-x10`
(etc.) rules locks this down.

---

## 2. Typography scale (`typ-*`) — classes observed

Observed in the hero (weights/sizes are BEST-KNOWN placeholders pending exact rules):

| Class | Use in hero | Placeholder (px / lh / weight) |
|-------|-------------|--------------------------------|
| `typ-overline-x10` | category label (uppercase) | 11 / 14 / 590, +tracking, uppercase |
| `typ-headline-x20` | slide title (condensed) | 26 / 30 / 600, condensed |
| `typ-headline-x10` | smaller headline | 22 / 26 / 600 |
| `typ-title-x20 / x10` | section titles | 20 / 18 |
| `typ-emphasis-x30/x20/x10` | %, emphasised values | 16/14/12, weight ~510 |
| `typ-body-x30/x20/x10` | outcome names, meta | 16/14/12, weight 400 |
| `typ-tabular` / `tabular-nums` | all numbers | `font-variant-numeric: tabular-nums` |

Numbers always use `font-kalshi-sans` + `tabular-nums` (+ `font-feature-settings:"tnum","lnum","case"`).

---

## 3. Element: HEADER ROW

```
[icon 28px] Sports
```
- Wrapper: `flex min-w-0` › `inline-flex items-center gap-1.5 min-w-0`
- **Icon**: 28×28 rendered (source 56×56 webp, `size=sm`), inside a `size-3.5` (14px) box with
  `-left-px -top-px box-content`, `rounded-x20` (6px), `border border-stroke-x40`.
  `object-fit:cover`, `border-radius:6px`. `loading=lazy`.
- **Category label**: `<span class="font-kalshi-sans typ-overline-x10 min-w-0 truncate text-text-x20">Sports</span>`
  → uppercase overline, secondary color (`--text-x20`), truncates.
- Title link wraps an `<h2 class="m-0 font-kalshi-condensed typ-headline-x20 flex items-center sm:min-h-10">`,
  `no-underline text-text-x10`, `max-w-[calc(100%-175px)] sm:max-w-full` (leaves room for right-side controls on desktop).

---

## 4. Element: BODY LAYOUT A — Multi-outcome table

Columns (overline headers): **`Market` · `Pays out` · `Odds`** (some slides omit "Pays out").
Each row is an `<a>` to the sub-market:
- `flex items-start gap-1.5 no-underline -m-1 p-1 hover:bg-fill-x60 rounded-x30`
- hover transform: `transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]`
  and `[&:active:not(:has(button:active))]:scale-95` (springy press).
- **Left**: 28px squircle avatar (`rounded-x20`) or none, then a 2-line block:
  - name — `font-kalshi-sans font-normal typ-body-x20 line-clamp-2 hover:opacity-80 text-text-x10`
  - sub/desc — `typ-body-x20 truncate text-text-x20` (e.g. "Cleveland")
  - meta row — `typ-body-x10 text-text-x10`: `"$104,270,878 vol"` · `"30 markets"`
- **Right** (`flex flex-col items-end justify-center shrink-0`):
  - big % — `typ-emphasis-x20 text-text-x10` with `<span class="tabular-nums">47</span>%`,
    color transitions `duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`
  - delta — `flex items-center gap-0.5`: arrow glyph `▲`/`▼` + number,
    `typ-emphasis-x10 leading-[18px]`, colored `text-green-x10` (up) / `text-red-x10` (down).
- **Odds pills are BUTTONS**: `appearance-none relative inline-flex cursor-pointer items-center …`
  containing the % — clickable to trade (YES/NO quick-buy). 50 such buttons across the carousel.
- Footer: `"$X vol"` (left) and `"N more"` (right) in `typ-body-x10 text-text-x20`.

---

## 5. Element: BODY LAYOUT B — Binary Yes/No
Single-outcome markets show a Yes/No pair (green YES pill + red NO pill), same right-aligned
% + delta pattern, `--green-x10` / `--red-x10`.

---

## 6. Element: CHART (visx) — the crown jewel

- **SVG 486 × 216** (no explicit viewBox; sized in px). Rendered via **visx**.
- Element classes present: `visx-group`, `visx-line` (gridlines), `visx-rows`,
  `visx-axis` / `visx-axis-bottom` / `visx-axis-right`, `visx-axis-tick`.
- **Multi-line, each series drawn TWICE (halo technique):**
  1. underlay: `stroke = --surface-x10 (#fff)`, `stroke-width 2.5`, `fill:none` — a white casing
  2. overlay: colored line, `stroke-width 2`, `fill:none`
  Colors observed: `--brand-primary` (mint #28cc95), `--blue-x10` (#265cff), `--orange-x10` (#ff6a00).
- **Leading-edge dot pulses**: `animate-[heartbeat_3s_cubic-bezier(0.32,0.93,0.60,1.00)_infinite]`
  (a `heartbeat` keyframe, 3s, infinite) — one animated endpoint marker per line.
- **Right Y-axis = probability %**, auto-scaled to a round domain that fits the data:
  observed domains `0–40%` (10 steps), `0–100%` (25 steps), `0–80%` (20 steps), `0–100%` (25).
  Labels `0% 10% 20% …` right-aligned.
- **Bottom X-axis = time**, three modes:
  - monthly: `May 2025 · Aug 2025 · Dec 2025 · Mar 2026 · Jul 2026` (long-range markets)
  - daily: `7 Jul · 8 Jul · 10 Jul · 12 Jul · 13 Jul` (short-range)
  - intraday: `21:03 · 01:47 · 06:32 · 11:17 · 16:03` (BTC 15-min)
  - 5 ticks typical.
- Horizontal gridlines via `visx-rows` (dashed light strokes, `--fill-x50`).
- Axis tick font: `font-kalshi-sans`, tiny, `--text-x20`, `tabular-nums`.

---

## 7. Element: CAROUSEL controller
- Auto-advances; slides use opacity+translateX (300ms ease-in-out). Progress indicated by dots.
- Prev/next by horizontal swipe (`touch-action:pan-y`).
- Numbers animate on refresh: % color transition `duration-500 cubic-bezier(.4,0,.2,1)` (live re-price).
  (Confirmed: the two DOM captures differ only in a live volume figure — $104,270,878 → …923.)

---

## 8. Our current hero vs Kalshi — GAP ANALYSIS

| Aspect | Ours (Polymarket clone) | Kalshi (target) | Action |
|--------|-------------------------|-----------------|--------|
| Structure | Big card (2.35fr) + right rail (promo/breaking/hot) | Single full-width carousel card, 26rem, 7 slides | Rebuild layout |
| Card height | content-driven | fixed 26rem, overflow-hidden | Fix height + clip |
| Title font | system semibold 24px | kalshiCondensed `typ-headline-x20` | Add condensed font + token |
| Category | breadcrumb "Cat · Sub" 14px | icon + uppercase overline `typ-overline-x10` | Re-style |
| Outcomes | name + big % (2 col) | 3-col `Market/Pays out/Odds`, payout `2.41x`, odds **buttons**, ▲▼ delta | Rebuild rows |
| Chart | custom `ProbLines` (560×300) | visx-style 486×216, white-halo lines, heartbeat dot, right % axis, 3 x-modes | Rebuild chart |
| Colors | `--yes/--no/--text/--hairline` (our tokens) | `--text-x10/x20/x30`, `--green-x10`, `--red-x10`, `--brand-primary` | Introduce Kalshi tokens |
| Rail | present | not in hero region | Decide: keep vs drop |
| Footer | "Vol · Ends date · MarketPips" | "$X vol" / "N more" | Re-style |

---

## 9. Element-by-element execution order (each = one milestone → commit → CI)
1. **Design tokens + fonts** — add Kalshi token layer (`--text-x*`, `--green/red-x10`, `--brand-primary`,
   radii) + kalshiSans/kalshiCondensed (or closest licensed/again-fallback) + `typ-*` utilities.
2. **Slide container** — 26rem card, `bg-container-x40`, `border-stroke-x40`, `rounded-x40`, overflow-hidden.
3. **Header row** — 28px bordered icon + uppercase overline + condensed headline.
4. **Layout A rows** — Market/Pays out/Odds, avatar, name+sub+meta, %+▲▼ delta, odds buttons, hover spring.
5. **Footer** — `$X vol` / `N more`.
6. **Chart** — visx-style multi-line, white halo, heartbeat endpoint, right % auto-domain axis, 3 x-axis modes, gridlines.
7. **Binary layout B** — Yes/No pair.
8. **Carousel controller** — auto-advance, dots, swipe, 300ms slide transition, live-number color transition.
9. **Responsive + a11y polish**, then full-hero screenshot diff vs ground truth.

Each element: build → local render/screenshot → compare to ground truth → refine to parity →
commit to `main` → CI status check.
```
