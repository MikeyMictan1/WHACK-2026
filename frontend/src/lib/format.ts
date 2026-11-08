/** Money arrives from the backend in minor units (1/100 WC); APR in basis points (2499 = 24.99%). */

import { formatMoney } from './money.ts'

/** Play money in the app's display currency (Whack Coins by default; see lib/money.ts). */
export function money(minor: number): string {
  return formatMoney(minor)
}

export function pct(bp: number): string {
  return `${parseFloat((bp / 100).toFixed(2))}%`
}

export function pctRange(lowBp: number, highBp: number): string {
  return lowBp === highBp ? pct(highBp) : `${pct(lowBp)} to ${pct(highBp)}`
}

/** +14 / −34 / 0 */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
