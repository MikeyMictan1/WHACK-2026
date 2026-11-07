/** Money arrives from the backend in minor units (1/100 WC); APR in basis points (2499 = 24.99%). */

/** Whack Coins (WC): play money, never a real currency. */
export function money(minor: number): string {
  return `${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} WC`
}

export function pct(bp: number): string {
  return `${parseFloat((bp / 100).toFixed(2))}%`
}

export function pctRange(lowBp: number, highBp: number): string {
  return lowBp === highBp ? pct(highBp) : `${pct(lowBp)} to ${pct(highBp)}`
}
