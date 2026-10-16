import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { timeAgo } from '../components/Layout'
import { ButtonLink, ErrorState, SlowNotice, StatusPill } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDocumentTitle, useSlow } from '../lib/hooks'

export default function Dashboard() {
  useDocumentTitle('Your bills')
  const { user } = useAuth()
  const [bills, setBills] = useState(null)
  const [error, setError] = useState(null)
  const slow = useSlow(bills === null && !error)

  const load = useCallback(() => {
    setError(null)
    api('/bills')
      .then((d) => setBills(d.bills))
      .catch(setError)
  }, [])
  useEffect(load, [load])

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Your bills</h1>
          {user && <p className="mt-1 text-muted">Hi {user.name.split(' ')[0]}. Here’s everything you’ve split.</p>}
        </div>
        <ButtonLink to="/bills/new">New bill</ButtonLink>
      </div>

      {user && !user.bank_details && bills?.length > 0 && (
        <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-[15px]">
          Friends can’t pay you by bank transfer yet.{' '}
          <Link to="/settings" className="font-semibold text-accent-text">
            Add your account details
          </Link>
        </p>
      )}

      <div className="mt-8">
        {error ? (
          <ErrorState error={error} onRetry={load} title="Your bills didn’t load" />
        ) : bills === null ? (
          <div aria-busy="true" aria-label="Loading bills">
            <ul className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="skeleton h-5 w-2/3" />
                  <div className="skeleton mt-3 h-4 w-1/3" />
                </li>
              ))}
            </ul>
            <SlowNotice show={slow} />
          </div>
        ) : bills.length === 0 ? (
          <div className="rise rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <p className="text-4xl" aria-hidden="true">
              🧾
            </p>
            <h2 className="mt-3 text-2xl font-semibold">No bills yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-muted">
              Next time you pick up the tab, photograph the receipt and share the link before everyone leaves the table.
            </p>
            <ButtonLink to="/bills/new" className="mt-6">
              Split your first bill
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {bills.map((b) => (
              <li key={b.id}>
                <Link
                  to={b.status === 'draft' ? `/bills/${b.id}/edit` : `/bills/${b.id}`}
                  className="block rounded-2xl border border-line bg-surface p-5 text-ink no-underline transition hover:border-ink/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 text-xl font-semibold">{b.title}</h2>
                    <StatusPill status={b.status} />
                  </div>
                  <p className="mt-2 text-[15px] text-muted">
                    {b.status === 'draft'
                      ? b.ocr_status === 'processing'
                        ? 'Reading receipt…'
                        : 'Not shared yet'
                      : b.participants_count === 0
                        ? 'Nobody has joined yet'
                        : `${b.paid_count} of ${b.participants_count} paid`}{' '}
                    · {timeAgo(b.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
