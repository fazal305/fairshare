const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api'
const TOKEN_KEY = 'fairshare.token'

export class ApiError extends Error {
  constructor(message, { status = 0, errors = {}, offline = false } = {}) {
    super(message)
    this.status = status
    this.errors = errors
    this.offline = offline
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage blocked: the session just won't survive a reload */
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

const FRIENDLY = {
  404: 'We couldn’t find that.',
  409: 'That can’t be done right now.',
  413: 'That file is too large.',
  419: 'Your session expired. Please log in again.',
  429: 'Too many attempts. Wait a minute and try again.',
  500: 'Something went wrong on our side. Try again in a moment.',
  502: 'A payment or reading service didn’t respond. Try again.',
  503: 'FairShare is briefly unavailable. Try again in a minute.',
}

const GENERIC = new Set(['Not found.', 'Unauthenticated.', 'Too Many Attempts.', 'Server Error'])

/**
 * fetch wrapper. Never throws raw network errors: callers always get an
 * ApiError with a message that is safe to show.
 */
export async function api(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers }, signal }
  const token = auth ? getToken() : null
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(BASE + path, init)
  } catch (err) {
    if (err.name === 'AbortError') throw err
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ApiError(
      offline ? 'You’re offline. Check your connection and try again.' : 'Couldn’t reach FairShare. Check your connection and try again.',
      { offline: true },
    )
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty or non-JSON body */
  }

  if (res.ok) return data

  if (res.status === 401 && token) onUnauthorized()

  const errors = data?.errors || {}
  const firstFieldError = Object.values(errors)[0]?.[0]
  // The API's own 4xx messages are written for users; framework defaults aren't.
  const own = res.status < 500 && data?.message && !GENERIC.has(data.message) ? data.message : null
  const message =
    res.status === 422
      ? firstFieldError || 'Check the highlighted fields.'
      : own || FRIENDLY[res.status] || 'Something went wrong. Try again.'
  throw new ApiError(message, { status: res.status, errors })
}
