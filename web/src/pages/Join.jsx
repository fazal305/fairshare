import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import QrCode from '../components/QrCode'
import { Alert, Button, ErrorState, Field, inputClass, Logo, Money, OfflineBanner, SlowNotice } from '../components/ui'
import { api } from '../lib/api'
import { useDocumentTitle, useInterval, useSlow } from '../lib/hooks'
import { formatMoney } from '../lib/money'

const tokenKey = (publicId) => `fairshare.guest.${publicId}`

function readToken(publicId) {
  try {
    return localStorage.getItem(tokenKey(publicId))
  } catch {
    return null
  }
}

function writeToken(publicId, token) {
  try {
    if (token) localStorage.setItem(tokenKey(publicId), token)
    else localStorage.removeItem(tokenKey(publicId))
  } catch {
    /* private mode: the token lives in memory for this visit */
  }
}

export default function Join() {
  const { publicId } = useParams()
  const [params, setParams] = useSearchParams()
  const [token, setTokenState] = useState(() => readToken(publicId))
  const [bill, setBill] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null) // optimistic claim set while saving
  const [claimError, setClaimError] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [returnNotice] = useState(() => params.get('payment'))
  const saveTimer = useRef(null)
  const inflight = useRef(false)
  useDocumentTitle(bill ? bill.title : 'Shared bill')
  const slow = useSlow(!bill && !error)

  const headers = useMemo(() => (token ? { 'X-Participant-Token': token } : {}), [token])

  const load = useCallback(() => {
    if (inflight.current) return
    api(`/s/${publicId}`, { headers, auth: false })
      .then((d) => {
        setBill(d.bill)
        setError(null)
        // A stored token that no longer matches (host removed us): start over.
        if (token && !d.bill.me) {
          writeToken(publicId, null)
          setTokenState(null)
        }
      })
      .catch(setError)
  }, [publicId, headers, token])

  useEffect(load, [load])
  useInterval(load, 5000, !!bill && bill.status === 'open' && pending === null)

  useEffect(() => {
    if (returnNotice) setParams({}, { replace: true })
  }, [returnNotice, setParams])

  function joined(d) {
    writeToken(publicId, d.token)
    setTokenState(d.token)
    setBill(d.bill)
  }

  const mine = useMemo(() => {
    if (pending) return pending
    if (!bill?.me) return new Set()
    return new Set(bill.items.filter((i) => i.claimed_by.includes(bill.me.id)).map((i) => i.id))
  }, [bill, pending])

  function toggle(itemId) {
    const next = new Set(mine)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setPending(next)
    setClaimError('')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveClaims(next), 350)
  }

  async function saveClaims(set) {
    inflight.current = true
    try {
      const d = await api(`/s/${publicId}/claims`, { method: 'PUT', body: { item_ids: [...set] }, headers, auth: false })
      setBill(d.bill)
      setPending((p) => (p === set ? null : p))
    } catch (err) {
      setPending(null)
      setClaimError(err.message)
      if (err.status === 401) {
        writeToken(publicId, null)
        setTokenState(null)
      }
    } finally {
      inflight.current = false
    }
  }

  // Estimate while a save is in flight so the total moves as soon as a box is ticked.
  const preview = useMemo(() => {
    if (!bill?.me) return null
    if (!pending) return bill.me
    const sub = bill.items.reduce((s, item) => {
      const others = item.claimed_by.filter((id) => id !== bill.me.id).length
      return pending.has(item.id) ? s + item.price / (others + 1) : s
    }, 0)
    const ratio = bill.summary.items_subtotal ? bill.summary.adjustment / bill.summary.items_subtotal : 0
    return { ...bill.me, subtotal: Math.round(sub), adjustment: Math.round(sub * ratio), total: Math.round(sub * (1 + ratio)) }
  }, [bill, pending])

  return (
    <div className="min-h-dvh pb-36">
      <OfflineBanner />
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link to="/" className="rounded-lg text-ink no-underline">
            <Logo className="text-lg" />
          </Link>
          {bill?.me && <span className="truncate pl-3 text-sm text-muted">You’re {bill.me.nickname}</span>}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-xl px-4 py-6">
        {error && !bill ? (
          <ErrorState
            error={error}
            onRetry={error.status === 404 ? undefined : load}
            title={error.status === 404 ? 'Bill not found' : 'This bill didn’t load'}
          />
        ) : !bill ? (
          <div aria-busy="true" aria-label="Loading bill" className="space-y-3">
            <div className="skeleton h-8 w-2/3" />
            <div className="skeleton h-4 w-1/3" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-14" />
            ))}
            <SlowNotice show={slow} />
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted">{bill.host_name} paid for</p>
            <h1 className="mt-0.5 text-3xl font-semibold">{bill.title}</h1>
            <p className="mt-1 text-muted">
              Bill total <Money value={bill.summary.grand_total} currency={bill.currency} className="font-semibold text-ink" />
            </p>

            <div className="mt-4 space-y-3" aria-live="polite">
              {returnNotice === 'success' && bill.me?.payment_status !== 'completed' && (
                <Alert tone="info" title="Payment sent">
                  We’re confirming it with the card processor. This page updates by itself.
                </Alert>
              )}
              {returnNotice === 'cancelled' && <Alert tone="pending">Card payment cancelled. Nothing was charged.</Alert>}
              {bill.status === 'settled' && <Alert tone="pending">The host has closed this bill. Ticks and payments are switched off.</Alert>}
              {error && <Alert tone="pending">Couldn’t refresh: {error.message}</Alert>}
              {claimError && <Alert>{claimError}</Alert>}
            </div>

            {!bill.me && bill.status === 'open' && <JoinForm publicId={publicId} onJoined={joined} participants={bill.participants} />}

            {bill.me && <PaidBanner me={bill.me} currency={bill.currency} host={bill.host_name} />}

            <section className="mt-6" aria-labelledby="items-h">
              <h2 id="items-h" className="text-xl font-semibold">
                {bill.me ? 'Tick everything you had' : 'What’s on the bill'}
              </h2>
              {bill.me && <p className="mt-1 text-sm text-muted">Shared something? Tick it too. It’s split between everyone who ticks it.</p>}
              <ItemList bill={bill} mine={mine} onToggle={toggle} />
            </section>
          </>
        )}
      </main>

      {bill?.me && preview && (
        <TotalBar
          bill={bill}
          me={preview}
          saving={pending !== null}
          onPay={() => setPayOpen(true)}
        />
      )}
      {payOpen && bill?.me && (
        <PaySheet
          bill={bill}
          headers={headers}
          publicId={publicId}
          onClose={() => setPayOpen(false)}
          onUpdate={(b) => {
            setBill(b)
            setPayOpen(false)
          }}
        />
      )}
    </div>
  )
}

