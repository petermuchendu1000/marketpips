'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'

type DocType = 'national_id' | 'passport' | 'drivers_license'

export default function KYCPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [docType, setDocType] = useState<DocType>('national_id')
  const [docNumber, setDocNumber] = useState('')
  const [countryOfIssue, setCountryOfIssue] = useState('KE')
  const [expiryDate, setExpiryDate] = useState('')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingStatus, setExistingStatus] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    supabase
      .from('kyc_documents')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setExistingStatus(data.status)
      })
  }, [user])

  const uploadFile = async (file: File, path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('kyc-documents')
      .upload(path, file, { upsert: true })
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('kyc-documents').getPublicUrl(data.path)
    return publicUrl
  }

  const handleSubmit = async () => {
    if (!user) return
    if (!frontFile) return setError('Please upload the front of your document.')
    if (!selfieFile) return setError('Please upload a selfie photo.')
    setError('')
    setSubmitting(true)

    const ts = Date.now()
    const [frontUrl, backUrl, selfieUrl] = await Promise.all([
      uploadFile(frontFile, `${user.id}/${ts}-front.${frontFile.name.split('.').pop()}`),
      backFile ? uploadFile(backFile, `${user.id}/${ts}-back.${backFile.name.split('.').pop()}`) : Promise.resolve(null),
      uploadFile(selfieFile, `${user.id}/${ts}-selfie.${selfieFile.name.split('.').pop()}`),
    ])

    if (!frontUrl || !selfieUrl) {
      setError('File upload failed. Please try again.')
      setSubmitting(false)
      return
    }

    const { error: dbErr } = await supabase.from('kyc_documents').insert({
      user_id: user.id,
      document_type: docType,
      document_number: docNumber || null,
      country_of_issue: countryOfIssue,
      expiry_date: expiryDate || null,
      front_image_url: frontUrl,
      back_image_url: backUrl,
      selfie_image_url: selfieUrl,
      status: 'pending',
    })

    if (dbErr) {
      setError(dbErr.message)
      setSubmitting(false)
      return
    }

    await supabase.from('profiles').update({ kyc_status: 'pending' }).eq('id', user.id)
    setSubmitting(false)
    setSubmitted(true)
    setExistingStatus('pending')
  }

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="loading loading-spinner loading-lg" />
    </div>
  )

  if (existingStatus === 'verified') return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <div className="text-6xl mb-4">✅</div>
      <h1 className="text-2xl font-bold mb-2">Identity Verified</h1>
      <p className="text-base-content/60">Your identity has been verified. You can now use all platform features.</p>
    </div>
  )

  if (existingStatus === 'pending' || submitted) return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <div className="text-6xl mb-4">⏳</div>
      <h1 className="text-2xl font-bold mb-2">Under Review</h1>
      <p className="text-base-content/60">Your documents are being reviewed. This usually takes 1–2 business days.</p>
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-2">🪪 Identity Verification (KYC)</h1>
      <p className="text-sm text-base-content/60 mb-6">
        Verify your identity to unlock higher deposit/withdrawal limits and full platform access.
      </p>

      <div className="steps steps-horizontal w-full mb-8 text-xs">
        <div className="step step-primary">Select Document</div>
        <div className="step step-primary">Upload Photos</div>
        <div className="step">Review</div>
      </div>

      <div className="space-y-5">
        <div className="form-control">
          <span className="label"><span className="label-text font-medium">Document Type</span></span>
          <div className="flex gap-2 flex-wrap">
            {(['national_id', 'passport', 'drivers_license'] as DocType[]).map((dt) => (
              <button
                key={dt}
                className={`btn btn-sm ${docType === dt ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDocType(dt)}
              >
                {dt === 'national_id' ? '🪪 National ID' : dt === 'passport' ? '📕 Passport' : '🚗 Driving Licence'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor="document-number" className="label"><span className="label-text">Document Number</span></label>
            <input id="document-number"
              type="text"
              className="input input-bordered input-sm"
              placeholder="e.g. 12345678"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
            />
          </div>
          <div className="form-control">
            <label htmlFor="country-of-issue" className="label"><span className="label-text">Country of Issue</span></label>
            <select id="country-of-issue"
              className="select select-bordered select-sm"
              value={countryOfIssue}
              onChange={(e) => setCountryOfIssue(e.target.value)}
            >
              <option value="KE">🇰🇪 Kenya</option>
              <option value="TZ">🇹🇿 Tanzania</option>
              <option value="UG">🇺🇬 Uganda</option>
              <option value="RW">🇷🇼 Rwanda</option>
              <option value="ZM">🇿🇲 Zambia</option>
              <option value="ET">🇪🇹 Ethiopia</option>
              <option value="BI">🇧🇮 Burundi</option>
            </select>
          </div>
        </div>

        <div className="form-control">
          <label htmlFor="expiry-date" className="label"><span className="label-text">Expiry Date (optional)</span></label>
          <input id="expiry-date"
            type="date"
            className="input input-bordered input-sm"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>

        <FileUpload label="📄 Front of Document *" onFile={setFrontFile} />
        {docType !== 'passport' && (
          <FileUpload label="📄 Back of Document" onFile={setBackFile} />
        )}
        <FileUpload label="🤳 Selfie Photo *" onFile={setSelfieFile} hint="Hold your document next to your face" />

        {error && <p className="text-error text-sm">{error}</p>}

        <button
          className={`btn btn-primary w-full ${submitting ? 'loading' : ''}`}
          onClick={handleSubmit}
          disabled={submitting}
        >
          Submit for Verification
        </button>

        <p className="text-xs text-base-content/40 text-center">
          Your documents are encrypted and stored securely. We only use them for identity verification.
        </p>
      </div>
    </div>
  )
}

function FileUpload({ label, hint, onFile }: { label: string; hint?: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  return (
    <div className="form-control">
      <span className="label">
        <span className="label-text font-medium">{label}</span>
        {hint && <span className="label-text-alt text-base-content/50">{hint}</span>}
      </span>
      <div
        className="border-2 border-dashed border-base-300 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary transition-colors"
        onClick={() => ref.current?.click()}
      >
        {name ? (
          <p className="text-sm text-success">✓ {name}</p>
        ) : (
          <>
            <p className="text-2xl">📁</p>
            <p className="text-sm text-base-content/60">Click to upload or drag & drop</p>
            <p className="text-xs text-base-content/40">JPG, PNG, PDF (max 5MB)</p>
          </>
        )}
        <input
          ref={ref}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { onFile(f); setName(f.name) }
          }}
        />
      </div>
    </div>
  )
}
