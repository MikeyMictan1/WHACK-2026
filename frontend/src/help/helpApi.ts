import { api } from '../lib/api.ts'

export type HelpTopic = { id: string; title: string }
export type HelpReply = { reply: string; topics: HelpTopic[]; scripted: boolean }
export type HelpTurn = { role: 'user' | 'assistant'; text: string }

/** Open to everyone. Signed-in children get answers that know their own score and plan. */
export const helpApi = {
  chat: (message: string, history: HelpTurn[], page: string) =>
    api<HelpReply>('/help/chat', { method: 'POST', json: { message, history, page } }),
}
