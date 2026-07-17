# Polymarket market-detail — MEASURED spec sheet (ground truth)

All values captured from the **live** PM page
`https://polymarket.com/event/democratic-presidential-nominee-2028`
via headless Chromium + `getComputedStyle` / `getBoundingClientRect`
(desktop viewport 1280×900, DPR 2). Harness: `/home/user/pm_extract_specs.py`
and `/home/user/pm_extract_ticket.py` (re-runnable). Font family: **Inter**
(weights 400 / 500 / 600). Global token: `--navbar-height: 116px`.

These are the authoritative numbers — do NOT approximate. When a value is not
yet measured it is marked TODO with the reason.

## Header
| Element | fontSize | weight | line-height | letter-spacing | color | notes |
|---|---|---|---|---|---|---|
| H1 title | 24px | 600 | 28px | −0.36px | #0E0F11 | static (not larger on desktop) |
| Breadcrumb link | 14px | 600 | 20px | −0.09px | #77808D | pad 4/10, gap 6, radius 9.2px, transition 0.15s cubic-bezier(.4,0,.2,1) |
| Identity avatar | — | — | — | — | — | 64×64, radius 7.2px (rounded-sm) |
| Action icon button | — | — | — | — | — | 36×36, circular (border-radius ∞) |

## Related (sidebar list)
| Element | fontSize | weight | lh | color | box |
|---|---|---|---|---|---|
| Heading "Related" | 16px | 500 | 24px | #18181B | mb 16px |
| Row `<a>` inner | 16px | 400 | 24px | #0E0F11 | pad 8/10, gap 10, radius 11.2px, h≈59 |
| Icon | — | — | — | — | 40×40, radius 9.2px, object-cover |
| Title `<p>` | 14px | 500 | 20px | #18181B | line-clamp-2 |
| % | 18px | 500 | 27px | #18181B | right-aligned |
| Sub-label (leading outcome) | 12px | 400 | 16px | #77808D | — |

## Outcome board (multi)
| Element | fontSize | weight | lh | letter-spacing | color | box |
|---|---|---|---|---|---|---|
| Candidate name | 16px | 600 | 20px | −0.18px | #18181B | truncate |
| Volume | 13px | ~400 | 19.5px | −0.09px | #77808D | "$12,190,948 Vol." (full commas) |
| Big % | 28px | 600 | 28px | −0.42px | #0E0F11 | centre column |
| Buy Yes (LEADING) | 14px | 600 | 20px | −0.09px | #FFFFFF | **bg #30A159 solid**, h48 w136, radius 7.2px, pad 8/16, gap 4 |
| Buy Yes (other) | 14px | 600 | 20px | −0.09px | #30A159 | bg rgba(48,161,89,**0.15**) → hover 0.25 |
| Buy No (all) | 14px | 600 | 20px | −0.09px | #E23939 | bg rgba(226,57,57,**0.09**) → hover 0.13 |
| Button transition | — | — | — | — | — | background-color+color 0.15s cubic-bezier(.4,0,.2,1) |

## Order ticket
| Element | fontSize | weight | color / bg | box |
|---|---|---|---|---|
| Market title | 14px | 500 | #77808D (muted) | truncate |
| Outcome line | 16px | 600 | #18181B (+ green "Yes") | — |
| Buy/Sell tab (heading-lg) | 16px | 600 | active #0E0F11 w/ 2px underline | — |
| Market dropdown | 14px | 500 | #77808D | chevron |
| Quick chip (+$1) | 12px | 600 | #77808D | h30, pad 0/10, radius 9.2px, 1px hairline border |
| Trade button | (label ~600) | — | **bg #1452F0** | h≈44, radius 9.2px |

## Colours (exact, from measured pixels)
- PM green (Yes): **#30A159** = rgb(48,161,89)
- PM red (No): **#E23939** = rgb(226,57,57)
- PM CTA blue: **#1452F0** = rgb(20,82,240)   ← differs from our brand pip-500 #2B50E4
- Text primary: #0E0F11 · secondary: #77808D · zinc heading: #18181B
- Hairline border: #E6E8EA = rgb(230,232,234)

## TODO (needs refined selectors / mobile run)
- Yes/No big toggle buttons in ticket (markup uses `.trading-button` wrapper)
- Amount input field ($0) computed styles
- Chart Y-axis / X-axis tick typography, gridline dash pattern, scrubber
- Comments composer + tab bar active-underline metrics
- Mobile viewport (390px) re-measure of header / legend (stacked) / board
