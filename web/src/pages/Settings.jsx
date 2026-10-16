import { useState } from 'react'
import { Alert, Button, Field, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDocumentTitle } from '../lib/hooks'

export default function Settings() {
  useDocumentTitle('Settings')
  const { user, setUser, signOut } = useAuth()
  const initial = user?.bank_details || {}
  const [form, setForm] = useState({
    account_title: initial.account_title || '',
    bank_name: initial.bank_name || '',
    account_number: initial.account_number || '',
  })
  const [errors, setErrors] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    const next = {}
    if (form.account_number && !/^[A-Za-z0-9 -]+$/.test(form.account_number)) {
      next.account_number = 'Use only letters, numbers, spaces and dashes.'
    }
    if (form.account_number && !form.account_title.trim()) next.account_title = 'Add the name on the account so friends can check it.'
    setErrors(next)
    setResult(null)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const d = await api('/me/bank-details', { method: 'PUT', body: form })
      setUser(d.user)
      setResult({ tone: 'paid', text: form.account_number ? 'Saved. Friends will see these when they choose bank transfer.' : 'Bank details removed.' })
    } catch (err) {
      setErrors(Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v[0]])))
      setResult({ tone: 'danger', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">Settings</h1>
        {user && (
          <p className="mt-2 text-muted">
            Signed in as {user.name} ({user.email})
          </p>
        )}
      </div>

      <section aria-labelledby="bank-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="bank-h" className="text-2xl font-semibold">
          Bank transfer details
        </h2>
        <p className="mt-2 text-[15px] text-muted">
          Shown only to people who join one of your open bills, so they can send you their share. Stored encrypted. Leave the
          account number empty to turn bank transfer off.
        </p>
        <form onSubmit={save} noValidate className="mt-5 space-y-4">
          <Field label="Account title" error={errors.account_title}>
            {(p) => <input {...p} className={inputClass} maxLength={80} value={form.account_title} onChange={(e) => setForm({ ...form, account_title: e.target.value })} />}
          </Field>
          <Field label="Bank" hint="For example Meezan Bank, HBL, JazzCash, Easypaisa.">
            {(p) => <input {...p} className={inputClass} maxLength={80} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />}
          </Field>
          <Field label="IBAN or account number" error={errors.account_number}>
            {(p) => (
              <input
                {...p}
                className={`${inputClass} num uppercase`}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              />
            )}
          </Field>
          {result && <Alert tone={result.tone}>{result.text}</Alert>}
          <Button type="submit" busy={busy}>
            Save bank details
          </Button>
        </form>
      </section>

      <DeleteAccount onDeleted={signOut} />
    </div>
  )
}

function DeleteAccount({ onDeleted }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!password) {
      setError('Enter your password to confirm.')
      return
    }
    if (!window.confirm('Delete your account, all your bills and receipt photos? This can’t be undone.')) return
    setBusy(true)
    setError('')
    try {
      await api('/me', { method: 'DELETE', body: { password } })
      onDeleted()
    } catch (err) {
      setError(err.errors?.password ? 'That password isn’t right.' : err.message)
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="delete-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="delete-h" className="text-2xl font-semibold">
        Delete account
      </h2>
      <p className="mt-2 text-[15px] text-muted">Removes your account, every bill, everyone’s ticks and all receipt photos.</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <Field label="Password" error={error}>
          {(p) => <input {...p} type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="danger" busy={busy}>
          Delete my account
        </Button>
      </form>
    </section>
  )
}
