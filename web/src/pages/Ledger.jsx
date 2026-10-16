import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { timeAgo } from '../components/Layout'
import QrCode from '../components/QrCode'
import { Alert, Button, ButtonLink, ErrorState, Money, SlowNotice, StatusPill } from '../components/ui'
import { api } from '../lib/api'
import { useDocumentTitle, useInterval, useSlow } from '../lib/hooks'

export default function Ledger() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [error, setError] = useState(null)
  const [stale, setStale] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(null)
  useDocumentTitle(bill?.title)
  const slow = useSlow(!bill && !error)

  const load = useCallback(() => {
    api(`/bills/${id}`)
      .then((d) => {
        setBill(d.bill)
        setError(null)
        setStale(false)
      })
      .catch((err) => {
        setError(err)
        setStale(true)
      })
  }, [id])

  useEffect(load, [load])
  // FR-4.2: live ledger by polling while the bill is open.
  useInterval(load, 4000, bill?.status === 'open')

  useEffect(() => {
    if (bill?.status === 'draft') navigate(`/bills/${id}/edit`, { replace: true })
  }, [bill?.status, id, navigate])

  async function act(key, path, options = {}) {
    if (options.confirm && !window.confirm(options.confirm)) return
    setBusy(key)
    setActionError('')
    try {
      const d = await api(path, { method: options.method || 'POST', body: options.body })
      if (options.after) options.after(d)
      else setBill(d.bill)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (error && !bill) return <ErrorState error={error} onRetry={load} title="This bill didn’t load" />
  if (!bill) {
    return (
      <div aria-busy="true" aria-label="Loading bill" className="space-y-4">
        <div className="skeleton h-9 w-1/2" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
        <SlowNotice show={slow} />
      </div>
    )
  }

  const shareUrl = `${window.location.origin}/s/${bill.public_id}`
  const itemName = Object.fromEntries(bill.items.map((i) => [i.id, i.name]))
  const people = Object.fromEntries(bill.participants.map((p) => [p.id, p.nickname]))
  const awaiting = bill.participants.filter((p) => p.payment_status === 'awaiting_confirmation')

  return (
    <>
      <Link to="/bills" className="text-sm font-semibold text-muted no-underline hover:text-ink">
        ← All bills
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 text-3xl font-semibold sm:text-4xl">{bill.title}</h1>
            <StatusPill status={bill.status} />
          </div>
          <p className="mt-1 text-muted">
            Total <Money value={bill.summary.grand_total} currency={bill.currency} className="font-semibold text-ink" /> ·{' '}
            {bill.items.length} items
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bill.status !== 'settled' && (
            <ButtonLink to={`/bills/${id}/edit`} variant="secondary" size="sm">
              Edit items
            </ButtonLink>
          )}
          {bill.status === 'open' ? (
            <Button variant="secondary" size="sm" busy={busy === 'settle'} onClick={() => act('settle', `/bills/${id}/settle`, { confirm: 'Close this bill? Friends will no longer be able to tick items or pay through the link.' })}>
              Close bill
            </Button>
          ) : (
            <Button variant="secondary" size="sm" busy={busy === 'reopen'} onClick={() => act('reopen', `/bills/${id}/reopen`)}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {stale && <Alert tone="pending">Live updates paused: {error?.message} We’ll keep trying.</Alert>}
        {actionError && <Alert>{actionError}</Alert>}
        {awaiting.length > 0 && (
          <Alert tone="pending" title={`${awaiting.length} bank transfer${awaiting.length > 1 ? 's' : ''} to check`}>
            Confirm once you see the money in your account.
          </Alert>
        )}
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Summary">
        <Stat label="Paid" tone="paid" value={bill.ledger.paid_total} currency={bill.currency} sub={`${bill.ledger.paid_count} ${bill.ledger.paid_count === 1 ? 'person' : 'people'}`} />
        <Stat label="Still to pay" tone="pending" value={bill.ledger.pending_total} currency={bill.currency} sub={`${bill.ledger.pending_count} ${bill.ledger.pending_count === 1 ? 'person' : 'people'}`} />
        <Stat
          label="Nobody’s claimed"
          value={bill.ledger.unclaimed_total}
          currency={bill.currency}
          sub={bill.ledger.unclaimed_items.length ? bill.ledger.unclaimed_items.map((i) => itemName[i]).join(', ') : 'Every item is claimed'}
        />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="people-h">
          <h2 id="people-h" className="text-2xl font-semibold">
            Who owes what
          </h2>
          {bill.participants.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="font-semibold">Nobody has joined yet</p>
              <p className="mx-auto mt-1 max-w-sm text-muted">Share the link or let friends scan the QR code. They’ll show up here as they join.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {bill.participants.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                        {p.nickname} <StatusPill status={p.payment_status} />
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {p.items.length ? p.items.map((i) => itemName[i]).join(', ') : 'Hasn’t ticked anything yet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={p.total} currency={bill.currency} className="text-lg font-semibold" />
                      {p.adjustment !== 0 && (
                        <p className="num text-xs text-muted">
                          incl. <Money value={p.adjustment} currency={bill.currency} /> extras
                        </p>
                      )}
                    </div>
                  </div>
                  <PaymentLine p={p} currency={bill.currency} />
                  {bill.status === 'open' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.payment_status === 'awaiting_confirmation' && (
                        <Button size="sm" busy={busy === `paid-${p.id}`} onClick={() => act(`paid-${p.id}`, `/bills/${id}/participants/${p.id}/mark-paid`, { body: { method: 'bank' } })}>
                          Confirm transfer received
                        </Button>
                      )}
                      {p.payment_status === 'pending' && p.total > 0 && (
                        <Button size="sm" variant="secondary" busy={busy === `cash-${p.id}`} onClick={() => act(`cash-${p.id}`, `/bills/${id}/participants/${p.id}/mark-paid`, { body: { method: 'cash' } })}>
                          Mark paid in cash
                        </Button>
                      )}
                      {p.payment_status !== 'pending' && p.payment_method !== 'card' && (
                        <Button size="sm" variant="ghost" busy={busy === `undo-${p.id}`} onClick={() => act(`undo-${p.id}`, `/bills/${id}/participants/${p.id}/mark-unpaid`, { confirm: `Mark ${p.nickname} as not paid?` })}>
                          Undo
                        </Button>
                      )}
                      {p.payment_status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          busy={busy === `rm-${p.id}`}
                          onClick={() => act(`rm-${p.id}`, `/bills/${id}/participants/${p.id}`, { method: 'DELETE', confirm: `Remove ${p.nickname} from this bill? Their ticks are cleared.` })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-10 text-2xl font-semibold">Items</h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {bill.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.name}</p>
                  <p className={`text-sm ${item.claimed_by.length ? 'text-muted' : 'font-medium text-pending'}`}>
                    {item.claimed_by.length ? item.claimed_by.map((pid) => people[pid]).join(', ') : 'Unclaimed'}
                  </p>
                </div>
                <Money value={item.price} currency={bill.currency} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-6">
          {bill.status === 'open' && <SharePanel url={shareUrl} title={bill.title} />}
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">Bill breakdown</h2>
            <dl className="mt-3 space-y-1.5 text-[15px]">
              {[
                ['Items', bill.summary.items_subtotal],
                ['Tax', bill.summary.tax],
                ['Service charge', bill.summary.service_charge],
                ['Tip', bill.summary.tip],
                ['Discount', -bill.summary.discount],
              ]
                .filter(([, v], i) => i === 0 || v !== 0)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-muted">{label}</dt>
                    <dd>
                      <Money value={value} currency={bill.currency} />
                    </dd>
                  </div>
                ))}
              <div className="flex justify-between border-t border-dashed border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money value={bill.summary.grand_total} currency={bill.currency} />
                </dd>
              </div>
            </dl>
          </section>
          <Button
            variant="danger"
            className="w-full"
            busy={busy === 'delete'}
            onClick={() => act('delete', `/bills/${id}`, { method: 'DELETE', confirm: 'Delete this bill and its receipt photo for good?', after: () => navigate('/bills', { replace: true }) })}
          >
            Delete bill
          </Button>
        </aside>
      </div>
    </>
  )
}

function Stat({ label, value, currency, sub, tone }) {
  const tones = { paid: 'text-paid', pending: 'text-pending' }
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tones[tone] || ''}`}>
        <Money value={value} currency={currency} />
      </p>
      <p className="mt-0.5 truncate text-sm text-muted" title={sub}>
        {sub}
      </p>
    </div>
  )
}

function PaymentLine({ p, currency }) {
  if (p.payment_status === 'pending') return null
  const how = { card: 'by card', bank: 'by bank transfer', cash: 'in cash' }[p.payment_method] || ''
  const diff = p.amount_paid != null ? p.total - p.amount_paid : 0
  return (
    <p className="mt-2 text-sm text-muted">
      {p.payment_status === 'completed' ? 'Paid' : 'Says they sent'} <Money value={p.amount_paid} currency={currency} className="font-semibold text-ink" /> {how}
      {p.transaction_reference && <> · ref {p.transaction_reference}</>}
      {p.paid_at && <> · {timeAgo(p.paid_at)}</>}
      {p.payment_status === 'completed' && diff !== 0 && (
        <span className="mt-1 block font-medium text-pending">
          Their share changed after paying: {diff > 0 ? 'owes' : 'is owed'} <Money value={Math.abs(diff)} currency={currency} />{' '}
          {diff > 0 ? 'more' : 'back'}.
        </span>
      )}
    </p>
  )
}

function SharePanel({ url, title }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }
  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="share-h">
      <h2 id="share-h" className="text-lg font-semibold">
        Share with the table
      </h2>
      <p className="mt-1 text-sm text-muted">Friends scan this or open the link, add their name and tick their items.</p>
      <div className="mt-4 flex justify-center">
        <QrCode value={url} label={`QR code for the link to ${title}`} size={180} />
      </div>
      <p className="mt-4 rounded-lg bg-sunk px-3 py-2 text-sm break-all">{url}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={copy}>
          <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
        </Button>
        {'share' in navigator && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigator.share({ title, text: `Tick what you had at ${title}`, url }).catch(() => {})}>
            Share…
          </Button>
        )}
      </div>
    </section>
  )
}
