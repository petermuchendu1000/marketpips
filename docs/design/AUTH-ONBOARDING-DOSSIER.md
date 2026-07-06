# Auth / Onboarding — Design Dossier (Pip system)

Routes: `/auth/login`, `/auth/register` · Model: **Preview → Gate → Bridge**.

## 1. Research (why the references work)
- **Stripe onboarding** — the form is never a cold wall. A calm value panel sits
  beside a *minimal* field set; only what's needed is asked, and trust cues
  (encryption, no card) are always in view. Progressive disclosure hides
  optional fields until wanted.
- **themasterly.com fintech onboarding UX** — reduce fields, show value first,
  reinforce trust at the moment of friction (the submit). Password feedback and
  clear affordances lower abandonment.

## 2. Preview → Gate → Bridge
- **Preview / Bridge (left panel, desktop):** brand, a one-line promise, four
  concrete value props, and a rail of real payment methods + an encryption line.
  Shows *what the product does* before asking for anything.
- **Gate (right panel):** the minimal form. Login = email + password only.
  Register = name, email, password, country; referral is disclosed on demand.

## 3. User goals
- Login: get in fast, recover password, or divert to register.
- Register: understand the value, sign up with the fewest fields, feel safe,
  know what happens next (email confirmation).

## 4. Component spec
- `AuthShell` — 2-col grid; bridge is `hidden lg:flex` (mobile shows form only,
  with a compact logo header). Brand-led in **Pip blue** (links/accents), never
  the market-green (green is reserved for YES semantics).
- `PasswordInput` — Show/Hide **text** toggle (clearer + more trustworthy than a
  mystery eye glyph), correct `autoComplete` (current- vs new-password),
  `aria-describedby` wiring to the strength meter.
- Register extras: 0–4 **password-strength meter** (length + variety), inline
  min-length hint, submit disabled until valid, emoji-free country select
  ("Kenya · KES"), progressive-disclosure referral field.

## 5. A11y / SEO / performance
- Every input has a real `<label htmlFor>`; errors are `role="alert"
  aria-live="assertive"`; toggle is `aria-pressed`.
- Color is never the only signal (labels + text carry meaning) — WCAG 1.4.1.
- Client components (Supabase auth in the browser); no heavy deps added.
- Removed all undefined legacy `var(--green-dim/faint/light)` styles — the pages
  now use the app's Tailwind token classes, so nothing renders unstyled.

## 6. Review gates
Would Stripe ship this gate? (minimal fields, value beside it, trust cues) ✓
Any emoji / lucide / broken tokens? ✗ — pure Pip system, custom icons. ✓
Is meaning ever color-only? ✗ (signs, labels, text). ✓
