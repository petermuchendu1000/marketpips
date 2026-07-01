'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function KycReviewActions({ docId }: { docId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function submit(status: 'verified' | 'rejected') {
    setErr(null)
    const res = await fetch(`/api/admin/kyc/${docId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rejection_reason: status === 'rejected' ? reason : undefined }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'Failed')
      return
    }
    start(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!rejecting ? (
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={() => submit('verified')}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={pending}
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (required)"
            className="w-64 rounded-lg border bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => setRejecting(false)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              Cancel
            </button>
            <button
              disabled={pending || reason.trim().length < 3}
              onClick={() => submit('rejected')}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm reject
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
