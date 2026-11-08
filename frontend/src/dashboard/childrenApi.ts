import { api } from '../lib/api.ts'
import type { User } from '../auth/types.ts'

export const APP_EXPERIENCE_PRESETS = ['10+', '13+', '15+'] as const

/** Which cards a child can use. Each value maps to a card id in FORM_CARD_TYPES (backend/app/models/card.py). */
export const CARD_TYPE_OPTIONS = [
  { value: 'deer_debit', label: 'DeerDebit' },
  { value: 'shark_father', label: 'The Shark Father' },
  { value: 'cap_one', label: 'ChipOne' },
  { value: 'venture_w', label: 'Venture <W>' },
  { value: 'calicco_credit', label: 'CaliccoCredit' },
] as const

export type CardTypeValue = (typeof CARD_TYPE_OPTIONS)[number]['value']

/** What each age preset turns on. Custom lets the parent pick these themselves. */
export const PRESET_SETTINGS: Record<
  (typeof APP_EXPERIENCE_PRESETS)[number],
  { creditScore: boolean; cardTypes: readonly CardTypeValue[] }
> = {
  '10+': { creditScore: false, cardTypes: ['deer_debit'] },
  '13+': { creditScore: false, cardTypes: ['deer_debit', 'shark_father', 'calicco_credit', 'cap_one'] },
  '15+': { creditScore: true, cardTypes: CARD_TYPE_OPTIONS.map((c) => c.value) },
}

/** Whether credit score tracking is on: from the preset, or ticked under Custom. */
export function creditScoreEnabled(appExperience: string | null) {
  if (!appExperience) return false
  if (appExperience in PRESET_SETTINGS) return PRESET_SETTINGS[appExperience as keyof typeof PRESET_SETTINGS].creditScore
  return appExperience.split(',').includes('credit_score')
}

/** Something the child can order each week. `cost` is in minor units (1/100 WC). */
export type WeeklyItemInput = {
  name: string
  cost: number
  weekly_limit: number
}

export type WeeklyItem = WeeklyItemInput & { id: number }

/** A milestone the parent sets for the child. `cost` is in minor units (1/100 WC). */
export type MilestoneInput = {
  name: string
  cost: number
}

export type Milestone = MilestoneInput & { id: number }

/** A child account as the parent sees it. */
export type Child = User & { weekly_items: WeeklyItem[]; milestones: Milestone[] }

export type ChildInput = {
  username: string
  password: string
  weekly_allowance: number
  app_experience: string
  card_type: string
  /** Minor units, 1.00 to 100.00 WC. null = the card's own limit. */
  weekly_items: WeeklyItemInput[]
  milestones: MilestoneInput[]
}

/** Only the fields sent are changed. `password` resets the child's password; the lists replace what's saved. */
export type ChildUpdate = Partial<
  Pick<
    ChildInput,
    'weekly_allowance' | 'app_experience' | 'card_type' | 'password' | 'weekly_items' | 'milestones'
  >
>

/** A parent's child accounts. All of these return 403 for a child session. */
export const childrenApi = {
  list: () => api<Child[]>('/children'),
  create: (input: ChildInput) => api<Child>('/children', { method: 'POST', json: input }),
  update: (id: number, input: ChildUpdate) => api<Child>(`/children/${id}`, { method: 'PATCH', json: input }),
  remove: (id: number) => api<void>(`/children/${id}`, { method: 'DELETE' }),
}
