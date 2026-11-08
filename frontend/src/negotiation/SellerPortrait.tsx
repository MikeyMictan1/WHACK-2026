import miaAngry from '../assets/sellers/mia_angry.png'
import miaHappy from '../assets/sellers/mia_happy.png'
import miaNeutral from '../assets/sellers/mia_neutral.png'
import sharkAngry from '../assets/sellers/shark_angry.png'
import sharkHappy from '../assets/sellers/shark_happy.png'
import sharkNeutral from '../assets/sellers/shark_neutral.png'
import type { Mood } from './mood.ts'
import type { NegotiationSession } from './negotiationApi.ts'

/** The loan shark has his own art; every other seller is drawn as the woman with the cat for now. */
const FACES: Record<'shark' | 'mia', Record<Mood, string>> = {
  shark: { happy: sharkHappy, neutral: sharkNeutral, angry: sharkAngry },
  mia: { happy: miaHappy, neutral: miaNeutral, angry: miaAngry },
}

const MOOD_LABEL: Record<Mood, string> = {
  happy: 'pleased',
  neutral: 'listening',
  angry: 'not impressed',
}

/**
 * The seller at their desk, at the top of the page. The art is 223 x 124 pixel art with the desk
 * along the bottom 34 rows, so the panel paints the same split (white above, desk blue below) and
 * the drawing sits in the middle of a desk that runs the full width.
 */
export function SellerPortrait({ session, mood }: { session: NegotiationSession; mood: Mood }) {
  const face = FACES[session.card_id === 'loan_shark' ? 'shark' : 'mia'][mood]
  const name = session.seller.split(' from ')[0]

  return (
    <figure
      className="relative flex justify-center overflow-hidden border border-line"
      style={{ background: 'linear-gradient(to bottom, var(--color-white) 71.77%, var(--color-desk) 71.77%)' }}
    >
      <img
        src={face}
        alt={`${name}, ${MOOD_LABEL[mood]}`}
        className="pixelated block aspect-[223/124] h-[clamp(130px,min(32vw,26svh),300px)] w-auto max-w-none"
      />
      <figcaption className="absolute bottom-0 left-0 flex w-full flex-wrap items-baseline justify-between gap-x-4 px-4 pb-2 text-white md:px-6 md:pb-3">
        <span className="font-medium md:text-lg">{session.seller}</span>
        <span className="text-sm text-white/80">Looks {MOOD_LABEL[mood]}</span>
      </figcaption>
    </figure>
  )
}
