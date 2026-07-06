# KYC / Identity Verification — Design Dossier (Pip system)

Route: `/kyc` · Model: stepped, pre-informed, level-based verification.
Status: **v2 — Institutional "Verification Console"** (complete UI redesign).

## 1. Research (why the references work)
- **greenmoov.app frictionless KYC** — reduces drop-off by (a) telling users
  exactly what they'll need *before* starting, (b) breaking the ask into small
  single-focus steps, (c) warm, reassuring micro-copy, and (d) camera capture on
  mobile so ID/selfie are one tap. We adopt all four.
- **shadcn.io identity-verification block** — a clear step rail, one action per
  screen, inline validation, and a visible trust/encryption cue at the point of
  friction. We match the structure and elevate it onto the Pip system.
- **Stripe Identity / Persona / Onfido** — the persistent *context rail*: the
  user always sees where they are, what tier they're earning, and who is keeping
  their data safe. Verification is a trust transaction, not a form — the UI must
  *earn* the ID upload before it asks for it.

## 2. The v2 problem statement (why redesign)
v1 was correct but *thin*: a single centred card, a horizontal step rail, no
persistent trust context, and no regulator/assurance signalling. For a fintech
identity gate that is not enough — the moment we ask for a government ID and a
selfie, the interface must radiate institutional trust. v2 rebuilds the page as a
**two-pane Verification Console**.

## 3. Layout — Console (BRIDGE → GATE), mirroring AuthShell
- **Left rail (desktop, sticky) — the trust bridge:**
  - Brand lockup (LogoMark + wordmark).
  - **VerificationMeter** — a segmented Basic → Enhanced ladder that fills live as
    steps complete, naming exactly what each tier unlocks (limits).
  - **Vertical stepper** — all five steps with icon, label, one-line descriptor
    and state (done ✓ / current / upcoming); current carries `aria-current`.
  - **TrustRail** — regulator/assurance chips: AES-256 encryption, data-protection
    compliance, human compliance review, "never sold / never shared", review SLA.
- **Right pane — the gate:** on mobile the rail collapses to a compact
  "Step X of N" bar + live LevelBadge; the focused step card sits below with a
  single clear action.

## 4. Flow (single focus per step)
`Overview → Email → Phone → ID document → Selfie → Address → Submit`
- **Overview** pre-informs requirements (~3 min), lists what's needed, states the
  benefits (what verification unlocks), shows the encryption/trust cue, and sets
  the level expectation with a prominent, calm CTA.
- **Email** is already confirmed at signup → shown read-only with a Verified badge.
- **Phone** → saved to `profiles.phone_number`.
- **ID** → type (National ID / Passport / Driver's licence), number, country,
  optional expiry, front (+ back when the doc has one) with camera capture.
- **Selfie** → front-camera capture, matched to the ID at review.
- **Address** → residential address; unlocks the **Enhanced** level.

## 5. Verification levels (the badge + meter)
- **Basic** = email + phone → unlocks trading + smaller limits.
- **Enhanced** = + government ID, selfie, address → unlocks full deposits,
  withdrawals and highest limits.
- `LevelBadge` + `VerificationMeter` reflect the *live* achieved level, derived
  from completed steps — they flip from Basic to Enhanced as ID/selfie/address are
  satisfied, and show a pending state once submitted.

## 6. Backend (unchanged — additive only)
- Persists to the existing `kyc_documents` (type/number/country/expiry + front/
  back/selfie image URLs in the `kyc-documents` storage bucket) and flips
  `profiles.kyc_status → pending` + saves the phone number.
- **Migration 019** adds nullable `address_line1/city/postal_code/country` to
  `kyc_documents` (additive, backward compatible). The address write is a
  best-effort follow-up update wrapped in try/catch, so submission still succeeds
  even before the migration is applied.

## 7. Component spec
- `KycConsole` — the two-pane shell: sticky trust bridge (rail) + gate content.
- `VerificationMeter` — segmented Basic→Enhanced ladder with live fill + unlocks.
- `KycStepper` — `orientation="vertical"` rail for the bridge; `"compact"` bar for
  mobile; done/current/upcoming states, never color-only.
- `TrustRail` — regulator/assurance chip cluster (encryption, compliance, privacy,
  human review, SLA).
- `FileDrop` — drag-drop + browse + `capture` camera hook, live preview, type +
  size validation, inline errors, remove/replace.
- `LevelBadge`, `KycWizard` (state machine + submit), thin page wrapper handling
  the auth guard and the verified/pending terminal states (both re-skinned onto
  the console for visual continuity).

## 8. A11y / SEO / performance
- Real `<label htmlFor>` on every field; errors `role="alert" aria-live`;
  current step marked `aria-current="step"`; toggle/nav are real buttons.
- The meter and stepper never rely on color alone — icons, labels and text carry
  state. Focus-visible rings on all controls.
- Personal flow → client-rendered, no indexable content; no heavy deps added.

## 9. Review gates
Does it pre-inform before asking? ✓ · One focus per step? ✓ · Camera on mobile? ✓
Persistent trust context (regulator/assurance)? ✓ (v2) · Level meter reflects real
progress? ✓ · Two-pane console consistent with AuthShell? ✓ · Any emoji / DaisyUI /
broken tokens? ✗ — pure Pip system, custom icons only.
