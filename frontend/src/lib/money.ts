/** Play money. Amounts are integers in pence; the currency is display-only. */

const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatMoney(pence: number) {
  return formatter.format(pence / 100)
}

/** "4.50", "£4.50", "4" -> pence. Returns null if it isn't a positive amount. */
export function parseMoney(input: string): number | null {
  const n = Number(input.replace(/[£,\s]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
