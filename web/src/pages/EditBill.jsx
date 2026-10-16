import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, ErrorState, Field, inputClass, Money, SlowNotice } from '../components/ui'
import { api, getToken } from '../lib/api'
import { useDocumentTitle, useInterval, useSlow } from '../lib/hooks'
import { CURRENCIES, parseMoney, toInput } from '../lib/money'

let tempId = 0
const rowFromItem = (item) => ({ key: `i${item.id}`, id: item.id, name: item.name, price: toInput(item.price) })

function formFromBill(bill) {
  return {
    title: bill.title,
    currency: bill.currency,
    tax: toInput(bill.tax),
    service_charge: toInput(bill.service_charge),
    tip: toInput(bill.tip),
    discount: toInput(bill.discount),
    items: bill.items.map(rowFromItem),
  }
}

const CHARGES = [
  ['tax', 'Tax', 'GST, VAT or sales tax'],
  ['service_charge', 'Service charge', 'Fees added by the restaurant'],
  ['tip', 'Tip', 'Optional, split like tax'],
  ['discount', 'Discount', 'Taken off everyone’s share'],
]

export default function EditBill() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [form, setForm] = useState(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const [loadError, setLoadError] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(null)
  const [stopWaiting, setStopWaiting] = useState(false)
  const firstNewRef = useRef(null)
  useDocumentTitle(bill ? `Review ${bill.title}` : 'Review bill')

  const reading = bill?.ocr_status === 'processing' && !stopWaiting
  const slowRead = useSlow(reading, 8000)
  const slowLoad = useSlow(!bill && !loadError)

  const load = useCallback(() => {
    return api(`/bills/${id}`)
      .then((d) => {
        setBill(d.bill)
        setLoadError(null)
        setForm((f) => (f && dirtyRef.current ? f : formFromBill(d.bill)))
      })
      .catch((err) => setLoadError(err))
  }, [id])

  useEffect(() => {
    load()
  }, [load])
  useInterval(load, 2000, reading)

  useEffect(() => {
    dirtyRef.current = dirty
    if (!dirty) return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const totals = useMemo(() => {
    if (!form) return null
    const subtotal = form.items.reduce((s, r) => s + (parseMoney(r.price) || 0), 0)
    const extra = ['tax', 'service_charge', 'tip'].reduce((s, k) => s + (parseMoney(form[k]) || 0), 0)
    const discount = parseMoney(form.discount) || 0
    return { subtotal, extra, discount, total: subtotal + extra - discount }
  }, [form])

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
    setMessage(null)
  }

  function updateRow(key, patch) {
    update({ items: form.items.map((r) => (r.key === key ? { ...r, ...patch } : r)) })
  }

  function addRow() {
    update({ items: [...form.items, { key: `n${++tempId}`, id: null, name: '', price: '' }] })
    requestAnimationFrame(() => firstNewRef.current?.focus())
  }

  function validate() {
    const next = {}
    form.items.forEach((r, i) => {
      if (!r.name.trim()) next[`items.${i}.name`] = 'Give this item a name.'
      const p = parseMoney(r.price)
      if (p === null) next[`items.${i}.price`] = 'Enter an amount like 450 or 450.50.'
      else if (p <= 0) next[`items.${i}.price`] = 'Enter a price above zero.'
    })
    for (const [k] of CHARGES) if (parseMoney(form[k]) === null) next[k] = 'Enter an amount like 120 or 120.50.'
    if (!form.title.trim()) next.title = 'Give the bill a name.'
    if (!next.discount && totals.total < 0) next.discount = 'The discount can’t be more than the whole bill.'
    return next
  }

  async function save({ publish = false } = {}) {
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) {
      setMessage({ tone: 'danger', text: 'Some fields need fixing. They’re highlighted below.' })
      return
    }
    if (publish && form.items.length === 0) {
      setMessage({ tone: 'danger', text: 'Add at least one item before sharing the bill.' })
      return
    }
    setBusy(publish ? 'publish' : 'save')
    setMessage(null)
    try {
      const body = {
        title: form.title.trim(),
        currency: form.currency,
        items: form.items.map((r) => ({ id: r.id, name: r.name.trim(), price: parseMoney(r.price) })),
        ...Object.fromEntries(CHARGES.map(([k]) => [k, parseMoney(form[k])])),
      }
      let d = await api(`/bills/${id}`, { method: 'PUT', body })
      if (publish && d.bill.status === 'draft') d = await api(`/bills/${id}/publish`, { method: 'POST' })
      setBill(d.bill)
      setForm(formFromBill(d.bill))
      setDirty(false)
      if (publish || d.bill.status !== 'draft') navigate(`/bills/${id}`)
      else setMessage({ tone: 'paid', text: 'Saved.' })
    } catch (err) {
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v[0]])))
      setMessage({ tone: 'danger', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  async function rescan() {
    setBusy('rescan')
    try {
      const d = await api(`/bills/${id}/rescan`, { method: 'POST' })
      setBill(d.bill)
      setForm(formFromBill(d.bill))
      setStopWaiting(false)
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  if (loadError && !bill) return <ErrorState error={loadError} onRetry={load} title="This bill didn’t load" />
  if (!bill || !form) {
    return (
      <div aria-busy="true" aria-label="Loading bill" className="mx-auto max-w-2xl space-y-4">
        <div className="skeleton h-9 w-1/2" />
        <div className="skeleton h-40" />
        <SlowNotice show={slowLoad} />
      </div>
    )
  }

  const settled = bill.status === 'settled'
  const mismatch =
    bill.printed_subtotal != null && totals.subtotal > 0 && Math.abs(bill.printed_subtotal - totals.subtotal) >= 1

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={bill.status === 'draft' ? '/bills' : `/bills/${id}`} className="text-sm font-semibold text-muted no-underline hover:text-ink">
        ← {bill.status === 'draft' ? 'All bills' : 'Back to the bill'}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Check the items</h1>
      <p className="mt-2 text-muted">
        Make sure every line matches the receipt. Friends will tick these to build their share.
      </p>

      {bill.has_receipt && <ReceiptThumb billId={id} />}

      <div className="mt-6 space-y-4" aria-live="polite">
        {reading && (
          <Alert tone="info" title="Reading your receipt…">
            This usually takes a few seconds.
            {slowRead && (
              <span className="mt-2 block">
                It’s taking longer than usual.{' '}
                <button className="font-semibold text-accent-text underline" onClick={() => setStopWaiting(true)}>
                  Type the items myself
                </button>
              </span>
            )}
          </Alert>
        )}
        {bill.ocr_status === 'failed' && bill.ocr_error && form.items.length === 0 && (
          <Alert
            tone="pending"
            title="We couldn’t read the receipt"
            action={
              bill.has_receipt && bill.status === 'draft' ? (
                <Button size="sm" variant="secondary" busy={busy === 'rescan'} onClick={rescan}>
                  Try reading again
                </Button>
              ) : null
            }
          >
            {bill.ocr_error}
          </Alert>
        )}
        {bill.ocr_status === 'done' && !dirty && bill.status === 'draft' && (
          <Alert tone="info">Read from your photo. Double-check prices, because receipts are easy to misread.</Alert>
        )}
        {settled && <Alert tone="pending">This bill is closed. Reopen it from the bill page to make changes.</Alert>}
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="mt-6 space-y-8"
      >
        <fieldset disabled={settled || reading} className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field label="Bill name" error={errors.title}>
              {(p) => <input {...p} className={inputClass} maxLength={120} value={form.title} onChange={(e) => update({ title: e.target.value })} />}
            </Field>
            <Field label="Currency" error={errors.currency}>
              {(p) => (
                <select {...p} className={inputClass} value={form.currency} onChange={(e) => update({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <section aria-labelledby="items-h">
            <div className="flex items-baseline justify-between">
              <h2 id="items-h" className="text-xl font-semibold">
                Items <span className="font-sans text-base font-normal text-muted">({form.items.length})</span>
              </h2>
              <span className="text-sm text-muted">Line total, not unit price</span>
            </div>

            {reading ? (
              <ul className="mt-3 space-y-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="skeleton h-12" />
                ))}
              </ul>
            ) : form.items.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">
                No items yet. Add each line from the receipt.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {form.items.map((row, i) => (
                  <li key={row.key} className="rounded-xl border border-line bg-surface p-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.75rem] items-start gap-2">
                      <div>
                        <label htmlFor={`name-${row.key}`} className="sr-only">
                          Item {i + 1} name
                        </label>
                        <input
                          id={`name-${row.key}`}
                          ref={i === form.items.length - 1 && !row.id ? firstNewRef : undefined}
                          className={inputClass}
                          placeholder="Item name"
                          maxLength={120}
                          value={row.name}
                          aria-invalid={errors[`items.${i}.name`] ? true : undefined}
                          aria-describedby={errors[`items.${i}.name`] ? `err-name-${row.key}` : undefined}
                          onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`price-${row.key}`} className="sr-only">
                          Item {i + 1} price
                        </label>
                        <input
                          id={`price-${row.key}`}
                          className={`${inputClass} num text-right`}
                          inputMode="decimal"
                          placeholder="0"
                          value={row.price}
                          aria-invalid={errors[`items.${i}.price`] ? true : undefined}
                          aria-describedby={errors[`items.${i}.price`] ? `err-price-${row.key}` : undefined}
                          onChange={(e) => updateRow(row.key, { price: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        className="grid size-11 place-items-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger"
                        aria-label={`Remove ${row.name || `item ${i + 1}`}`}
                        onClick={() => update({ items: form.items.filter((r) => r.key !== row.key) })}
                      >
                        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>
                    {(errors[`items.${i}.name`] || errors[`items.${i}.price`]) && (
                      <p className="mt-1.5 px-1 text-sm font-medium text-danger">
                        <span id={`err-name-${row.key}`}>{errors[`items.${i}.name`]}</span>{' '}
                        <span id={`err-price-${row.key}`}>{errors[`items.${i}.price`]}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!reading && (
              <Button type="button" variant="secondary" className="mt-3 w-full" onClick={addRow}>
                + Add item
              </Button>
            )}
          </section>

          <section aria-labelledby="charges-h">
            <h2 id="charges-h" className="text-xl font-semibold">
              Tax and charges
            </h2>
            <p className="mt-1 text-sm text-muted">Split in proportion to what each person ordered.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {CHARGES.map(([k, label, hint]) => (
                <Field key={k} label={label} hint={hint} error={errors[k]}>
                  {(p) => (
                    <input
                      {...p}
                      className={`${inputClass} num`}
                      inputMode="decimal"
                      placeholder="0"
                      value={form[k]}
                      onChange={(e) => update({ [k]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        </fieldset>

        <section className="receipt-edge rounded-t-2xl border border-b-0 border-line bg-surface px-5 pt-4">
          <dl className="space-y-1.5 text-[15px]">
            <Row label="Items" value={totals.subtotal} currency={form.currency} />
            <Row label="Tax, service and tip" value={totals.extra} currency={form.currency} />
            {totals.discount > 0 && <Row label="Discount" value={-totals.discount} currency={form.currency} />}
            <div className="flex justify-between border-t border-dashed border-line pt-2 text-lg font-semibold">
              <dt>Total</dt>
              <dd>
                <Money value={totals.total} currency={form.currency} />
              </dd>
            </div>
          </dl>
          {mismatch && (
            <p className="mt-3 text-sm text-pending">
              The receipt’s printed subtotal is <Money value={bill.printed_subtotal} currency={form.currency} />. Check for a
              missing or misread item.
            </p>
          )}
        </section>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {!settled && (
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            {bill.status === 'draft' ? (
              <>
                <Button type="button" size="lg" className="sm:flex-1" busy={busy === 'publish'} disabled={reading || !!busy} onClick={() => save({ publish: true })}>
                  Save and get share link
                </Button>
                <Button type="submit" size="lg" variant="secondary" busy={busy === 'save'} disabled={reading || !!busy}>
                  Save draft
                </Button>
              </>
            ) : (
              <Button type="submit" size="lg" className="sm:flex-1" busy={busy === 'save'} disabled={!!busy}>
                Save changes
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}

function Row({ label, value, currency }) {
  return (
    <div className="flex justify-between text-muted">
      <dt>{label}</dt>
      <dd>
        <Money value={value} currency={currency} className="text-ink" />
      </dd>
    </div>
  )
}

function ReceiptThumb({ billId }) {
  const [src, setSrc] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let url
    let cancelled = false
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
    fetch(`${base}/api/bills/${billId}/receipt`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          url = URL.createObjectURL(blob)
          setSrc(url)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [billId])

  if (!src) return null
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2 pr-4 text-left"
      >
        <img src={src} alt="" className="h-14 w-10 rounded-md object-cover" />
        <span className="text-[15px] font-semibold">{open ? 'Hide receipt photo' : 'Compare with the receipt photo'}</span>
      </button>
      {open && <img src={src} alt="Your receipt photo" className="mt-3 max-h-[70vh] w-full rounded-xl border border-line object-contain" />}
    </div>
  )
}
