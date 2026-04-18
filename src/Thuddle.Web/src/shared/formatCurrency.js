// Known ISO 4217 currency codes we'll let Intl.NumberFormat format with symbols.
// For anything else (e.g. event-defined custom codes like "BEER"), we fall back
// to a plain "{amount} {currency}" rendering so the browser never throws.
const ISO_4217 = new Set(['NOK', 'EUR', 'USD'])

/**
 * Format a money amount for display.
 * @param {number|string|null|undefined} amount
 * @param {string|null|undefined} currency  Currency code (ISO or custom).
 * @param {object} [options]
 * @param {boolean} [options.freeIfZero=false] When true, return "Free" for 0/null.
 * @returns {string}
 */
export function formatCurrency(amount, currency, options = {}) {
  const { freeIfZero = false } = options

  if (amount === null || amount === undefined || amount === '') {
    return freeIfZero ? 'Free' : ''
  }

  const numeric = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(numeric)) return ''

  if (freeIfZero && numeric === 0) return 'Free'

  const code = (currency || '').toUpperCase()

  if (ISO_4217.has(code)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(numeric)
    } catch {
      // Fall through to the generic format
    }
  }

  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numeric)

  return code ? `${formatted} ${code}` : formatted
}

/** Parse a string from a `inputmode="decimal"` field into a positive number, or null. */
export function parseDecimalInput(raw) {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
