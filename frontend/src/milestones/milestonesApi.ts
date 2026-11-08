import { api } from '../lib/api.ts'

/** A goal the parent set on the child form. Money is in minor units (1/100 WC). */
export type Milestone = {
  id: number
  name: string
  cost: number
  /** 0 to 100: the child's own balance against the cost (100 once redeemed). */
  progress_pct: number
  /** When it was redeemed, or null if not yet. */
  redeemed_at: string | null
}

export type MilestonesState = {
  /** The child's own money. Milestones are paid from this, never the credit card. */
  balance: number
  milestones: Milestone[]
}

/** Child only: these return 403 for a parent. */
export const milestonesApi = {
  get: () => api<MilestonesState>('/milestones'),
  redeem: (id: number) => api<MilestonesState>(`/milestones/${id}/redeem`, { method: 'POST' }),
}
