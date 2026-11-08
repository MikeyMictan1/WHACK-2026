import { Button } from '../components/ui/Button.tsx'
import { pct } from '../lib/format.ts'
import type { NegotiationSession } from './negotiationApi.ts'

type Props = {
  session: NegotiationSession
  busy: boolean
  onAccept: () => void
  onWalkAway: () => void
}

/** The offer on the table, always shown from the backend's number, never from chat text. */
export function OfferPanel({ session, busy, onAccept, onWalkAway }: Props) {
  const improved = session.discount_bp > 0
  const worse = session.discount_bp < 0
  const percentWon = Math.round(session.progress * 100)

  return (
    <aside aria-label="Current offer" className="border border-line border-t-4 border-t-brand bg-white p-5 lg:min-h-0 lg:overflow-y-auto">
      <p className="meta">Current offer</p>
      <p
        className={`mt-3 inline-block px-3 py-1 text-[clamp(2.5rem,5vw,3.75rem)] leading-none font-light tracking-[-0.04em] ${
          improved ? 'bg-brand text-white' : worse ? 'bg-signal' : ''
        }`}
        aria-live="polite"
      >
        {pct(session.offer_apr_bp)}
      </p>
      <p className="meta mt-2">APR on {session.card_name}</p>
      {worse && (
        <p className="mt-3 text-sm font-medium">
          Your rate went up. A polite, specific request can bring it back down.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="meta">Listed rate</dt>
          <dd className={`mt-1 font-medium ${improved ? 'text-muted line-through' : ''}`}>{pct(session.listed_apr_bp)}</dd>
        </div>
        <div>
          <dt className="meta">{worse ? 'Added' : 'Taken off'}</dt>
          <dd className="mt-1 font-medium">
            {improved ? pct(session.discount_bp) : worse ? pct(-session.discount_bp) : 'Nothing yet'}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <p className="meta">Discount won</p>
          <p className="meta">{percentWon}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentWon}
          aria-label="How much of the best available discount you have won"
          className="mt-2 h-3 border border-brand"
        >
          <div className="h-full bg-brand" style={{ width: `${percentWon}%` }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button onClick={onAccept} disabled={busy}>
          Accept {pct(session.offer_apr_bp)}
        </Button>
        <Button variant="light" className="border border-ink" onClick={onWalkAway} disabled={busy}>
          Walk away
        </Button>
      </div>
    </aside>
  )
}
