import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert, Button, Field, inputClass, SlowNotice } from '../components/ui'
import { api } from '../lib/api'
import { useDocumentTitle, useSlow } from '../lib/hooks'
import { CURRENCIES } from '../lib/money'

const MAX_BYTES = 10 * 1024 * 1024

/** Shrinks big phone photos before upload; the server re-checks everything. */
async function shrink(file) {
  if (file.size < 1.5 * 1024 * 1024 || !('createImageBitmap' in window)) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export default function NewBill() {
  useDocumentTitle('New bill')
  const navigate = useNavigate()
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState('PKR')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const slow = useSlow(busy === 'upload', 6000)

  function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    if (!['image/jpeg', 'image/png'].includes(f.type)) {
      setError('Use a JPEG or PNG photo. On iPhone, the camera button below takes one in the right format.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError('That photo is over 10 MB. Try a smaller one.')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function create(withReceipt) {
    setError('')
    setBusy(withReceipt ? 'upload' : 'manual')
    try {
      const body = new FormData()
      if (title.trim()) body.append('title', title.trim())
      body.append('currency', currency)
      if (withReceipt && file) body.append('receipt', await shrink(file))
      const d = await api('/bills', { method: 'POST', body })
      navigate(`/bills/${d.bill.id}/edit`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold sm:text-4xl">New bill</h1>
      <p className="mt-2 text-muted">Photograph the receipt and we’ll read the items for you. You can fix anything before sharing.</p>

      <div className="mt-8 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Field label="Name this bill" hint="Optional. For example “Friday at Kolachi”.">
            {(p) => (
              <input {...p} className={inputClass} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
          <Field label="Currency">
            {(p) => (
              <select {...p} className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className="rounded-2xl border border-dashed border-line bg-surface p-5">
          {preview ? (
            <div className="flex items-center gap-4">
              <img src={preview} alt="Selected receipt" className="h-28 w-20 rounded-lg border border-line object-cover" />
              <div className="min-w-0">
                <p className="font-semibold">Receipt ready</p>
                <p className="truncate text-sm text-muted">{file.name}</p>
                <button className="mt-2 text-sm font-semibold text-accent-text" onClick={() => galleryRef.current?.click()}>
                  Choose a different photo
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-semibold">Add the receipt</p>
              <p className="mt-1 text-sm text-muted">A flat, well-lit photo with the whole receipt in frame reads best.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button onClick={() => cameraRef.current?.click()}>
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  Take photo
                </Button>
                <Button variant="secondary" onClick={() => galleryRef.current?.click()}>
                  Upload image
                </Button>
              </div>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="sm:flex-1" disabled={!file || busy === 'manual'} busy={busy === 'upload'} onClick={() => create(true)}>
            {busy === 'upload' ? 'Uploading…' : 'Read receipt'}
          </Button>
          <Button size="lg" variant="secondary" disabled={busy === 'upload'} busy={busy === 'manual'} onClick={() => create(false)}>
            Type items instead
          </Button>
        </div>
        <SlowNotice show={slow} />
      </div>
    </div>
  )
}
