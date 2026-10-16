import { useEffect, useState } from 'react'

export default function QrCode({ value, label, size = 200 }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let cancelled = false
    import('qrcode')
      .then((QR) => QR.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#1e1a16', light: '#ffffff' } }))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!src) return <div className="skeleton" style={{ width: size, height: size }} aria-hidden="true" />
  return <img src={src} alt={label} width={size} height={size} className="rounded-lg bg-white p-1" />
}
