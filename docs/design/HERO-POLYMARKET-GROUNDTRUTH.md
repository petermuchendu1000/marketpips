# Hero Section — Polymarket Ground-Truth Teardown (measured 2026-07-13)

> Authoritative, **measured** spec of Polymarket's homepage "Featured markets"
> hero. Captured live via headless Chromium at **1440×900, DSF 2**, extracting
> computed styles + bounding boxes from the live DOM, cross-checked against
> full-resolution screenshots of two slides (multi-outcome "US-Iran Nuclear
> Deal" and entity "World Cup Winner") and the right rail.
>
> This supersedes the earlier `HERO-POLYMARKET-ANALYSIS.md` inferences. Where the
> two disagree, **this file wins** (it is measured, not assumed).
>
> GOAL (this build): a **faithful clone** — element by element, feature by
> feature, behaviour by behaviour. Brand customization comes later, layered on
> top of this foundation. So we reproduce Polymarket's actual metrics/colors,
> not an on-brand reinterpretation.

## 0. Corrections vs the previous analysis
- Outcome rows **have hairline dividers between them** (previous doc said "single
  divider at footer only" — WRONG, confirmed from screenshot).
- Header has a **56×56 event icon** (squircle, radius ~5.2px) to the left of the
  breadcrumb+title — previously omitted entirely.
- Breadcrumb is the category path **`Category · Subcategory`** at **14px / ~540
  weight / #77808D** (not 16px/400, and NO pill, NO "Live" badge, NO countdown).
- Footer is **minimal**: `$X Vol` (left) and `Ends <date> · [Polymarket logo]`
  (right). No bettors icon, no comments icon.
- The left-column "peek" is **polymorphic**: user **comments** (avatar+username+
  text) for social markets, or **news articles** (favicon + `SOURCE · Nd ago` +
  headline) for news-driven markets.
- Chart lines are **stepped** (step-after), NOT smooth curves; endpoint dots have
  a soft **halo**; each line has a colored **`+ $N` P&L label** near its left
  endpoint. Y-axis is on the **right**, auto-domain. Axis text is **Arial 12px**.

## 1. Outer layout (desktop ≥1024)
- Centered container. Two columns: **carousel (≈1.7fr) | rail (≈1fr)**, gap ~20px.
- Carousel viewport for the card = **907×480** at 1440vw; card auto-height.
- Controls BELOW the card: pagination **dots** (left) + prev/next **title pills**
  (right) naming adjacent slides (e.g. `‹ World Cup`, `Strait of Hormuz ›`),
  14px/500 #77808D.

## 2. The card (measured)
```
card               907×480, radius 18px, bg #FFFFFF
  border           1px solid  (blue-slate @ 10% α)  ≈ rgba(115,128,141,.16) light
  shadow           0 4px 16px  (blue-slate @ 7% α)  ≈ rgba(72,88,120,.07)
  inner padding    20px  → content 865×442
```
Whole card is a full-bleed `<a>` to the market; inner links/buttons opt back in.

### 2a. Header row (865×64)
| part | spec |
|---|---|
| Event icon | **56×56**, squircle radius ~5.2px (`size×0.09`), object-cover |
| gap icon→title block | 16px |
| Breadcrumb | `Category · Subcategory` — **14px / 540 / #77808D**, ls −0.09px; middot separator #77808D. Sits ABOVE title. |
| Title (`<h3>`) | **Inter 24px / 600 / #0E0F11**, line-height **32px**, tracking **normal** |
| Actions (top-right) | two **36×36** icon buttons: share/link (icon ~20px) + bookmark (icon ~18px), 4px gap, color #77808D |

### 2b. Body (865×328) — two columns, gap 24px
**LEFT column = 346px**
- Ranked outcomes: up to **4 rows**, each an `<a>`, **40px tall, 48px pitch**
  (8px gap), with a **hairline divider between rows** (#E9EBEE ~1px).
  - Row = `[avatar 30×30 squircle r5.2] [name] ……… [%]`
  - Avatar is **conditional**: entity photo/flag when the option has an image,
    otherwise omitted (date/threshold outcomes have none).
  - Name: **Inter 15px / 450 / #18181B**, ls −0.15px.
  - Percent (right-aligned): **Inter 20px / 600 / #18181B**, ls −0.2px. **NOT mono.**
- Peek (below outcomes, ~128px): polymorphic
  - **Comments**: `[avatar 20–24px] username (13/600 #31353A)` + one-line content
    (13/450 #77808D, truncated). Up to 2, most-recent faded/rotating.
  - **News**: faded headline + `[favicon 12×12] SOURCE (12/400 #77808D) · Nd ago
    (12/500 #AEB4BC)` + darker headline (13/500 #18181B). 1–2 items.

**RIGHT column = 495px = chart block**
- Legend chips ABOVE the chart, wrap to 2 rows: `● name %`
  - dot 8px, name **13px / 490 / #77808D**, percent **13px / 600 / #31353A** ls −0.1px.
- SVG chart **495×276**; plot inset leaves room for right axis.
  - **Y-axis on the RIGHT**, auto-domain to data max rounded up (e.g. 0/15/30/45/60%).
    Labels **Arial 12px / 400 / #0E0F11**, tick pitch ≈59px.
  - **Dashed horizontal gridlines**, light (#E6E8EA).
  - **X-axis dates** below (`Jun 21 · Jun 28 · Jul 5 · Jul 12`), Arial 12px #0E0F11.
  - **Stepped lines** (step-after), one per outcome, strokeWidth ~2.
  - **Endpoint dot** per line with a soft translucent **halo** behind it.
  - **Colored `+ $N` P&L labels** at each line's left endpoint (13px/600, line color).
  - Line palette (categorical, measured): `#87BFFF` light-blue, `#2E6BE6`/indigo
    blue, `#FDC503` gold, `#FF7F0E` orange, then extend with teal/violet/red.

### 2c. Footer row (865×18, hairline above)
- Left: `$X Vol` — **13px / 490 / #AEB4BC**, ls −0.1px (volume abbreviated $10M/$4B).
- Right: `Ends <Mon D, YYYY>` (13/490 #AEB4BC) · middot · **Polymarket logo** (98×18 svg).

## 3. Right rail (≈1fr column)
1. **Promo card** — full-bleed colored card (PM: blue app-download w/ code + phone
   mockup). Rounded ~16px. → adapt content to MarketPips, keep the shape/rhythm.
2. **Breaking News** — heading + chevron link → numbered list. Each row:
   `rank(gray) | question (16px, up to 2 lines, #0E0F11) | %big (right) + delta`
   where delta = `↗ 36%` green (up) / `↘ 46%` red (down). Big % ~20px/600.
3. **Hot topics** — heading + chevron → numbered list. Each row:
   `rank | topic (16/500) …… $Xk today (#77808D) 🔥 › `.
   Dividers between sections are dashed hairlines.

## 4. Behaviour
- **Autoplay** ~7s, pause on hover/focus/tab-hidden; **swipe**, **arrow keys**,
  **prefers-reduced-motion** respected (no autoplay, no transform).
- Slides cross-fade + slight translateX; viewport sizes to tallest card.
- Dots: active = wide pill (~20px), inactive = 8px; click to jump.
- Prev/next title pills advance and name the adjacent slide.
- Card hover: subtle lift; outcome/legend interactive; whole card navigates.

## 5. Typography & color tokens (faithful)
- Font: **Inter** (UI + numerics; axis uses system Arial). Weights 400/450/490/540/600.
- Text: `#0E0F11` (title/near-black), `#18181B` (outcome), `#31353A` (legend %),
  `#77808D` (secondary), `#AEB4BC` (footer/tertiary).
- Surfaces: bg `#FFFFFF`; hairline `#E6E8EA`; row divider `#E9EBEE`.
- Accent (Polymarket blue) `#1452F0` for links/CTAs/active dot.
- Up delta `#12A150` green; down delta `#E5484D` red.
- Full light + dark handled via CSS variables (dark values added in globals.css).

## 6. Data availability (verified in Supabase)
- Featured markets have real `price_history`; `market_options.image_url` carries
  entity photos; `profiles` supplies comment authors; `volume_24h_usd` supplies
  Hot topics + Breaking-News deltas.
