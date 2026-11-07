/**
 * One row while it's being edited; numbers stay strings until submit.
 * `cost` is typed in WC (e.g. "4.50") and saved in minor units, like all money (lib/money.ts).
 */
export type ItemDraft = { key: number; name: string; cost: string; weekly_limit: string }

let nextKey = 0

/** Minor units -> what the parent types, e.g. 450 -> "4.5". */
export function toWc(minor: number) {
  return String(minor / 100)
}

/** What the parent typed -> minor units, or null if it isn't a valid amount (0 is allowed). */
export function fromWc(input: string): number | null {
  if (input.trim() === '') return null
  const n = Number(input)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function toDrafts(saved: { name: string; cost: number; weekly_limit?: number }[]): ItemDraft[] {
  return saved.map((i) => ({
    key: nextKey++,
    name: i.name,
    cost: toWc(i.cost),
    weekly_limit: String(i.weekly_limit ?? 1),
  }))
}

/** Checks each row; returns the first problem as a message, or null when all rows are valid. */
export function itemsError(drafts: ItemDraft[], noun: string, withLimit: boolean): string | null {
  for (const [n, d] of drafts.entries()) {
    const name = d.name.trim()
    const limit = Number(d.weekly_limit)
    if (!name) return `${noun} ${n + 1} needs a name`
    if (fromWc(d.cost) === null) return `Enter a valid cost for ${name}`
    if (withLimit && (d.weekly_limit === '' || !Number.isInteger(limit) || limit < 1)) {
      return `Enter a weekly limit of at least 1 for ${name}`
    }
  }
  return null
}

export function newDraft(): ItemDraft {
  return { key: nextKey++, name: '', cost: '', weekly_limit: '1' }
}
