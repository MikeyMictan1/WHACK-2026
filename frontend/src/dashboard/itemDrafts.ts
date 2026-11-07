/** One row while it's being edited; numbers stay strings until submit. */
export type ItemDraft = { key: number; name: string; cost: string; weekly_limit: string }

let nextKey = 0

export function toDrafts(saved: { name: string; cost: number; weekly_limit?: number }[]): ItemDraft[] {
  return saved.map((i) => ({
    key: nextKey++,
    name: i.name,
    cost: String(i.cost),
    weekly_limit: String(i.weekly_limit ?? 1),
  }))
}

/** Checks each row; returns the first problem as a message, or null when all rows are valid. */
export function itemsError(drafts: ItemDraft[], noun: string, withLimit: boolean): string | null {
  for (const [n, d] of drafts.entries()) {
    const name = d.name.trim()
    const cost = Number(d.cost)
    const limit = Number(d.weekly_limit)
    if (!name) return `${noun} ${n + 1} needs a name`
    if (d.cost === '' || !Number.isInteger(cost) || cost < 0) return `Enter a valid cost for ${name}`
    if (withLimit && (d.weekly_limit === '' || !Number.isInteger(limit) || limit < 1)) {
      return `Enter a weekly limit of at least 1 for ${name}`
    }
  }
  return null
}

export function newDraft(): ItemDraft {
  return { key: nextKey++, name: '', cost: '', weekly_limit: '1' }
}
