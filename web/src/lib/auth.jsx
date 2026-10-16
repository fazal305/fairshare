import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, getToken, setToken, setUnauthorizedHandler } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(getToken() ? 'loading' : 'guest')
  const navigate = useNavigate()

  const signOutLocally = useCallback(() => {
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOutLocally()
      navigate('/login?expired=1', { replace: true })
    })
  }, [navigate, signOutLocally])

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    api('/me')
      .then((d) => {
        if (cancelled) return
        setUser(d.user)
        setStatus('authed')
      })
      .catch((err) => {
        if (cancelled) return
        // Offline at startup: keep the token and let the pages show their own errors.
        if (err.offline) setStatus('offline')
        else signOutLocally()
      })
    return () => {
      cancelled = true
    }
  }, [signOutLocally])

  const value = useMemo(
    () => ({
      user,
      status,
      setUser,
      signIn(token, nextUser) {
        setToken(token)
        setUser(nextUser)
        setStatus('authed')
      },
      async signOut() {
        try {
          await api('/auth/logout', { method: 'POST' })
        } catch {
          /* the local session is cleared either way */
        }
        signOutLocally()
        navigate('/')
      },
    }),
    [user, status, navigate, signOutLocally],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  return useContext(AuthContext)
}
