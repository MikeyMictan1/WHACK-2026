import { api } from '../lib/api.ts'
import type { CurrentPlan } from '../plans/plansApi.ts'

export type Message = {
  id: number
  role: 'child' | 'seller'
  text: string
  offer_apr_bp: number | null
}

export type CostLine = {
  card_name: string
  apr_bp: number
  interest: number
  rewards: number
  net: number
}

export type NegotiationStatus = 'active' | 'agreed' | 'confirmed' | 'declined' | 'expired'

export type NegotiationSession = {
  id: number
  card_id: string
  card_name: string
  seller: string
  status: NegotiationStatus
  listed_apr_bp: number
  /** The offer on the table. Set by the backend only; the chat text never changes it. */
  offer_apr_bp: number
  discount_bp: number
  /** 0..1 of the available discount won so far. */
  progress: number
  turns_used: number
  max_turns: number
  /** True if the offline fallback bot wrote any reply. */
  scripted: boolean
  messages: Message[]
  before: CostLine | null
  after: CostLine | null
  coach_note: string | null
}

export type ConfirmResult = { session: NegotiationSession; plan: CurrentPlan }

export const negotiationApi = {
  start: (cardId: string) => api<NegotiationSession>(`/plans/${cardId}/negotiations`, { method: 'POST' }),
  say: (id: number, text: string) =>
    api<NegotiationSession>(`/negotiations/${id}/messages`, { method: 'POST', json: { text } }),
  accept: (id: number) => api<NegotiationSession>(`/negotiations/${id}/accept`, { method: 'POST' }),
  walkAway: (id: number) => api<NegotiationSession>(`/negotiations/${id}/walk-away`, { method: 'POST' }),
  /** Waits for a card tap (up to a minute). `simulate` skips the tap in dev builds. */
  confirm: (id: number, simulate: boolean) =>
    api<ConfirmResult>(`/negotiations/${id}/confirm`, { method: 'POST', json: { simulate } }),
  cancelConfirm: (id: number) => api<void>(`/negotiations/${id}/confirm/cancel`, { method: 'POST' }),
}
