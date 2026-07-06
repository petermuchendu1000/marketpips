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
    <div className="flex shrink-0 flex-col items-end gap-2">
      {!rejecting ? (
        <div className="flex gap-2">
          <button disabled={pending} onClick={() => submit('verified')} className="btn btn-yes btn-sm">
            Approve
          </button>
          <button disabled={pending} onClick={() => setRejecting(true)} className="btn btn-secondary btn-sm text-red-600 dark:text-red-400">
            Reject
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-2">
          <label htmlFor={`kyc-reason-${docId}`} className="sr-only">Rejection reason</label>
          <input
            id={`kyc-reason-${docId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (required)"
            className="admin-field w-64"
          />
          <div className="flex gap-2">
            <button onClick={() => setRejecting(false)} className="btn btn-secondary btn-sm">Cancel</button>
            <button disabled={pending || reason.trim().length < 3} onClick={() => submit('rejected')} className="btn btn-no btn-sm">
              Confirm reject
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
