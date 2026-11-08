import { api } from '../lib/api.ts'

export type RewardKind = 'in_game' | 'weekly' | 'milestone' | 'led_skin'
export type ChoreKind = 'chore' | 'extracurricular'

export const REWARD_KINDS: { kind: RewardKind; label: string; note: string }[] = [
  { kind: 'led_skin', label: 'LED skins', note: 'New looks for your LED screen. Equip them in LED Home' },
  { kind: 'in_game', label: 'In-game', note: 'Themes, icons and decor' },
  { kind: 'weekly', label: 'Weekly', note: 'Small treats, a few times a week at most' },
  { kind: 'milestone', label: 'Milestones', note: 'Big goals to save up for' },
]

export const CHORE_KINDS: { kind: ChoreKind; label: string }[] = [
  { kind: 'chore', label: 'Chores' },
  { kind: 'extracurricular', label: 'Extracurricular' },
]

export type Reward = {
  id: number
  title: string
  description: string
  price: number
  kind: RewardKind
  /** Weekly items: how many times a child can buy it in any 7 days. */
  weekly_limit: number
  /** The app's own item: `price` is for a 10.00 WC weekly allowance and each child pays (price / 10) x theirs.
   *  Children get their own price already worked out; parents see the 10.00 WC one. */
  preset: boolean
  /** Weekly items, child view: buys left this week. */
  left_this_week: number | null
  /** Weekly items: when the next one frees up, if none are left (null = can buy now). */
  available_again_at: string | null
  /** LED skins this child already has. */
  owned: boolean
}

export type PurchaseStatus = 'pending' | 'approved' | 'paid' | 'denied' | 'cancelled' | 'expired'

export type PurchaseRequest = {
  id: number
  child_id: number
  child_name: string
  reward_id: number
  title: string
  price: number
  kind: RewardKind
  status: PurchaseStatus
  created_at: string
  expires_in_seconds: number | null
  /** Once paid: charged to the child's card, or taken from their own balance. */
  paid_with: 'credit' | 'balance' | null
}

export type LedgerEntry = { id: number; amount: number; kind: string; description: string; created_at: string }

export type Wallet = {
  balance: number
  /** What a purchase comes out of: the card's available credit, or (on Debit) their own balance. */
  spend_from: 'credit' | 'balance'
  spendable: number
  card_name: string
  entries: LedgerEntry[]
  owned: PurchaseRequest[]
  card_linked: boolean
}

export type Chore = {
  id: number
  title: string
  amount: number
  kind: ChoreKind
  /** Child view: their latest claim for this chore. */
  my_claim_status: 'pending' | 'approved' | 'denied' | null
}

export type ChoreClaim = {
  id: number
  chore_id: number
  child_id: number
  child_name: string
  title: string
  amount: number
  status: 'pending' | 'approved' | 'denied'
  created_at: string
}

export const shopApi = {
  rewards: () => api<Reward[]>('/shop/rewards'),
  addReward: (input: { title: string; description: string; price: number; kind: RewardKind }) =>
    api<Reward>('/shop/rewards', { method: 'POST', json: input }),
  removeReward: (id: number) => api<void>(`/shop/rewards/${id}`, { method: 'DELETE' }),
  starterPack: () => api<void>('/shop/starter-pack', { method: 'POST' }),

  wallet: () => api<Wallet>('/shop/wallet'),
  balances: () => api<Record<string, number>>('/shop/balances'),
  bonus: (child_id: number, amount: number, note: string) =>
    api<void>('/shop/bonus', { method: 'POST', json: { child_id, amount, note } }),

  requests: (onlyOpen = false) => api<PurchaseRequest[]>(`/shop/requests${onlyOpen ? '?only_open=true' : ''}`),
  request: (id: number) => api<PurchaseRequest>(`/shop/requests/${id}`),
  buy: (reward_id: number) => api<PurchaseRequest>('/shop/requests', { method: 'POST', json: { reward_id } }),
  approve: (id: number) => api<PurchaseRequest>(`/shop/requests/${id}/approve`, { method: 'POST' }),
  deny: (id: number) => api<PurchaseRequest>(`/shop/requests/${id}/deny`, { method: 'POST' }),
  cancel: (id: number) => api<PurchaseRequest>(`/shop/requests/${id}/cancel`, { method: 'POST' }),
  /** Waits up to 30 s for a card tap on the reader. `simulate` skips the card. */
  /** Waits for a reader tap; `simulate` skips the card; `cardUid` is a card tapped on this phone. */
  pay: (id: number, simulate = false, signal?: AbortSignal, cardUid?: string) =>
    api<PurchaseRequest>(
      `/shop/requests/${id}/pay${simulate ? '?simulate=true' : cardUid ? `?card_uid=${encodeURIComponent(cardUid)}` : ''}`,
      { method: 'POST', signal },
    ),
  cancelPay: (id: number) => api<void>(`/shop/requests/${id}/pay/cancel`, { method: 'POST' }),

  chores: () => api<Chore[]>('/chores'),
  addChore: (input: { title: string; amount: number; kind: ChoreKind }) =>
    api<Chore>('/chores', { method: 'POST', json: input }),
  removeChore: (id: number) => api<void>(`/chores/${id}`, { method: 'DELETE' }),
  claimChore: (id: number) => api<ChoreClaim>(`/chores/${id}/claim`, { method: 'POST' }),
  claims: (onlyPending = false) => api<ChoreClaim[]>(`/chores/claims${onlyPending ? '?only_pending=true' : ''}`),
  approveClaim: (id: number) => api<ChoreClaim>(`/chores/claims/${id}/approve`, { method: 'POST' }),
  denyClaim: (id: number) => api<ChoreClaim>(`/chores/claims/${id}/deny`, { method: 'POST' }),
}
