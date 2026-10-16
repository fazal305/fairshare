import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useInterval } from '../lib/hooks'
import { formatMoney } from '../lib/money'
import { Logo, OfflineBanner } from './ui'

export function SiteHeader({ children }) {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link to="/" className="rounded-lg text-ink no-underline">
          <Logo />
        </Link>
        {children}
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line/70">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
        <p>FairShare: a student portfolio project. Card payments run in test mode.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link className="text-muted underline-offset-4 hover:text-ink hover:underline" to="/privacy">
            Privacy
          </Link>
          <Link className="text-muted underline-offset-4 hover:text-ink hover:underline" to="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export function PublicLayout() {
  const { status } = useAuth()
  return (
    <>
      <OfflineBanner />
      <SiteHeader>
        <nav aria-label="Account" className="flex items-center gap-1">
          {status === 'authed' ? (
            <Link to="/bills" className="rounded-xl px-3 py-2 font-semibold text-ink no-underline hover:bg-sunk">
              My bills
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-3 py-2 font-semibold text-ink no-underline hover:bg-sunk">
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-xl bg-accent px-3.5 py-2 font-semibold text-accent-ink no-underline hover:brightness-95"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </SiteHeader>
      <Outlet />
      <SiteFooter />
    </>
  )
}

export function HostLayout() {
  const { user, signOut } = useAuth()
  const navClass = ({ isActive }) =>
    `rounded-xl px-3 py-2 text-[15px] font-semibold no-underline ${isActive ? 'bg-sunk text-ink' : 'text-muted hover:text-ink'}`

  return (
    <>
      <OfflineBanner />
      <SiteHeader>
        <nav aria-label="Host" className="flex min-w-0 items-center gap-1">
          <NavLink to="/bills" end className={navClass}>
            Bills
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <span className="sr-only sm:not-sr-only">Settings</span>
            <svg className="size-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </NavLink>
          <NotificationBell />
          <button
            onClick={signOut}
            className="rounded-xl px-3 py-2 text-[15px] font-semibold text-muted hover:text-ink"
            title={user ? `Signed in as ${user.email}` : undefined}
          >
            Log out
          </button>
        </nav>
      </SiteHeader>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  )
}

function NotificationBell() {
  const [data, setData] = useState({ unread: 0, notifications: [] })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const panelRef = useRef(null)
  const location = useLocation()

  const load = useCallback(() => {
    api('/notifications')
      .then((d) => {
        setData(d)
        setError(false)
      })
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])
  useInterval(load, 15000)
  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.key === 'Escape' || (e.type === 'pointerdown' && !panelRef.current?.contains(e.target))) setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && data.unread > 0) {
      setData((d) => ({ ...d, unread: 0 }))
      api('/notifications/read', { method: 'POST' }).catch(() => {})
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label={data.unread ? `Notifications, ${data.unread} new` : 'Notifications'}
        className="relative grid size-11 place-items-center rounded-xl text-muted hover:bg-sunk hover:text-ink"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="rise absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/10">
          <p className="px-3 pt-2 pb-1 text-sm font-semibold text-muted">Notifications</p>
          {error && <p className="px-3 py-3 text-sm text-danger">Couldn’t load notifications.</p>}
          {!error && data.notifications.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted">Nothing yet. You’ll see payments here as they come in.</p>
          )}
          <ul className="max-h-80 overflow-y-auto">
            {data.notifications.map((n) => (
              <li key={n.id}>
                <Link
                  to={`/bills/${n.bill_id}`}
                  className="block rounded-xl px-3 py-2.5 text-[15px] text-ink no-underline hover:bg-sunk"
                >
                  <span className="font-semibold">{n.nickname}</span>{' '}
                  {n.kind === 'card_paid' ? 'paid' : 'says they transferred'}{' '}
                  <span className="num font-semibold">{formatMoney(n.amount, n.currency)}</span>
                  <span className="block text-sm text-muted">
                    {n.bill_title} · {timeAgo(n.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}
