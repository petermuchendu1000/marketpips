# Polymarket Hero — Ground-Truth Teardown (live-measured)

> Source of truth: **live polymarket.com** (HTTP 200, no bot wall) — computed styles
> pulled element-by-element via Playwright `getComputedStyle`, cross-checked against the
> pasted rendered DOM + Polymarket's compiled CSS tokens. All px/color/weight values below
> are measured, not inferred. Reference screenshots:
> `docs/design/assets/polymarket_hero_carousel_live.png`, `…_slide_live.png`.
>
> Scope: the homepage **"Featured markets" carousel** (left) and its right **rail**.

---

## 0. Design tokens (exact)

### Neutral ramp
`0 #fff · 25 #f9fafb · 50 #f4f5f6 · 100 #e6e8ea · 200 #caced3 · 300 #aeb4bc ·
400 #939aa5 · 500 #77808d · 600 #5f6772 · 700 #484e56 · 800 #31353a · 900 #1a1c1f · 950 #0e0f11`

### Semantic
- `text-primary = neutral-950 #0e0f11`
- `text-secondary = neutral-500 #77808d`
- `text-tertiary = neutral-300 #aeb4bc`
- `border = neutral-100 #e6e8ea`
- `surface-1 = neutral-0 #fff`, `surface-2 = neutral-50 #f4f5f6`, `color-surface = neutral-50`
- **YES / up = green-500 `#42c772`**, **NO / down = red-500 `#e23939`**
- `blue-500 #1652f0`, `blue-600 #0c3ec1` (card border/shadow tints)
- Font: **Inter** (`--font-inter`), features `"liga" "calt" "cv01" "cv02" "cv03" "cv04" "cv11" "cv15"` on, `cv09` off; mono = Geist Mono.
- outcome-name near-black measured `#18181b` (zinc-900 — note: slightly ≠ title #0e0f11)

### Chart line palette (4 series)
`#87BFFF light-blue · #4378FF blue · #FDC503 gold · #FF7F0E orange`

---

## 1. Layout shell
- Hero row: `flex flex-row gap-8 pt-6 items-stretch`, wrapper `max-w-[1350px] mx-auto px-4 lg:px-6`.
- LEFT: `section[aria-label="Featured markets carousel"]` — `flex-col gap-4 w-full`, `flex-1`. Only `lg:` and up (hidden on mobile).
- RIGHT: rail (promo → Breaking News → Hot topics → Explore all). See §9.

## 2. Carousel card (container) — Element 1
- `907×480` (width = flex-1; **`min-h: min(480px,60vh)`**, **`max-h: 500px`**, `h: auto`).
- `border-radius: 18px`; `border: 1px solid rgba(37,99,235,0.10)` (`blue-600/10`).
- `background: #fff` (`surface-1`); `box-shadow: 0 4px 16px 0 rgba(59,130,246,0.07)` (`blue-500/7`); dark: no shadow.
- `overflow: hidden`, `position: relative`.
- Slides stacked `absolute inset-0`; slide panel padding **`20px 20px 16px 20px`** (`p-5 pb-4`).
- Slide transition: `opacity 120ms ease-in` + `transform: translateX(...)` (offscreen ±300%).

## 3. Header row — Element 2
Row: `flex gap-4 justify-between items-start` (`md:pb-1.5`).
- **Icon**: `56×56`, `border-radius: 9.2px` (`rounded-md`, effectively ~9px), `overflow:hidden`, `object-cover`; `hidden md:block`; skeleton shimmer underlay. `min-width:56px`.
- **Breadcrumb** (`flex items-center gap-1.5` after icon): category + `·` + sub.
  - category/sub: `14px / 20px, weight 540, letter-spacing -0.09px, color #77808d` (text-secondary), truncate.
  - separator `·`: `16px / 24px, weight 400, #77808d`.
- **Title**: `24px / 32px, weight 600, letter-spacing normal, color #0e0f11` (text-primary). Wrapped in event `<a>`.
- **Actions** (right, `flex gap-*`): share/copy-link button + bookmark button, each `w-7 h-7 rounded-full`, ghost, `hover:bg-black/5`; icon `18×18`, `1.5px` stroke, `active:scale-[97%]`, `transition duration-150`.

## 4. Body split
`flex` row: LEFT outcomes column ~**40%**, RIGHT chart ~**60%** (measured plot svg 496 wide).

### 4a. Outcome rows (left) — Element 3
Each row (up to 4): `flex items-center justify-between`, `min-h-10`, divider `border-bottom: 1px solid` (`neutral-100 #e6e8ea`), `pb-2`.
- name: `15px / 22.5px, weight 450, letter-spacing -0.15px, color #18181b`, truncate; optional 30px squircle avatar (`gap-1.5`).
- percentage: `20px / 24px, weight 600, letter-spacing -0.2px, color #18181b`, `tabular-nums`.
- Binary markets: Yes/No color chip (green `#42c772` / red `#e23939`) instead of avatar.

### 4b. Comment / news peek (below outcomes) — Element 4
- author line: `13px / 16px, weight 400, ls -0.1px, #18181b`.
- comment body: `12px / 16px, weight 400, ls -0.1px, #77808d`, clamped.
- news variant: source avatar + `AP News · 4d ago` then a 2-line headline (same 12/16 secondary).

## 5. Chart (right) — Element 5  ← crown jewel
- **SVG 496 × 276** (height varies 276/300/306 per slide); plot area **446 × 236** inside `<g transform="translate(0,10)">`. ~50px right gutter for % labels.
- **Gridlines**: 5 horizontal, `stroke: neutral-300 #aeb4bc`, `stroke-width: 1`, **`stroke-dasharray: 1,3`** (dotted), at y = 0/59/118/177/236 (59px apart), x 0→458.
- **Right Y-axis (%)**: 5 labels auto-domain (e.g. 0/10/20/30/40% or 0/15/30/45/60%). `font-size 12`, `text-anchor start`, `+8px` gap, color `text-secondary #77808d`. Domain rounds up to fit data max.
- **Bottom X-axis (dates)**: 4–5 ticks, `font-size 12`, `text-anchor middle`, color `neutral-200 #caced3`, `translateY(+12)`, ~104px apart. Formats: monthly / daily (`Jun 21`) — 5-tick daily typical.
> **CORRECTION (2026-07, re-measured from the pasted live DOM — supersedes the
> earlier "step" note):** the hero lines are **smooth cubic-bézier `<path>`**
> (`d` is 400+ `C` commands, **zero `L`** — no step-after), `fill:transparent`,
> `shape-rendering:geometricPrecision`, `pathLength=1`. Per series there are
> three stacked paths:
>   1. **main** — `stroke: COLOR`, `sw 1.75`, `stroke-opacity 1`, `clip-path: inset(-13px -13px -13px -13px)`.
>   2. **faded history** — `stroke: color-mix(in srgb, COLOR 40%, transparent)`,
>      `sw 1.75`, dotted `stroke-dasharray "2 2"`, clipped to a short **left**
>      lead-in (`clip-path: inset(-13px 432px -13px -13px)`).
>   3. **accent** — `stroke: COLOR`, `sw 2.75`, `stroke-opacity 0` at rest
>      (a hover/highlight overlay; invisible until interacted with).
> **Endpoint** (`cx=446`): a solid `r=4` dot (`opacity 1`) **plus a pulsing halo
> ring** — same `r=4`, `transform-origin:50% 50%; transform-box:fill-box`,
> animating `scale 1→~3.95` while `opacity 0.34→0`, looping (the two measured
> frames were scale 2.28/op .34 and scale 3.95/op .011 — i.e. mid- and late-pulse).
> Colors = `#87BFFF / #4378FF / #FDC503 / #FF7F0E`. Y-axis via visx: `Arial 12`,
> `weight 400`, `fill text-secondary`, `text-anchor start`, `translateX(8px)`.

- **Data lines** (per series, 3 stacked paths, `fill: transparent`, dense-bezier **step** render):
  1. faded history: `stroke: color-mix(in srgb, COLOR 40%, transparent)`, `stroke-width 1.75`
  2. accent: `stroke: COLOR`, `stroke-width 2.75`
  3. main: `stroke: COLOR`, `stroke-width 1.75`
  Colors = line palette above.
- **Endpoint markers** (right edge, `cx=446`): per line two `r=4` circles, fill = line color —
  inner `opacity 1` + halo `opacity 0.34, transform: scale(2.28)` (static glow, ~9px).
- **Legend chips** (above chart, `flex gap`): color swatch `27×14` line-svg + name (`13/16 w490 #77808d`) + value (`13/16 w600 #31353a`).
- **Trade annotations** (floating, left of lines): `+ $N`, `13px / 19.5px, weight 600`, colored per line (e.g. `#87BFFF`, `#FDC503`, `#4378FF`, `#FF7F0E`).

## 6. Footer — Element 6
Row `flex justify-between` (`mt-auto`, top divider optional):
- left: `$X Vol` — `13px / 16px, weight 490, ls -0.1px, color #aeb4bc` (text-tertiary).
- right: `Ends <Mon D, YYYY>` `·` `Polymarket` (logo) — same 13/490/#aeb4bc; logo mark ~98×18.

## 7. Carousel controls — Element 7
- **Dots** (bottom-left): 7 dots; active dot elongated (pill), inactive small circles, muted.
- **Prev/next pills** (bottom-right): rounded-full ghost buttons showing **adjacent slide titles** (`‹ World Cup`, `Strait of Hormuz ›`), `text-body-base font-semibold`, `active:scale-[97%]`.
- Auto-advance; numbers re-price live.
- Below the card: **"Show more markets"** outline pill (`h-10 rounded-full px-4`, `border-button-outline-border`).

## 8. Buttons (shared spec)
`inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold text-body-base`,
`cursor-pointer active:scale-[97%] transition duration-150`,
`focus-visible:ring-1 focus-visible:ring-ring`, `disabled:opacity-50`.
Variants: ghost (`bg-button-ghost-bg`, `hover:bg-black/5`), outline (`border-button-outline-border`, `hover:bg-neutral-25`).

## 9. Right rail — Element 8
1. **Download-app promo** — blue card (`blue-500` bg), phone image, `Download the US app`, `Use code POLY50 for $50`.
2. **Breaking News** — heading + chevron; ranked list (index, 2-line title `14px medium`, right: `%` `18px semibold` + delta `12px` colored green/red with ↗/↘).
3. **Hot topics** — heading + `See all`; ranked list (index, title `13px`, right `$X today` + 🔥).
4. **Explore all** — full-width outline pill.

---

## 10. Parity checklist vs our current hero (`components/layout/hero-section.tsx`)
| Element | Status | Fix needed |
|---|---|---|
| Card shell | close | border → blue-600/10; shadow → blue-500/7 (0 4px 16px); min-h min(480px,60vh); max-h 500px |
| Header typography | ✅ matches | (verify colors map to #0e0f11 / #77808d) |
| Icon | ✅ 56px squircle | radius → ~9px (rounded-md), not full squircle |
| Outcome rows | ✅ close | name color #18181b; divider neutral-100 |
| Comment peek | ✅ present | confirm 13/12 sizes + colors |
| Chart (ProbLines) | ⚠ diverges | sw 2.5→1.75(+2.75 accent); dims 560×300→496×276; gridlines dashed 1,3 neutral-300; colors → #87BFFF/#4378FF/#FDC503/#FF7F0E; endpoint halo scale(2.28) op .34; faded color-mix history; right-axis +8px; x labels neutral-200 |
| Footer | ✅ close | color → #aeb4bc; "Ends … · Polymarket" |
| Carousel dots/pills | ✅ present | active dot elongated; prev/next show adjacent titles |
| Rail | ✅ present | promo=blue app card; verify Breaking/Hot specs |

## 11. Execution order (each = build → local render → screenshot-diff → commit → CI)
1 tokens/colors · 2 card shell · 3 header · 4 outcome rows · 5 comment peek ·
6 **chart** (sub-steps: axes → gridlines → lines → faded history → endpoint halo → legend → annotations) ·
7 footer · 8 carousel controls · 9 rail · 10 responsive + a11y · 11 full-hero screenshot diff.
