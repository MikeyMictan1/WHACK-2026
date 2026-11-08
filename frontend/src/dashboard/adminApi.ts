import { api } from '../lib/api.ts'
import type { User } from '../auth/types.ts'

/** One parent and the child accounts they manage. */
export type Family = { parent: User; children: User[] }

/** The site's internal clock. All times are ISO strings (UTC). */
export type SiteClock = {
  /** The site's current time: natural + whatever the admin added. */
  now: string
  /** What it would be if never altered: creation time plus the real days since. */
  natural: string
  created_at: string
  offset_months: number
  offset_days: number
}

export type ClockUnit = 'day' | 'week' | 'month'

/** Admin-only (except reading the clock). Returns 403 for anyone else. */
export const adminApi = {
  parents: () => api<Family[]>('/admin/parents'),
  clock: () => api<SiteClock>('/clock'),
  advanceClock: (unit: ClockUnit) => api<SiteClock>('/clock/advance', { method: 'POST', json: { unit } }),
  resetClock: () => api<SiteClock>('/clock/reset', { method: 'POST' }),
  unlinkAllCards: () => api<{ unlinked: number }>('/admin/cards/unlink-all', { method: 'POST' }),
}
