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
