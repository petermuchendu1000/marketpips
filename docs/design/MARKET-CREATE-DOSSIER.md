# Create a Market — Design Dossier (Pip system)

Route: `/markets/create` · Model: 4-step authoring wizard with a live preview.

## 1. Research (why the references work)
- **docs.kuest.com/create-market** — a market is only as good as its *resolution
  clarity*. The flow forces a credible source and deterministic rules before
  publish, so disputes are designed out. We adopt: required source, explicit UTC
  cutoff, and pre-declared tie / cancellation handling.
- **Polymarket / Kalshi create flows** — progressive disclosure (structure →
  question → resolution → review), a persistent preview of the resulting card,
  and inline validation. Kalshi's credibility comes from contract specs shown
  up front; we mirror that by making resolution a first-class step, not a
  footnote.

## 2. Structure reality (honest scope)
The trading engine is **binary LMSR** (YES/NO, `yes_price`/`no_price`). There is no
outcomes table and the market detail/ticket render binary only. Therefore:
- **Binary** is fully supported and publishable today.
- **Multi-outcome** is presented as a first-class, well-designed structure option
  but gated *Coming soon* — shipping a tradeable multiple-choice market would
  render a broken binary ticket. This matches how Kalshi rolled out (binary-first).

## 3. Flow (single focus per step)
`Structure → Question & outcomes → Resolution → Review & publish`
1. **Structure** — pick Binary (available) vs Multi-outcome (coming soon); choose a
   category (custom `CategoryIcon`, no emoji).
2. **Question & outcomes** — the question (title), context (description), tags, and
   the **opening probability** for YES via a slider. The stored `yes_price` seeds
   the LMSR (place_bet v2 reads it), so the opening estimate is real, not cosmetic.
3. **Resolution** — the **credible source URL** (`resolution_source`) with a
   source-quality prompt, deterministic **rules** (`resolution_criteria`), the
   **UTC close cutoff** (`closes_at`, shown resolved to UTC) and optional
   resolution date (`resolves_at`), plus structured **tie** and **cancellation /
   void** handling (woven into the rules + stored in `metadata`).
4. **Review & publish** — a full read-back with jump-to-edit, creator-reward and
   review-process notes, then publish.

## 4. Validation (enforced required fields + credible-source prompt)
- Title 10–200, description 20–2000, criteria 20–1000 (mirrors the API's Zod).
- Close must be ≥ 1h in the future; resolution ≥ close.
- Source: URL-validated; a prompt steers creators to primary / official sources
  (and flags obviously weak sources like social posts).
- The wizard blocks Continue until the current step is valid; Review blocks
  publish until every step is valid, with clear jump-to-fix affordances.

## 5. Backend (additive only — no migration)
Existing columns are reused: `resolution_type`, `resolution_source`, `metadata`
(JSON), `yes_price`/`no_price`. The POST `/api/markets` Zod schema is extended
with `resolution_type` (default binary), `resolution_source`, `initial_probability`
(→ yes/no price) and `metadata`. User markets still land in `pending` for admin
review; admins/mods publish straight to `active`.

## 6. Component spec
- `CreateWizard` — client state machine (structure/question/resolution/review),
  per-step validation, submit + redirect.
- `WizardProgress` — numbered step rail (done / current / upcoming), never
  color-only; compact on mobile.
- `StructureCard` — large selectable structure option (available / coming-soon).
- `ProbabilityField` — YES/NO opening-probability slider with live prob-bar.
- `MarketPreview` — sticky live card preview mirroring the real market card, plus
  contextual guidance for the active step.
- Thin `page.tsx` — auth guard + render the wizard.

## 7. A11y / SEO / performance
- Real `<label htmlFor>`; errors `role="alert" aria-live`; step marked
  `aria-current="step"`; slider is a native range with value text.
- Structure/category choices are real buttons with `aria-pressed`.
- Authoring flow → client-rendered, no indexable content; no new heavy deps.

## 8. Review gates
Progressive disclosure? ✓ · Required fields enforced? ✓ · Credible-source prompt? ✓
Deterministic rules (source + UTC cutoff + tie/void)? ✓ · Live preview? ✓ · Honest
about binary-only trading? ✓ · Pure Pip system, custom icons, no emoji? ✓