function JoinForm({ publicId, onJoined, participants }) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!nickname.trim()) {
      setError('Enter a name so the host knows who you are.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const d = await api(`/s/${publicId}/join`, { method: 'POST', body: { nickname: nickname.trim() }, auth: false })
      onJoined(d)
    } catch (err) {
      setError(err.errors?.nickname?.[0] || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rise mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-xl font-semibold">Who are you?</h2>
      <p className="mt-1 text-[15px] text-muted">
        No account needed. Your name is only shown to the host and others on this bill.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="Your name" error={error} className="flex-1">
          {(p) => (
            <input
              {...p}
              className={inputClass}
              autoComplete="given-name"
              maxLength={40}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" busy={busy} className="sm:mt-7">
          Join bill
        </Button>
      </div>
      {participants.length > 0 && (
        <p className="mt-3 text-sm text-muted">Already here: {participants.map((p) => p.nickname).join(', ')}</p>
      )}
    </form>
  )
}

function ItemList({ bill, mine, onToggle }) {
  const names = Object.fromEntries(bill.participants.map((p) => [p.id, p.nickname]))
  const me = bill.me
  const locked = !me || bill.status !== 'open' || me.payment_status !== 'pending'

  return (
    <ul className="mt-3 space-y-2">
      {bill.items.map((item) => {
        const checked = mine.has(item.id)
        const others = item.claimed_by.filter((id) => id !== me?.id).map((id) => names[id])
        const sharers = others.length + (checked ? 1 : 0)
        const label = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{item.name}</span>
              <span className="block text-sm text-muted">
                {others.length ? `${checked ? 'You, ' : ''}${others.join(', ')}` : checked ? 'Just you' : 'Nobody yet'}
                {checked && sharers > 1 && ` · your part ${formatMoney(Math.round(item.price / sharers), bill.currency)}`}
              </span>
            </span>
            <Money value={item.price} currency={bill.currency} className="pt-0.5 font-medium" />
          </>
        )
        if (locked) {
          return (
            <li key={item.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${checked ? 'border-accent/40 bg-accent-soft/50' : 'border-line bg-surface'}`}>
              {me && <CheckMark checked={checked} />}
              {label}
            </li>
          )
        }
        return (
          <li key={item.id}>
            <label
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)] ${checked ? 'border-accent/50 bg-accent-soft/60' : 'border-line bg-surface hover:border-ink/30'}`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(item.id)} />
              <CheckMark checked={checked} />
              {label}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function CheckMark({ checked }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition ${checked ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

function PaidBanner({ me, currency, host }) {
  if (me.payment_status === 'completed') {
    return (
      <div className="rise mt-6">
        <Alert tone="paid" title="You’re all paid up">
          {host} received <Money value={me.amount_paid} currency={currency} className="font-semibold" />
          {me.payment_method === 'card' ? ' by card' : me.payment_method === 'cash' ? ' in cash' : ' by bank transfer'}. Thanks!
        </Alert>
      </div>
    )
  }
  if (me.payment_status === 'awaiting_confirmation') {
    return (
      <div className="rise mt-6">
        <Alert tone="pending" title="Waiting for the host to confirm">
          You said you sent <Money value={me.amount_paid} currency={currency} className="font-semibold" />. {host} will mark it paid once
          it arrives.
        </Alert>
      </div>
    )
  }
  return null
}

function TotalBar({ bill, me, saving, onPay }) {
  const canPay = bill.status === 'open' && me.payment_status === 'pending'
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0" aria-live="polite">
          <p className="text-sm text-muted">
            Your share{saving && <span className="ml-1">· saving…</span>}
          </p>
          <p className="font-display text-2xl font-semibold">
            <Money value={me.total} currency={bill.currency} />
          </p>
          <p className="num truncate text-xs text-muted">
            {formatMoney(me.subtotal, bill.currency)} food + {formatMoney(me.adjustment, bill.currency)} extras
          </p>
        </div>
        {canPay && (
          <Button size="lg" onClick={onPay} disabled={me.total <= 0 || saving}>
            Pay
          </Button>
        )}
      </div>
    </div>
  )
}

function PaySheet({ bill, headers, publicId, onClose, onUpdate }) {
  const [method, setMethod] = useState(bill.payment_options.card ? null : 'bank')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const bank = bill.payment_options.bank
  const amount = formatMoney(bill.me.total, bill.currency)

  // No close() in cleanup: it fires the close event, which would immediately dismiss the sheet.
  useEffect(() => {
    const d = dialogRef.current
    if (d && !d.open) d.showModal()
  }, [])

  async function payCard() {
    setBusy('card')
    setError('')
    try {
      const d = await api(`/s/${publicId}/pay/card`, { method: 'POST', headers, auth: false })
      window.location.assign(d.url)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  async function reportBank() {
    setBusy('bank')
    setError('')
    try {
      const d = await api(`/s/${publicId}/pay/bank`, { method: 'POST', body: { reference }, headers, auth: false })
      onUpdate(d.bill)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const transferText = bank
    ? `Pay ${bill.host_name}\n${bank.account_title}\n${bank.bank_name}\n${bank.account_number}\nAmount: ${amount}\nFor: ${bill.title} (${bill.me.nickname})`
    : ''

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-labelledby="pay-h"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="pay-h" className="text-2xl font-semibold">
              Pay {bill.host_name}
            </h2>
            <p className="num mt-1 text-lg font-semibold">{amount}</p>
          </div>
          <button onClick={onClose} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-sunk" aria-label="Close">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {method === null && (
          <div className="mt-5 space-y-3">
            <Button size="lg" className="w-full" busy={busy === 'card'} onClick={payCard}>
              Pay by card
            </Button>
            <p className="text-center text-xs text-muted">Test mode: use card 4242 4242 4242 4242. No real money moves.</p>
            {bill.payment_options.bank_available && (
              <Button size="lg" variant="secondary" className="w-full" onClick={() => setMethod('bank')}>
                Bank transfer
              </Button>
            )}
            <p className="text-center text-sm text-muted">Paying in cash? Hand it over and the host will mark you paid.</p>
          </div>
        )}

        {method === 'bank' &&
          (bank ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-sunk p-4">
                <dl className="space-y-2 text-[15px]">
                  <Detail label="Account title" value={bank.account_title || bill.host_name} />
                  {bank.bank_name && <Detail label="Bank" value={bank.bank_name} />}
                  <Detail label="Account" value={bank.account_number} copy />
                  <Detail label="Amount" value={amount} copy={String(bill.me.total / 100)} />
                </dl>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <QrCode value={transferText} label="QR code with the transfer details" size={160} />
                <p className="max-w-xs text-xs text-muted">
                  Scan with another phone to copy the details. This isn’t a bank-app payment QR.
                </p>
              </div>
              <Field label="Transaction reference" hint="Optional. Helps the host match your transfer.">
                {(p) => <input {...p} className={inputClass} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />}
              </Field>
              <Button size="lg" className="w-full" busy={busy === 'bank'} onClick={reportBank}>
                I’ve sent {amount}
              </Button>
              {bill.payment_options.card && (
                <button className="w-full text-center text-sm font-semibold text-accent-text" onClick={() => setMethod(null)}>
                  Other ways to pay
                </button>
              )}
            </div>
          ) : (
            <p className="mt-5 text-muted">
              {bill.host_name} hasn’t added bank details. Pay them in cash or however you usually do, and they’ll mark you paid.
            </p>
          ))}
      </div>
    </dialog>
  )
}

function Detail({ label, value, copy }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right font-semibold">
        <span className="num break-words">{value}</span>
        {copy && (
          <button
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent-text hover:bg-surface"
            aria-label={`Copy ${label}`}
            onClick={() =>
              navigator.clipboard?.writeText(typeof copy === 'string' ? copy : value).then(() => {
                setDone(true)
                setTimeout(() => setDone(false), 1500)
              }, () => {})
            }
          >
            {done ? 'Copied' : 'Copy'}
          </button>
        )}
      </dd>
    </div>
  )
}
