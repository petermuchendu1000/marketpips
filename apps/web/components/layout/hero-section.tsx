import Link from 'next/link'
import type { Market } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import {
  IconArrowRight, IconShield, IconClock, IconUser, IconTrendUp,
  IconCheck, CategoryIcon,
} from '@/components/ui/icons'

// Currencies we settle in — shown as clean tabular codes, not flag emoji.
const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF']
const PAYMENTS = ['M-Pesa', 'MTN MoMo', 'Airtel Money', 'PesaPal']

function timeLeft(closes: string) {
  const ms = new Date(closes).getTime() - Date.now()
  if (ms < 0) return 'Closed'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h left`
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

// Deterministic, gentle sparkline that resolves to the current probability.
// Purely visual continuity — carries no fabricated numeric labels.
function sparkPath(seed: string, end: number, w = 300, h = 44) {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  const n = 24
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const pts: number[] = []
  let v = 0.5
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 0.12
    const target = end / 100
    v += (target - v) * (i / n) * 0.5
    v = Math.max(0.06, Math.min(0.94, v))
    pts.push(v)
  }
  pts[n - 1] = Math.max(0.06, Math.min(0.94, end / 100))
  const step = w / (n - 1)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return { line, area }
}

function FeaturedMarketCard({ market }: { market: Market }) {
  const cat = CATEGORY_LABELS[market.category] ?? { label: 'Market' }
  const yesPct = Math.max(1, Math.min(99, Math.round(market.yes_price * 100)))
  const noPct = 100 - yesPct
  const spark = sparkPath(market.id + market.slug, yesPct)
  const vol = market.total_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="card block p-5 sm:p-6"
      aria-label={`Featured market: ${market.title}`}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <span className="badge badge-muted gap-1.5">
          <CategoryIcon category={market.category} size={12} />
          {cat.label}
        </span>
        <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--text-3)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full animate-pulse-dot" style={{ background: 'var(--yes)' }} />
            Live
          </span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1"><IconClock size={12} /> {timeLeft(market.closes_at)}</span>
        </span>
      </div>

      {/* question */}
      <h3 className="mt-4 text-[1.15rem] font-semibold leading-snug tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
        {market.title}
      </h3>

      {/* probability lead */}
      <div className="mt-4 flex items-baseline gap-2.5">
        <span className="font-mono text-[2.6rem] leading-none font-semibold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>
          {yesPct}<span className="text-[1.4rem]">%</span>
        </span>
        <span className="text-sm" style={{ color: 'var(--text-3)' }}>chance&nbsp;·&nbsp;Yes</span>
      </div>

      {/* probability bar */}
      <div className="mt-4">
        <div className="prob-bar" role="img" aria-label={`Yes ${yesPct} percent, No ${noPct} percent`}>
          <div className="prob-bar-fill" style={{ width: `${yesPct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="price-yes">Yes {yesPct}%</span>
          <span className="price-no">No {noPct}%</span>
        </div>
      </div>

      {/* yes / no */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <span className="btn-yes text-center">Buy Yes</span>
        <span className="btn-no text-center">Buy No</span>
      </div>

      {/* sparkline */}
      <svg className="mt-5 w-full" height={44} viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
        <path d={spark.area} fill="var(--pip-500)" opacity="0.09" />
        <path d={spark.line} fill="none" stroke="var(--pip-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* footer */}
      <div className="mt-4 pt-4 flex items-center justify-between text-[12px]" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--text-3)' }}>
        <span className="flex items-center gap-1.5"><IconTrendUp size={12} /> ${vol} volume</span>
        <span className="flex items-center gap-1.5"><IconUser size={12} /> {market.unique_bettors.toLocaleString()} traders</span>
      </div>
    </Link>
  )
}

export function HeroSection({ featured }: { featured?: Market | null }) {
  return (
    <section className="relative overflow-hidden">
      {/* subtle brand wash — a single restrained Pip-Blue radial, no green glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 460px at 82% -10%, var(--pip-100), transparent 60%)', opacity: 0.7 }}
      />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center py-14 sm:py-20">

          {/* Left — value proposition */}
          <div>
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--pip-text)' }}>
              <span className="w-[7px] h-[7px] rounded-full animate-pulse-dot" style={{ background: 'var(--pip-500)' }} />
              Live markets · East Africa
            </span>

            <h1 className="mt-5 font-display font-bold leading-[1.04] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2.4rem, 6vw, 3.9rem)', color: 'var(--text)' }}>
              The clearest view of<br />
              <span style={{ color: 'var(--pip-text)' }}>what happens next.</span>
            </h1>

            <p className="mt-6 text-[1.05rem] sm:text-[1.2rem] leading-relaxed max-w-[34ch]" style={{ color: 'var(--text-2)' }}>
              Trade real-world outcomes — elections, the economy, sports and more.
              Live probabilities you can read at a glance. Settled in KES, funded by M-Pesa.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/markets" className="btn btn-primary btn-lg">
                Explore markets <IconArrowRight size={16} />
              </Link>
              <Link href="#how-it-works" className="btn btn-secondary btn-lg">
                How it works
              </Link>
            </div>

            <div className="mt-8 pt-6 flex flex-wrap gap-x-6 gap-y-3" style={{ borderTop: '1px solid var(--hairline)' }}>
              {[
                { icon: <IconShield size={15} />, label: 'Regulated & KYC-protected' },
                { icon: <IconCheck size={15} />, label: 'Transparent resolution' },
                { icon: <IconTrendUp size={15} />, label: 'LMSR fair pricing' },
              ].map(t => (
                <span key={t.label} className="flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--pip-text)' }}>{t.icon}</span>
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Right — live featured market */}
          {featured ? (
            <FeaturedMarketCard market={featured} />
          ) : (
            <div className="card p-6" style={{ color: 'var(--text-3)' }}>
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <span className="w-[7px] h-[7px] rounded-full animate-pulse-dot" style={{ background: 'var(--yes)' }} />
                Live markets loading…
              </div>
              <div className="mt-4 space-y-3">
                <div className="skeleton h-5 w-4/5" />
                <div className="skeleton h-12 w-1/2" />
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="skeleton h-11" /><div className="skeleton h-11" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Settlement currencies + payment rails — clean, no emoji */}
        <div className="pb-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-3)' }}>Settles in</span>
            <div className="flex flex-wrap gap-1.5">
              {CURRENCIES.map(c => (
                <span key={c} className="font-mono text-[12px] px-2 py-1 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--text-2)' }}>{c}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-3)' }}>Fund with</span>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENTS.map(p => (
                <span key={p} className="text-[12px] font-medium px-2.5 py-1 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--text-2)' }}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
