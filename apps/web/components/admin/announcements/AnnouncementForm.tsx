'use client'

// Compose an announcement: title, body, channels, audience segmentation and an
// optional schedule. Shows a live recipient estimate via the preview endpoint,
// then saves a draft/scheduled row via POST /api/admin/announcements. Sending
// is done from the list row (explicit, confirmed) after review.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CHANNELS, AUDIENCE_ROLES, AUDIENCE_STATUSES, channelLabel } from '@/lib/admin/announcements'

const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm'
const label = 'text-xs font-medium text-muted-foreground'

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

export function AnnouncementForm({ countries }: { countries: string[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ count: number; description: string } | null>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [channels, setChannels] = useState<string[]>(['in_app'])
  const [roles, setRoles] = useState<string[]>([])
  const [selCountries, setSelCountries] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>(['active'])
  const [scheduledAt, setScheduledAt] = useState('')

  function audiencePayload() {
    return {
      countries: selCountries.length ? selCountries : null,
      roles: roles.length ? roles : null,
      statuses: statuses.length ? statuses : ['active'],
    }
  }

  async function doPreview() {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/announcements/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: audiencePayload() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Preview failed')
        return
      }
      setPreview({ count: json.count, description: json.description })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          channels,
          audience: audiencePayload(),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Save failed')
        return
      }
      setTitle('')
      setBody('')
      setScheduledAt('')
      setPreview(null)
      setOpen(false)
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        New announcement
      </button>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Compose announcement</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label htmlFor="title" className={label}>Title</label>
          <input id="title" className={input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Heads up: scheduled maintenance" />
        </div>
        <div>
          <label htmlFor="body" className={label}>Body</label>
          <textarea id="body" className={input + ' min-h-[96px]'} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="Message shown to recipients…" />
        </div>

        <div>
          <span className={label}>Channels</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannels((prev) => (toggle(prev, c).length ? toggle(prev, c) : prev))}
                className={
                  'rounded-full px-2.5 py-1 text-xs font-medium ' +
                  (channels.includes(c) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                }
              >
                {channelLabel(c)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <span className={label}>Countries (blank = all)</span>
            <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {countries.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelCountries((prev) => toggle(prev, c))}
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (selCountries.includes(c) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Roles (blank = all)</span>
            <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {AUDIENCE_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoles((prev) => toggle(prev, r))}
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (roles.includes(r) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Account status</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {AUDIENCE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatuses((prev) => (toggle(prev, s).length ? toggle(prev, s) : prev))}
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (statuses.includes(s) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="schedule-blank-saves" className={label}>Schedule (optional — blank saves a draft)</label>
          <input id="schedule-blank-saves" type="datetime-local" className={input} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>

        {preview && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Estimated recipients: <span className="font-semibold text-foreground">{preview.count.toLocaleString()}</span> · {preview.description}
          </p>
        )}
        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={doPreview} className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            Preview audience
          </button>
          <button
            disabled={busy || pending || !title.trim() || !body.trim()}
            onClick={save}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Save {scheduledAt ? 'scheduled' : 'draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
