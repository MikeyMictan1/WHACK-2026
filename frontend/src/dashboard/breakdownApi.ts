import { api } from '../lib/api.ts'
import type { CreditSummary, ScoreInfo } from '../credit/creditApi.ts'

export type BreakdownRow = { key: string; label: string; count: number; total: number }

/** Negative `amount` is money out, or owed on the card. */
export type BreakdownTransaction = { id: number; amount: number; kind: string; description: string; created_at: string }

export type Recap = {
  id: number
  created_at: string
  headline: string
  spending: string
  credit: string
  praise: string
  talk_about: string[]
  /** True when the built-in summary wrote it because the AI was unavailable. */
  scripted: boolean
}

export type Breakdown = {
  child_id: number
  child_name: string
  username: string
  starting_credit_limit: number | null
  /** The parent's setting for this child. The score is shown to the parent either way. */
  score_tracking: boolean
  summary: CreditSummary
  score: ScoreInfo
  spending: BreakdownRow[]
  spent_total: number
  earned: BreakdownRow[]
  earned_total: number
  interest_total: number
  late_fee_total: number
  transactions: BreakdownTransaction[]
  recap: Recap | null
}

/** Parent only, and only for their own children. */
export const breakdownApi = {
  get: (childId: number) => api<Breakdown>(`/breakdown/${childId}`),
  writeRecap: (childId: number) => api<Recap>(`/breakdown/${childId}/recap`, { method: 'POST' }),
}
