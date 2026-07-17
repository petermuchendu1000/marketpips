# Polymarket Parity Spec — Market Detail (M7)

**Ground truth = the live Polymarket market-detail page.** Every value below was
extracted as *hard data* from live PM pages via a Playwright harness
(`tools/pm-parity/extract.py`) — real `getComputedStyle` values, pixel geometry
from `getBoundingClientRect`, and PM's published design-token CSS. Nothing here
is invented. When a repo value disagrees with this sheet, **this sheet wins**.

Sources captured (1440×1024 desktop, 390×844 mobile @2x):
- Multi-outcome: `polymarket.com/event/presidential-election-winner-2028`
- Binary: `polymarket.com/event/will-the-us-invade-iran-before-2027`

---

## 1. Design tokens (from PM's `@theme` layer, fully resolved)

### Neutral ramp (PM `--neutral-*`)
| Step | Hex | Step | Hex |
|---|---|---|---|
| 0   | `#ffffff` | 500 | `#77808d` |
| 25  | `#f9fafb` | 600 | `#5f6772` |
| 50  | `#f4f5f6` | 700 | `#484e56` |
| 100 | `#e6e8ea` | 800 | `#31353a` |
| 200 | `#caced3` | 900 | `#1a1c1f` |
| 300 | `#aeb4bc` | 950 | `#0e0f11` |
| 400 | `#939aa5` | | |

### Brand ramp (PM `--brand-*` = "Pip")
`50 #e7edfd · 100 #c4d3fb · 200 #a1b9f9 · 300 #7d9ff6 · 400 #4e7df3 ·`
`500 #1452f0 · 600 #1249d8 · 700 #1041c0 · 800 #0e39a8 · 900 #0c3190`

### Market semantics — Yes / No (PM green / red)
| | 50 | 500 | 600 |
|---|---|---|---|
| **Yes (green)** | `#ecf9f1` | `#42c772` | `#30a159` |
| **No (red)** | `#fcebeb` | `#e23939` | `#c61d1d` |

> PM uses **saturated** green/red (not desaturated). Yes-leading fills use
> `#30a159` (green-600); No uses `#e23939` (red-500).

### Semantic tokens (resolved)
| Token | Value | Meaning |
|---|---|---|
| `--color-text-primary`   | `#0e0f11` (neutral-950) | headings, primary text |
| `--color-text-secondary` | `#77808d` (neutral-500) | muted labels, breadcrumbs, meta |
| `--color-text-tertiary`  | `#aeb4bc` (neutral-300) | disabled / faint |
| `--color-border`         | `#e6e8ea` (neutral-100) | hairlines |
| `--color-border-hover`   | `#caced3` (neutral-200) | hover hairline |
| `--color-surface`        | `#f4f5f6` (neutral-50)  | filled inputs / chips |
| `--color-bg-brand`       | `#1452f0` | primary button / Trade CTA |

### Radii — PM `--radius: 0.7rem` system  ⚠️ (repo currently 8/12/16px)
| Token | Formula | px |
|---|---|---|
| `--radius-sm` | `0.7rem − 4px` | **7.2px** (avatars, small pills) |
| `--radius-md` | `0.7rem − 2px` | **9.2px** (chips, inputs, buttons, timeframe toggles) |
| `--radius` / `--radius-lg` | `0.7rem` | **11.2px** (cards) |

### Spacing & fonts
- Base spacing unit `--spacing: 0.25rem` (4px grid — Tailwind default scale).
- Primary font: **Inter** (`inter, "inter Fallback", sans-serif`).
- Secondary/display: **openSauce** (`--font-sauce`).
- Numerics render in the UI font at PM (no separate mono for prices).

---

## 2. Measured component specs

### 2.1 Header
| Element | Measured |
|---|---|
| Breadcrumb / category | 14px / 500 / `#77808d`, lh 20px |
| Title `h1` | **24px / 600 / lh 28px / letter-spacing −0.36px / `#0e0f11`**, Inter |
| Title box (binary) | x142 y308 w402 **h28** |
| Binary "chance" number | ~large brand `#1452f0` with green `▲%` delta |

### 2.2 Chart footer + timeframe toggles  ⚠️ (repo deviates)
| Element | Measured |
|---|---|
| Timeframe buttons | text **14px / 600**, h36, pad 4px 6px, **radius 9.2px**, bg transparent |
| — inactive | `#77808d` (neutral-500) |
| — active | `#0e0f11` (neutral-950) |
| Toggle set order | `1H · 6H · 1D · 1W · 1M · ALL` |
| Footer left cluster | Volume `$… Vol.` + resolution date (`MMM D, YYYY`) with clock icon, `#77808d` |
| Footer right cluster | timeframe toggles → sort/shuffle icon → settings gear |

