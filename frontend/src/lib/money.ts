/**
 * Play money. Amounts are integers in minor units (1/100); the currency is display-only.
 * CURRENCY is the one place to change how money is shown across the whole app
 * (lib/format.ts `money()` uses this too).
 */

export const CURRENCY = 'WC' as 'WC' | 'GBP' // WC = Whack Coins

/** Short label for form fields, e.g. "Price (WC)". */
export const CURRENCY_LABEL = CURRENCY === 'GBP' ? '£' : 'WC'

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatMoney(minor: number) {
  if (CURRENCY === 'GBP') return gbp.format(minor / 100)
  return `${(minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} WC`
}

/** "4.50", "£4.50", "4.50 WC", "4" -> minor units. Returns null if it isn't a positive amount. */
export function parseMoney(input: string): number | null {
  const n = Number(input.replace(/[£,\s]|wc/gi, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
