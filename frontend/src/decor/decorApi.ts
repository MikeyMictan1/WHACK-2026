import { api } from '../lib/api.ts'

export type DecorSide = 'left' | 'right'

/** An owned cosmetic. `side` is null while it is still in the box. */
export type DecorItem = { reward_id: number; title: string; side: DecorSide | null; slot: number | null }

export type DecorState = { items: DecorItem[]; sides: DecorSide[]; slots_per_side: number }

export type SpendRow = { key: string; label: string; count: number; total: number }
export type Spending = { rows: SpendRow[]; total: number }

/** Child only: these return 403 for a parent. */
export const decorApi = {
  get: () => api<DecorState>('/decor'),
  /** Saves the whole layout; the order within a side is the order on screen. */
  save: (placements: { reward_id: number; side: DecorSide }[]) =>
    api<DecorState>('/decor', { method: 'PUT', json: { placements } }),
  spending: () => api<Spending>('/decor/spending'),
}