### 2.3 Order ticket (betting panel) — desktop sidebar
| Element | Measured |
|---|---|
| Ticket container | width **372px**, 1px hairline `#e6e8ea` |
| Buy/Sell tab | 16px / 600 / −0.18px · active `#0e0f11`, inactive `#77808d`; active = underline element |
| Market dropdown | 14px / 500 / −0.09px · `#0e0f11` · gap 4 |
| Yes pill (leading) | filled green `#30a159`, white text 15px/600 |
| No pill | neutral, text `#0e0f11` 15px/600 |
| Amount label | 16px / 500 / −0.18px |
| Amount entry (big) | **40px / 600 / `#0e0f11`** · transparent · right-aligned inline `$`+number (re-measured; the small 14px input was a mis-note) |
| Quick chip | 12px/600/−0.1px · `#77808d` · h30 · **radius 9.2px** · 1px hairline · hover bg `#f9fafb` (neutral-25) · 0.15s |
| Chips | `+$1 · +$5 · +$10 · +$100` |
| Trade button | bg `#1452f0` · h43 · **radius 9.2px** · white · **no hover recolor** (active-scale only) · 0.12s |
| Legal line | "By trading you agree to Terms of Use" small `#77808d` |

### 2.4 Outcome board (multi-outcome) rows
| Element | Measured |
|---|---|
| Avatar | ~40px, **radius 7.2px** (rounded square, not circle for entities) |
| Candidate name | 16px, `#0e0f11` |
| Volume sublabel | `$… Vol.` `#77808d` |
| Big % | 28px, letter-spacing −0.42px, `#0e0f11` |
| Delta | small `▲/▼ %` (green/red) |
| Buy Yes button | green outline/fill, `… ¢` price |
| Buy No button | red outline/fill, `… ¢` price |

### 2.5 Related markets  ⚠️ (repo designed differently — must match)
- Borderless **ghost rows** (no card border), separated by hover bg only.
- Left: **40px rounded-md (`radius 7.2px`) icon**.
- Title `p` **13px / 600 / lh 19.5px / −0.09px / `#18181b`**.
- Sublabel: **`NN%` + leading-outcome name** (e.g. "42% J.D. Vance"), `#77808d`.
- Binary related list has a filter tab row above it (`All · <Category> · World`).

---

## 3. Behavior parity (hard-observed)

1. **Desktop:** sidebar ticket **pre-selects the leading candidate** (e.g.
   "Gavin Newsom · Yes"). This is correct PM behavior — keep it.
2. **Mobile:** PM has **NO pre-armed ticket and NO auto-selected candidate**.
   Mobile shows outcome rows with explicit **Buy Yes / Buy No** buttons the user
   taps. → **Repo bug to fix:** our mobile auto-selects the leader (bias). Gate
   auto-select to desktop viewports only; mobile stays neutral until tap.
3. Timeframe active state is a color swap only (no pill background).
4. Trade button does not recolor on hover (scale/opacity feedback only).

---

## 4. Repo → PM token remap (to apply)
- `tailwind.config.ts` `pip.500` `#2B50E4` → **`#1452F0`** (matches globals).
- Align full `pip` ramp + neutral (`ink-*`) ramp to PM values above.
- Yes `#1F9D6B` → **`#30a159`**; No `#D1495B` → **`#e23939`** (+ tints/700s).
- Radii `--r-sm/md/lg` `8/12/16` → **`7.2 / 9.2 / 11.2px`**.

## 5. Token-mapping note (IMPORTANT)
PM's **secondary** text `#77808d` maps to the repo's **`text-text-muted`**
(`--text-3` → ink-500 `#77808d`), NOT `text-text-secondary` (`--text-2` →
ink-600 `#5f6772`, a darker AA-safe level the repo adds). So any element PM
renders at `#77808d` (breadcrumb, meta, "Vol." date, timeframe-inactive,
chips, related sublabel) must use **`text-text-muted`** for an exact match.
PM primary `#0e0f11` → `text-text-primary`. We deliberately do NOT globally
remap `--text-2` to `#77808d` (would drop WCAG AA on all secondary text
app-wide); we use `text-text-muted` on the specific market-detail elements.

## 6. Progress (this session)
- [x] Ground-truth spec + Playwright extraction harness.
- [x] Design tokens aligned to PM (neutral/brand/yes-no ramps, 0.7rem radii);
      fixed tailwind `pip-500` mismatch. (+ dark-mode `--no-text` AA re-tune.)
- [x] Mobile no longer auto-selects the leading candidate (desktop-only
      pre-arm; mobile neutral until explicit tap).
- [x] Related-markets row title -> 13px/600/-0.09px measured typography.
- [x] Chart footer -> Vol 13px/500 primary, resolution date added, borderless
      timeframe toggles (active #0e0f11 / inactive #77808d), no divider.
- [x] Betting panel -> amount 40px/600, chips rounded-md 12px/600 neutral hover,
      dropdown primary ink; #77808d elements routed to text-muted.
- [ ] Header (title 24px/600/-0.36px + breadcrumb) verification.
- [ ] Outcome board rows fine-tune (avatar 7.2px, 28px % / -0.42px).
- [ ] Related-markets: category filter tabs (All/<cat>/World) on binary lists.
- [ ] Related sublabel color -> text-muted (#77808d).

_Extraction harness: `tools/pm-parity/extract.py`. Raw captures live outside the
repo (reference only); this sheet is the committed, durable ground truth._
