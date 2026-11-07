import { api } from '../lib/api.ts'

export type CurrentPlan = {
  card_id: string
  card_name: string
  apr_bp: number
  credit_limit: number
  balance: number
  score: number
  on_time_streak: number
  utilisation_pct: number
  interest_this_month: number
}

export type PlanOption = {
  id: string
  name: string
  pitch: string
  negotiable: boolean
  listed_apr_bp: number
  typical_low_bp: number
  typical_high_bp: number
  credit_limit: number
  rewards_bp: number
  late_fee: number
  min_score: number
  monthly_interest: number
  year_net_cost: number
  is_current: boolean
  blocked_reason: string | null
}

export type PlansResponse = { current: CurrentPlan; options: PlanOption[] }

/** Child accounts only: a parent session gets a 403. */
export const plansApi = {
  get: () => api<PlansResponse>('/plans'),
}
