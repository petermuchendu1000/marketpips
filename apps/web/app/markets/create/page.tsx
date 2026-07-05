'use client'

// app/markets/create/page.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, Info } from 'lucide-react'
import type { MarketCategory } from '@/types'
import { CATEGORY_LABELS } from '@/types'
import { useAuth } from '@/hooks/use-auth'

export default function CreateMarketPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<MarketCategory>('other')
  const [criteria, setCriteria] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [tags, setTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Min close date: tomorrow
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().slice(0, 16)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { toast.error('Sign in to create markets'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category,
          resolution_criteria: criteria,
          closes_at: new Date(closesAt).toISOString(),
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to create market')
        return
      }

      toast.success('Market created! It will be reviewed shortly.')
      router.push(`/markets/${data.data.slug}`)

    } catch {
      toast.error('Network error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-lg text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
        <p className="text-muted-foreground mb-6">You need an account to create markets.</p>
        <a href="/auth/login" className="inline-flex px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
          Sign In
        </a>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-black mb-2">Create a Market</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Markets are reviewed by our team before going live. Clear resolution criteria = faster approval.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="question" className="text-sm font-medium mb-1.5 block">
            Question <span className="text-destructive">*</span>
          </label>
          <input id="question"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={10}
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Will [event] happen by [date]?"
          />
          <p className="text-xs text-muted-foreground mt-1">{title.length}/200 · Start with &quot;Will...&quot;</p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="text-sm font-medium mb-1.5 block">
            Description <span className="text-destructive">*</span>
          </label>
          <textarea id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            rows={4}
            className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Provide context about this market. What is the background? Why does it matter?"
          />
        </div>

        {/* Category */}
        <div>
          <span className="text-sm font-medium mb-1.5 block">Category</span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {(Object.keys(CATEGORY_LABELS) as MarketCategory[]).map((cat) => {
              const info = CATEGORY_LABELS[cat]
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    category === cat
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="text-base">{info.emoji}</span>
                  <span>{info.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Resolution criteria */}
        <div>
          <label htmlFor="resolution-criteria" className="text-sm font-medium mb-1.5 block">
            Resolution Criteria <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-1 items-start mb-1.5">
            <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Describe EXACTLY how this market resolves YES or NO. Include the authoritative source.
            </p>
          </div>
          <textarea id="resolution-criteria"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            required
            minLength={20}
            maxLength={1000}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Resolves YES if [specific condition] per [authoritative source, e.g. official government announcement / Wikipedia]."
          />
        </div>

        {/* Close date */}
        <div>
          <label htmlFor="betting-closes-at" className="text-sm font-medium mb-1.5 block">
            Betting Closes At <span className="text-destructive">*</span>
          </label>
          <input id="betting-closes-at"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            required
            min={minDateStr}
            className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="tags" className="text-sm font-medium mb-1.5 block">
            Tags <span className="text-muted-foreground">(optional)</span>
          </label>
          <input id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="kenya, elections, politics (comma-separated)"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 transition-all active:scale-95"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
            </span>
          ) : 'Submit Market for Review'}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Markets are reviewed within 24h. You earn 0.25% of market volume as the creator.
        </p>
      </form>
    </div>
  )
}
