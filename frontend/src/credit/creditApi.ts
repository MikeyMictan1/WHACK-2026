import { api } from '../lib/api.ts'

/** Money is in minor units (1/100 WC); APR in basis points (2000 = 20%). */

export type StatementStatus = 'open' | 'paid' | 'carried' | 'late'

export type Statement = {
  id: number
  number: number
  card_name: string
  apr_bp: number
  statement_date: string
  due_date: string
  carried: number
  purchases: number
  interest: number
  fees: number
  total: number
  minimum: number
  paid: number
  remaining: number
  cash_back: number
  cash_back_paid: boolean
  status: StatementStatus
}

export type CreditEntry = { id: number; amount: number; kind: string; description: string; on_date: string }

export type ScoreFactor = { key: 'payment' | 'utilisation' | 'history'; name: string; points: number; max_points: number; note: string }

export type ScoreReason = { factor: string; factor_name: string; delta: number; reason: string }

export type ScorePoint = { month: number; score: number; date: string }

export type ScoreInfo = {
  score: number
  min_score: number
  max_score: number
  band: string
  /** How much it moved last month; null before the first statement. */
  change: number | null
  factors: ScoreFactor[]
  /** Why it moved last month. */
  reasons: ScoreReason[]
  /** Oldest first, month 0 is where the account started. */
  history: ScorePoint[]
  next_unlock: { card_name: string; min_score: number; points_needed: number } | null
}

export type CreditSummary = {
  card: { id: string; name: string; apr_bp: number; credit_limit: number; rewards_bp: number; late_fee: number }
  has_credit: boolean
  owed: number
  limit: number
  available: number
  utilisation_pct: number
  /** Purchases made since the last statement. */
  unbilled: number
  /** The child's own date. It only moves when a parent skips a month. */
  sim_date: string
  next_statement_date: string
  statement: Statement | null
  can_pay: boolean
  statements: Statement[]
  activity: CreditEntry[]
  wallet_balance: number
  example_balance: number
  example_interest: number
  switch_locked_reason: string | null
  grace_days: number
  min_payment_percent: number
  min_payment_floor: number
  /** The parent's setting: is credit score tracking on for this child? */
  score_enabled: boolean
  score: ScoreInfo | null
}

export type PayResult = { summary: CreditSummary; paid: number; cash_back: number }

export type ChildCredit = {
  child_id: number
  child_name: string
  card_id: string
  card_name: string
  has_credit: boolean
  owed: number
  available: number
  sim_date: string
  statement_number: number | null
  statement_total: number | null
  statement_remaining: number | null
  due_date: string | null
  status: StatementStatus | null
  /** Null when this child's score tracking is off. */
  score: number | null
  score_change: number | null
}

export type SkipResult = {
  child_id: number
  child_name: string
  sim_date: string
  allowance: number
  previous_number: number | null
  outcome: 'paid' | 'carried' | 'late' | null
  interest: number
  late_fee: number
  statement: Statement | null
  score_enabled: boolean
  score_before: number | null
  score_after: number | null
  score_changes: ScoreReason[]
}

export const STATUS_LABEL: Record<StatementStatus, string> = {
  open: 'Waiting for payment',
  paid: 'Paid in full',
  carried: 'Minimum paid, rest carried over',
  late: 'Paid late',
}

/** Child endpoints return 403 for a parent; the skip and overview endpoints return 403 for a child. */
export const creditApi = {
  get: () => api<CreditSummary>('/credit'),
  /** Waits up to 30 s for a card tap on the reader. `simulate` skips the card; `cardUid` is a card tapped on this phone. */
  pay: (amount: number, simulate: boolean, signal?: AbortSignal, cardUid?: string) =>
    api<PayResult>('/credit/payments', { method: 'POST', json: { amount, simulate, card_uid: cardUid ?? null }, signal }),
  cancelPay: () => api<void>('/credit/payments/cancel', { method: 'POST' }),
  children: () => api<ChildCredit[]>('/credit/children'),
  /** The child's own "Next month" on the monthly review. */
  skipMyMonth: () => api<SkipResult>('/credit/skip-month', { method: 'POST' }),
  skipMonth: (childId: number) => api<SkipResult>(`/credit/children/${childId}/skip-month`, { method: 'POST' }),
}

/** "28 Nov 2026" in the child's own time. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
