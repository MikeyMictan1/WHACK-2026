import { api } from '../lib/api.ts'

export type Board = {
  connected: boolean
  port: string | null
  /** Board runs the newer whack_grid.py (smooth whole-frame updates). */
  fast: boolean
  error: string | null
}

export type LedState = {
  skin: string
  skin_name: string
  owner_name: string | null
  /** 256 pixels as rrggbb hex, row by row. */
  frame: string
  board: Board
}

export type WardrobeSkin = {
  key: string
  name: string
  description: string
  price: number
  owned: boolean
  showing: boolean
  /** Shop item to buy it with (null for free skins, or if the parent removed it). */
  reward_id: number | null
  preview: string
}

export const ledApi = {
  state: () => api<LedState>('/led/state'),
  wardrobe: () => api<WardrobeSkin[]>('/led/wardrobe'),
  equip: (skin: string) => api<LedState>('/led/equip', { method: 'POST', json: { skin } }),
}
