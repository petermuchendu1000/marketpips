# PM Buy Sheet (mobile) — measured ground truth

Source: live `https://polymarket.com/event/world-cup-winner`, mobile viewport
390×844 @3x (iPhone UA), captured with `tools/pm-parity` Playwright harness on
2026-07-18. Every value below is **computed style / pixel geometry from the
running page** — not a guess. Screenshots: Spain·Yes and Spain·No states.

The sheet opens when a candidate **Buy Yes / Buy No** control is tapped on the
multi-outcome market page. It is a Radix `role="dialog"` bottom sheet.

## Container
| Part | Value |
|---|---|
| Overlay | `fixed inset-0`, `bg` black **40%** (`rgba(0,0,0,.4)`), z **1100** |
| Sheet root | `position: fixed`, bottom, **full width** (390), white `rgb(255,255,255)`, **border-radius 24px 24px 0 0**, z **1101** |
| Content H-padding | **24px** left/right (Buy pill x=24; Trade btn x=24 w=342 → 390−48) |
| Section rhythm | ~20px vertical gap between major blocks (`gap-5`) |
| Drag handle | **60×5px**, `bg rgb(243,244,246)`, radius **16px** (pill), centered, ~9px below sheet top |
| Font family | `Inter` (`inter, "inter Fallback"`) |

## 1. Header row (h=32)
| Element | Measured |
|---|---|
| **Buy** pill | `<button>` h**32**, padding-x **16px**, `bg rgb(244,245,246)`, text `rgb(14,15,17)`, **14px / 600**, lh20, radius **full** (9999px). Transition 0.15s cubic-bezier(.4,0,.2,1) on color/bg/border |
| **Settings** icon | `<button aria-label="Order type settings">` **32×32**, radius **7.2px**, icon **sliders** 18×18, `stroke currentColor 1.5`, color `rgb(14,15,17)`. Opens Market/Limit popover |

## 2. Identity row (h≈44, icon+text)
| Element | Measured |
|---|---|
| Entity icon | **42×42**, radius **7px** (rounded square) |
| Text left offset | **78px** (= 24 pad + 42 icon + 12 gap) |
| Market sublabel | e.g. "World Cup Winner" — **14px / 500**, `rgb(119,128,141)`, lh20 |
| Outcome name | e.g. "Spain" — **16px / 600**, `rgb(14,15,17)`, lh24 |
| Separator `·` | `rgb(174,180,188)` |
| Side = **Yes** | `rgb(66,199,114)` (green), 16px/600 |
| Side = **No** | `rgb(226,57,57)` (red), 16px/600 |

## 3. Amount display
| Element | Measured |
|---|---|
| Input | `text-align:center`, **56px / 600**, letter-spacing **−1.4px**, `inputmode="decimal"` |
| Empty state | placeholder **"$0"**, color `rgb(174,180,188)` (muted) |
| Typed state | `$` prefix + digits, color `rgb(14,15,17)`, `tabular-nums` |
| Section padding | pt-8 (32) / pb-4 (16), horizontal px-8 (32) |

## 4. Yes / No toggle (segmented)
| Element | Measured |
|---|---|
| Track | **118×40** (2-option), `bg rgb(244,245,246)`, radius **full**, padding **4px**, centered |
| Thumb | white `rgb(255,255,255)`, h**32**, radius **full**, width = active label width; slides on switch |
| Label (active) | **14px / 500**, `rgb(14,15,17)`, padding-x 16 / py 6, h32 |
| Label (inactive) | same, color `rgb(174,180,188)` |
| Transition | 0.15s cubic-bezier(.4,0,.2,1) |

## 5. Quick-add chips (h=30)
| Element | Measured |
|---|---|
| Set | `+$1  +$5  +$10  +$100`, group **centered** |
| Chip | border **1px** `rgb(230,232,234)`, radius **9.2px**, text `rgb(119,128,141)` **12px / 600**, letter-spacing **−0.1px**, padding-x **10px**, h30 |
| Gap | ~4px between chips |

