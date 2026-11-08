import chip from '../assets/cards/chip.png'
import calicco from '../assets/cards/calicco_credit.png'
import debit from '../assets/cards/debit.png'
import shark from '../assets/cards/loan_shark.png'
import venture from '../assets/cards/venture_w.png'

/** Card id (backend `Card.id`) -> its artwork. Unknown ids fall back to the starter card. */
const ART: Record<string, string> = {
  debit,
  calicco_credit: calicco,
  chip,
  venture_w: venture,
  loan_shark: shark,
}

export function cardArt(cardId: string): string {
  return ART[cardId] ?? calicco
}
