import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Alert, Button, Field, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDocumentTitle } from '../lib/hooks'

function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/bills'
}

function AuthCard({ title, intro, children }) {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <div className="rise rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {intro && <p className="mt-2 text-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}

export function Login() {
  useDocumentTitle('Log in')
  const [params] = useSearchParams()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!form.email.trim()) next.email = 'Enter your email.'
    if (!form.password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const d = await api('/auth/login', { method: 'POST', body: form, auth: false })
      signIn(d.token, d.user)
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      const fields = Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v[0]]))
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Welcome back" intro="Log in to see your bills and who has paid.">
      {params.get('expired') && (
        <div className="mb-5">
          <Alert tone="pending" title="Your session expired">
            Log in again to carry on.
          </Alert>
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Email" error={errors.email}>
          {(p) => (
            <input
              {...p}
              type="email"
              autoComplete="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          )}
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-muted">
        New here?{' '}
        <Link to="/register" className="font-semibold text-accent-text">
          Create an account
        </Link>
      </p>
    </AuthCard>
  )
}

export function Register() {
  useDocumentTitle('Create an account')
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', accept_terms: false })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Enter your name. Friends see it on the bill.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.'
    if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (!form.accept_terms) next.accept_terms = 'Please accept the terms and privacy policy to continue.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const d = await api('/auth/register', { method: 'POST', body: form, auth: false })
      signIn(d.token, d.user)
      navigate('/bills/new', { replace: true })
    } catch (err) {
      const fields = Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v[0]]))
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Start splitting" intro="Only the person who paid the bill needs an account. Friends just use the link.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Your name" error={errors.name} hint="Shown to friends on the bill.">
          {(p) => (
            <input
              {...p}
              autoComplete="name"
              maxLength={60}
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => (
            <input
              {...p}
              type="email"
              autoComplete="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          )}
        </Field>
        <div>
          <label className="flex items-start gap-3 text-[15px]">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
              checked={form.accept_terms}
              aria-invalid={errors.accept_terms ? true : undefined}
              aria-describedby={errors.accept_terms ? 'terms-err' : undefined}
              onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })}
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" target="_blank" className="font-semibold text-accent-text">
                terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="font-semibold text-accent-text">
                privacy policy
              </Link>
              .
            </span>
          </label>
          {errors.accept_terms && (
            <p id="terms-err" className="mt-1.5 text-sm font-medium text-danger">
              {errors.accept_terms}
            </p>
          )}
        </div>
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-accent-text">
          Log in
        </Link>
      </p>
    </AuthCard>
  )
}
