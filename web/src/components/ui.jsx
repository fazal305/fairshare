import { useId } from 'react'
import { Link } from 'react-router'
import { useOnline } from '../lib/hooks'
import { formatMoney } from '../lib/money'

const variants = {
  primary: 'bg-accent text-accent-ink hover:brightness-95 active:brightness-90',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunk',
  ghost: 'text-ink hover:bg-sunk',
  danger: 'bg-surface text-danger border border-line hover:bg-danger-soft',
}

export function Button({ variant = 'primary', size = 'md', busy = false, className = '', children, disabled, ...props }) {
  const sizes = { md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-13 px-6 text-base', sm: 'min-h-9 px-3 text-sm' }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', size = 'md', className = '', ...props }) {
  const sizes = { md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-13 px-6 text-base', sm: 'min-h-9 px-3 text-sm' }
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold no-underline transition ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}

export function Spinner({ className = 'size-4' }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Field({ label, error, hint, children, className = '' }) {
  const id = useId()
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'block w-full min-w-0 min-h-11 rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-muted/70 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40'

export function Money({ value, currency, className = '' }) {
  return <span className={`num whitespace-nowrap ${className}`}>{formatMoney(value, currency)}</span>
}

export function Alert({ tone = 'danger', title, children, action }) {
  const tones = {
    danger: 'bg-danger-soft border-danger/30 text-ink',
    info: 'bg-accent-soft border-accent/25 text-ink',
    pending: 'bg-pending-soft border-pending/30 text-ink',
    paid: 'bg-paid-soft border-paid/30 text-ink',
  }
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="text-[15px] text-ink/90">{children}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'That didn’t load' }) {
  return (
    <div className="rise mx-auto max-w-md py-10 text-center">
      <p className="text-4xl" aria-hidden="true">
        {error?.offline ? '📡' : '🧾'}
      </p>
      <h2 className="mt-3 text-2xl">{error?.offline ? 'No connection' : title}</h2>
      <p className="mt-2 text-muted">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function SlowNotice({ show }) {
  if (!show) return null
  return (
    <p role="status" className="mt-3 text-center text-sm text-muted">
      Still working. Your connection seems slow.
    </p>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-50 bg-ink px-4 py-2 text-center text-sm font-medium text-paper">
      You’re offline. Changes will fail until your connection is back.
    </div>
  )
}

export function StatusPill({ status }) {
  const map = {
    completed: ['Paid', 'bg-paid-soft text-paid'],
    awaiting_confirmation: ['Check transfer', 'bg-pending-soft text-pending'],
    pending: ['Pending', 'bg-sunk text-muted'],
    draft: ['Draft', 'bg-sunk text-muted'],
    open: ['Open', 'bg-accent-soft text-accent-text'],
    settled: ['Closed', 'bg-paid-soft text-paid'],
  }
  const [label, cls] = map[status] || [status, 'bg-sunk text-muted']
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--accent)" />
        <path d="M18 12h28v40l-4.7-3.5L36.7 52 32 48.5 27.3 52l-4.6-3.5L18 52z" fill="var(--paper)" />
        <path d="M24 22h16M24 29h16M24 36h9" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      FairShare
    </span>
  )
}
