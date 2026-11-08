import type { NegotiationSession } from './negotiationApi.ts'

export type Mood = 'happy' | 'neutral' | 'angry'

/**
 * How the seller looks, from the backend's recorded offers (never the chat text): the rate just
 * came down with the last reply -> happy, went up -> angry, no change -> neutral. A deal agreed is happy.
 */
export function moodOf(session: NegotiationSession): Mood {
  if (session.status === 'agreed' || session.status === 'confirmed') return 'happy'
  const offers = session.messages
    .filter((m) => m.role === 'seller' && m.offer_apr_bp !== null)
    .map((m) => m.offer_apr_bp as number)
  if (offers.length >= 2) {
    const [prev, last] = offers.slice(-2)
    if (last < prev) return 'happy'
    if (last > prev) return 'angry'
  }
  return 'neutral'
}

