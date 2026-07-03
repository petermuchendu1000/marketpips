# Landing Page Rebuild — Gap Analysis & Port Plan
### Bringing `apps/web` up to the documented "Pip" design system

**Author:** Product Design Org (Principal PD · Design Systems · Frontend Arch · Visual · A11y · SEO · Perf)
**Scope:** Landing page only (per brief). Foundational design tokens are shared, so this work also raises the floor for every other page.
**Status:** In progress — executed as small, independently committed sub-milestones.

---

## 1. What already exists

- **`docs/design/LANDING-PAGE-DOSSIER.md`** — the single source of truth: competitive research (Polymarket, Kalshi, PremiumBlock), positioning, the full "Pip" token system, a11y/SEO/perf strategy, and the landing spec. This is complete and correct; we do **not** re-derive it.
- **`docs/design/landing-prototype/`** — a framework-free reference implementation that faithfully renders the Pip system (correct tokens, type, semantics, motion, a11y). This is the visual gold standard.
- **A mature backend** — Supabase schema, LMSR pricing, wallets/FX, trading, portfolio P&L, payments, admin, i18n, background jobs. The data layer is production-grade.

## 2. The gap (why the shipped frontend reads as "poor")

The live `apps/web` landing page predates the dossier and violates the Pip system on nearly every axis. It is a generic "casino-green" fintech skin — precisely the anti-pattern the brief forbids ("Never casino").

| Axis | Dossier / Pip system (correct) | Shipped `apps/web` (wrong) |
|---|---|---|
| Brand color | Confident cobalt **Pip Blue** `#2B50E4`; green reserved for YES only | **Green is the brand** (`#16a34a`/`#22c55e`) everywhere → casino feel |
| Typography | **Hanken Grotesk** (UI) + **IBM Plex Mono** (numerics, tabular) | Sora + Inter + JetBrains Mono |
| Headline | Plain, confident: "The clearest view of what happens next" | Hype: **"Predict the future. Get paid."** with a green **gradient** |
| Effects | Structure with hairlines; **no gradients, no glows, no glassmorphism** | Green **radial glow blob** + gradient text (both forbidden) |
| Iconography | Custom pip-motif SVG | Emoji stats (📊 💰 🌍 👥), flag emoji, 🔮 empty state |
| Radius | Restrained: 8 / 12 / 16px | Oversized `2xl 24px` / `3xl 32px` + `shadow-glow` |
| Semantics | Desaturated YES `#1F9D6B` / NO `#D1495B` (defuse ticker anxiety) | Neon green/red |
| Voice | Precise, plain — "numbers do the talking" | Marketing hype |

## 3. Strategy — coherent, low-blast-radius port

The legacy token names (`--text-primary`, `--bg-secondary`, `--green`, `--border`) are referenced by 23+ files. Rather than touch every file, we **make `globals.css` the Pip system and alias the legacy names to Pip values.** This upgrades the entire app's palette and primitives (`.btn`, `.card`, `.input`, nav, dropdown, modal, badges, skeletons) in one place, then we purpose-build the landing components against the new primitives.

**Token bridge (examples):** `--green → --yes`, `--red → --no`, `--bg-secondary → --surface`, `--text-primary → --text`, `--border → --hairline`, brand primary → `--pip-500`.

## 4. Sub-milestones (each committed separately)

1. **docs** — this plan _(current)_.
2. **tokens** — rewrite `globals.css` to the Pip system with legacy aliases; upgrade `.btn`/`.card`/`.input`/nav/dropdown/modal/badge primitives; fix `tailwind.config.ts` (Hanken Grotesk + IBM Plex Mono, restrained radii, remove glow, desaturated semantics); load fonts + set `themeColor` in `layout.tsx`.
3. **navbar** — rebuild to Pip (blue brand, hairline header, remove casino green).
4. **hero** — rebuild: plain confident copy, no gradient/glow/emoji, live featured-market card with probability bar + sparkline + tabular numerics.
5. **landing sections** — live ticker, category browse, featured grid, how-it-works, plain-language LMSR, trust & transparency, count-up stats, CTA band, footer — wired to real Supabase data where present, with skeleton/empty states.
6. **verify** — typecheck + `next build` + Playwright smoke; fix regressions; final commit.

**Definition of done:** tokens-only styling (no magic hex in components), Pip Blue brand, desaturated semantics, custom icons (no emoji as UI), dark+light coherent, keyboard + focus-visible verified, LCP hero server-rendered, JSON-LD present, build green.