## 6. Trade button
| Element | Measured |
|---|---|
| Button | **full width** (342), h**44**, `bg rgb(20,82,240)` (PM blue #1452F0), radius **9.2px** |
| Label | "Trade", white `rgb(255,255,255)`, **16px / 600**, centered |

## 7. Typed-amount state (payout preview)
When the amount is > 0 the amount turns dark (`rgb(14,15,17)`) and a payout block
appears in a **reserved ~40px slot between the toggle and the chips** (present
even when empty so the Trade button never shifts):
| Element | Measured |
|---|---|
| "To win" label | `rgb(72,78,86)` (ink-700), **16px / 500** |
| Payout value | outcome-tinted (`rgb(66,199,114)` yes / `rgb(226,57,57)` no), **18px / 600**, `tabular-nums` |
| Avg-price line | e.g. `60.4¢`, `rgb(119,128,141)`, **12px / 500**, centered on its own line below |

## 8. Order-type popover (settings icon → Market / Limit)
Shown on **all** markets (binary *and* multi-outcome). Opens below the sliders icon, top-right.
| Element | Measured |
|---|---|
| Card | white, rounded (~`rounded-xl`), 1px border `rgb(230,232,234)`, drop shadow, ~**120px** wide, ~4–6px inner padding |
| Item | **Market** / **Limit** stacked, each **32px** tall, `rgb(14,15,17)`, **14px / 500**, padding **6px / 12px**; selected row gets a subtle `surface-2` fill |


## 9. LIMIT-order layout (full body — re-captured 2026-07-18)
Selecting **Limit** in the order-type popover replaces the entire sheet body.
There is **no oversized $ amount** and **no Yes/No pill** in limit mode; the side
lives in the identity row with a **swap icon** appended. Captured live (390×844).
Screenshot: `07-limit-layout.png`.

| Element | Measured (computed / geometry) |
|---|---|
| Identity side | `Spain · Yes` then a **swap ⇄ icon** (side switch), ~18px, after the side word |
| **Limit price** label | left, **16px / 500**, `rgb(14,15,17)` |
| Limit-price stepper | right-aligned box **150×40**, radius **9.2px**, border **1px** `rgb(230,232,234)`. Layout `[ − | value¢ | + ]` |
| Stepper − / + | icon buttons at box ends, `rgb(14,15,17)` |
| Limit-price input | **center**, **18px / 600**, placeholder **"0.0¢"**; value shows e.g. `59.2` with a **¢** suffix (18px/600) |
| Divider | full-width **1px** `rgb(230,232,234)` hairline between price and shares |
| **Shares** label | left, **16px / 500**, `rgb(14,15,17)` |
| Shares input | right-aligned box **150×40**, radius **9.2px**, border 1px; input **right-aligned**, **18px / 600**, placeholder **"0"** |
| Shares quick-adds | `−100  −10  +10  +100  +200`, **right-aligned** row. Same chip shell as $ chips (h30, radius 9.2, border 1px, **12px / 600**, ls −0.1px, `rgb(119,128,141)`). Last chip **+200** is **accent** (pip-blue text + border) |
| "matching" pill | e.g. **"217.00 matching"**, **12px / 600**, green `rgb(66,199,114)`, light-green tint bg pill, leading **ⓘ** info icon; right-aligned under chips |
| Divider | 1px hairline before the totals block |
| **Expires** row | label `rgb(119,128,141)` **14px / 500** left; value **"Never ⌄"** `rgb(174,180,188)` 14px/500 + chevron, right |
| **Total** row | label `rgb(14,15,17)` **16px / 500** left; value **18px / 500** blue `rgb(20,82,240)` right |
| **To win** row | label `rgb(14,15,17)` **16px / 500** left; value **24px / 500** green `rgb(48,161,89)` right |
| Trade button | identical to market mode |

Client math: `total = shares × (limitCents/100)`, `toWin = shares × $1`.

## 10. Micro-interaction easing (hard data, re-verified 2026-07-18)
| Target | transition (computed) |
|---|---|
| Buy pill / toggle labels / chips | `color,background-color,border-color… 0.15s cubic-bezier(.4,0,.2,1)` (== Tailwind `transition-colors`) |
| Toggle **thumb** slide | **`0.2s cubic-bezier(0,0,0.2,1)`** (== Tailwind `duration-200 ease-out`) |
| Trade button | **`transform 0.12s cubic-bezier(.4,0,.2,1)`**, `box-shadow/opacity/background-color/color 0.1s ease-in-out` (press-scale on transform) |
| Settings icon / chips (extended) | full `all-properties 0.15s cubic-bezier(.4,0,.2,1)` set |

## Payout-green nuance (two distinct greens)
| Context | Color |
|---|---|
| Side label "Yes" + **market** "To win" value | `rgb(66,199,114)` `#42C772` (bright) |
| **Limit** "To win" value | `rgb(48,161,89)` `#30A159` (== repo `--yes`) |
| No side / "To win" (no) | `rgb(226,57,57)` `#E23939` (== repo `--no`) |

## Token mapping → repo
| PM value | Repo token |
|---|---|
| `rgb(14,15,17)` | `--text` / `text-text` (near-black) |
| `rgb(119,128,141)` | `text-muted` `#77808d`→ use `rgb(119,128,141)` |
| `rgb(174,180,188)` | muted/placeholder (neutral-400) |
| `rgb(244,245,246)` | surface fill (neutral-100) |
| `rgb(230,232,234)` | border (neutral-200) |
| `rgb(66,199,114)` | yes/green |
| `rgb(226,57,57)` | no/red |
| `rgb(20,82,240)` | primary/pip blue |
| radius 24px | sheet top |
| radius 9.2px | button/chip (`rounded-[9px]`) |
| radius 7.2px | icon button |
