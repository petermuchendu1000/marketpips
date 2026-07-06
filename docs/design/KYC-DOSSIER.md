# KYC / Identity Verification — Design Dossier (Pip system)

Route: `/kyc` · Model: stepped, pre-informed, level-based verification.

## 1. Research (why the references work)
- **greenmoov.app frictionless KYC** — reduce drop-off by (a) telling users
  exactly what they'll need *before* starting, (b) breaking the ask into small
  single-focus steps, (c) warm, reassuring micro-copy, and (d) camera capture on
  mobile so ID/selfie are one tap. We adopt all four.
- **shadcn.io identity-verification block** — a clear step rail, one action per
  screen, inline validation, and a visible trust/encryption cue at the point of
  friction. We match the structure and elevate it onto the Pip system.

## 2. Flow (single focus per step)
`Overview → Email → Phone → ID document → Selfie → Address → Submit`
- **Overview** pre-informs requirements (~3 min), lists what's needed, shows the
  encryption/trust cue, and sets the level expectation.
- **Email** is already confirmed at signup → shown read-only with a Verified badge.
- **Phone** → saved to `profiles.phone_number`.
- **ID** → type (National ID / Passport / Driver's licence), number, country,
  optional expiry, front (+ back when the doc has one) with camera capture.
- **Selfie** → front-camera capture, matched to the ID at review.
- **Address** → residential address; unlocks the **Enhanced** level.

## 3. Verification levels (the badge)
- **Basic** = email + phone. **Enhanced** = + government ID, selfie, address.
- `LevelBadge` reflects the *live* achieved level, derived from completed steps —
  it flips from Basic to Enhanced as the ID/selfie/address steps are satisfied,
  and shows "· pending" once submitted.

## 4. Backend
- Persists to the existing `kyc_documents` (type/number/country/expiry + front/
  back/selfie image URLs in the `kyc-documents` storage bucket) and flips
  `profiles.kyc_status → pending` + saves the phone number.
- **Migration 019** adds nullable `address_line1/city/postal_code/country` to
  `kyc_documents` (additive, backward compatible). The address write is a
  best-effort follow-up update wrapped in try/catch, so submission still
  succeeds even before the migration is applied.

## 5. Component spec
- `KycStepper` — full rail with connectors (desktop) / "Step X of N" + bar
  (mobile); done/current/upcoming states, never color-only.
- `FileDrop` — drag-drop + browse + `capture` camera hook, live preview, type +
  size validation, inline errors, remove/replace.
- `LevelBadge`, `KycWizard` (state machine + submit), thin page wrapper handling
  auth guard and verified/pending terminal states.

## 6. A11y / SEO / performance
- Real `<label htmlFor>` on every field; errors `role="alert" aria-live`;
  current step marked `aria-current="step"`; toggle/nav are real buttons.
- Personal flow → client-rendered, no indexable content; no heavy deps added.
- Color never the sole signal (icons, labels, badges, text carry meaning).

## 7. Review gates
Does it pre-inform before asking? ✓ · One focus per step? ✓ · Camera on mobile? ✓
Level badge reflects real progress? ✓ · Any emoji / DaisyUI / broken tokens? ✗ —
replaced the old `steps`/`loading-spinner`/`text-base-content` + 🪪✅⏳ with the
Pip system. ✓
