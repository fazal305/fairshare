import { useEffect, useRef, useState } from 'react'

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** True once `active` has stayed true for longer than `ms`: a slow network, not a normal load. */
export function useSlow(active, ms = 4000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), ms)
    return () => clearTimeout(t)
  }, [active, ms])
  return slow
}

/** Calls `fn` every `ms` while the tab is visible. */
export function useInterval(fn, ms, enabled = true) {
  const saved = useRef(fn)
  useEffect(() => {
    saved.current = fn
  }, [fn])
  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current()
    }
    const id = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [ms, enabled])
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · FairShare` : 'FairShare · Split the bill by what everyone actually ordered'
    const canonical = document.querySelector('link[rel="canonical"]')
    if (canonical) canonical.href = new URL(window.location.pathname, canonical.href).href
  }, [title])
}
