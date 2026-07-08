// lib/media/entity-image.ts
// ------------------------------------------------------------
// Deterministic, dependency-free imagery resolution for market/outcome avatars
// (the company logos / people photos Kalshi & Polymarket show per market).
//
// Strategy — "resolve once, store once, serve from CDN; never hotlink at
// render". This module is the PURE core:
//   • monogram()  — a stable initials + brand-colour avatar computed from a
//                   name. Zero network, zero storage, never broken → the
//                   universal fallback (and the ship-now baseline).
//   • faviconUrl()/wikimediaThumb() — cheap hosted-image URLs for the optional
//                   "real imagery" upgrade path (used by the ingestion job that
//                   normalises + stores to Supabase Storage, not at render).
// No side effects, no imports → trivially unit-testable.

/** FNV-1a 32-bit hash — small, fast, stable across runtimes (no Math.random). */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 1–2 uppercase initials from a name ("Anthropic" → "A", "Bola Tinubu" → "BT"). */
export function initialsFor(name: string): string {
  const words = (name || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    const w = words[0]
    return (w.length >= 2 ? w.slice(0, 2) : w[0]).toUpperCase()
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export interface Monogram {
  initials: string
  /** Solid background colour (HSL string). */
  bg: string
  /** Readable foreground colour (HSL string). */
  fg: string
}

/** Convert an HSL triple (h 0–360, s/l 0–100) to sRGB channels in [0,1]. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360 / 360
  const sn = Math.min(1, Math.max(0, s / 100))
  const ln = Math.min(1, Math.max(0, l / 100))
  if (sn === 0) return [ln, ln, ln]
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue2rgb = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [hue2rgb(hn + 1 / 3), hue2rgb(hn), hue2rgb(hn - 1 / 3)]
}

/** WCAG 2.x relative luminance of an HSL colour. */
function hslLuminance(h: number, s: number, l: number): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const [r, g, b] = hslToRgb(h, s, l)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Foreground is a fixed near-white tint of the hue; the background lightness is
// then capped so the pair always clears WCAG AA (4.5:1) for the initials.
const MONO_BG_SAT = 58
const MONO_FG_SAT = 70
const MONO_FG_LIGHT = 96

/**
 * Deterministic monogram for a name. The hue is derived from the hash so the
 * same entity always renders the same colour. Because HSL lightness ≠ perceived
 * luminance (yellow/green read far brighter than blue at the same lightness), a
 * fixed lightness cannot guarantee contrast — so we pick, per hue, the lightest
 * background whose luminance still clears AA against the near-white initials.
 * Result: vivid, on-brand tiles that are provably ≥4.5:1 for every hue.
 */
export function monogram(name: string): Monogram {
  const h = hashString((name || '').trim().toLowerCase())
  const hue = h % 360
  const fgLum = hslLuminance(hue, MONO_FG_SAT, MONO_FG_LIGHT)
  // Max background luminance for a 4.5:1 ratio, with a safety margin to survive
  // integer-lightness rounding.
  const cap = ((fgLum + 0.05) / 4.5 - 0.05) * 0.92
  // Largest integer lightness whose background luminance stays under the cap.
  let bgLight = 0
  for (let l = 100; l >= 0; l--) {
    if (hslLuminance(hue, MONO_BG_SAT, l) <= cap) {
      bgLight = l
      break
    }
  }
  const bg = `hsl(${hue} ${MONO_BG_SAT}% ${bgLight}%)`
  const fg = `hsl(${hue} ${MONO_FG_SAT}% ${MONO_FG_LIGHT}%)`
  return { initials: initialsFor(name), bg, fg }
}

/** Basic URL guard so callers can treat admin-provided strings safely. */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Normalise a domain-ish string ("https://Openai.com/x" | "OpenAI.com" → "openai.com"). */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let s = input.trim().toLowerCase()
  if (!s) return null
  if (s.includes('/') || s.includes(':')) {
    try {
      s = new URL(s.includes('://') ? s : `https://${s}`).hostname
    } catch {
      return null
    }
  }
  s = s.replace(/^www\./, '')
  // A bare hostname must contain a dot and no spaces.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null
}

/**
 * Cheap favicon/logo URL for a company domain (Google's S2 service). Used only
 * by the ingestion job as a low-confidence fallback source — the fetched image
 * is normalised and stored; we never depend on this at render time.
 */
export function faviconUrl(domain: string, size: 32 | 64 | 128 | 256 = 128): string | null {
  const d = normalizeDomain(domain)
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=${size}` : null
}

/** Wikimedia REST thumbnail for a person/topic title (ingestion source only). */
export function wikimediaThumb(title: string, size = 240): string | null {
  const t = (title || '').trim()
  if (!t) return null
  const enc = encodeURIComponent(t.replace(/\s+/g, '_'))
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${enc}?thumbnail_size=${size}`
}

export interface ResolvedImage {
  kind: 'image' | 'monogram'
  /** Present when kind === 'image'. */
  src?: string
  /** Always present — the render fallback. */
  mono: Monogram
}

/**
 * Render-time resolution: prefer a stored/explicit image URL, else the
 * deterministic monogram. Intentionally does NOT reach out to third parties —
 * that belongs in the ingestion pipeline.
 */
export function resolveEntityImage(args: {
  name: string
  imageUrl?: string | null
}): ResolvedImage {
  const mono = monogram(args.name)
  if (isHttpUrl(args.imageUrl)) return { kind: 'image', src: args.imageUrl, mono }
  return { kind: 'monogram', mono }
}
