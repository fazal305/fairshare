const formatters = new Map()

export function formatMoney(minor, currency = 'PKR') {
  if (minor == null) return '—'
  let f = formatters.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2 })
    formatters.set(currency, f)
  }
  // "PKR 1,250.00" — the non-breaking space keeps code and amount together.
  return f.format(minor / 100).replace(/^([A-Z]{3})\s?/, '$1 ')
}

/** Shows minor units as an editable string, dropping ".00". */
export function toInput(minor) {
  if (!minor) return ''
  const value = minor / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** "1,250.5" → 125050. Returns null for anything that isn't a clean amount. */
export function parseMoney(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '').replace(/^(rs\.?|pkr|\$|£|€)/i, '')
  if (cleaned === '') return 0
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD', 'INR']
