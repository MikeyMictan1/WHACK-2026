import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { money, pct } from '../lib/format.ts'
import { ApiError } from '../lib/api.ts'
import { negotiationApi, type ConfirmResult, type CostLine, type NegotiationSession } from './negotiationApi.ts'

type Props = {
  session: NegotiationSession
  onConfirmed: (result: ConfirmResult) => void
  onBack: () => void
}

/** Last step: compare the old and new plan, then tap the NFC card to switch. */
export function ConfirmSwitch({ session, onConfirmed, onBack }: Props) {
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { before, after } = session

  async function confirm(simulate: boolean) {
    setError(null)
    setWaiting(true)
    try {
      onConfirmed(await negotiationApi.confirm(session.id, simulate))
    } catch (err) {
      // 499 means we pressed Back while waiting; not an error worth showing.
      if (!(err instanceof ApiError && err.status === 499)) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      }
      setWaiting(false)
    }
  }

  async function cancel() {
    await negotiationApi.cancelConfirm(session.id).catch(() => {})
    setWaiting(false)
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-d3 font-light tracking-[-0.02em]">
        Switch to {session.card_name} at {pct(session.offer_apr_bp)}?
      </h2>

      {before && after && (
        <table className="mt-8 w-full border-t border-ink text-left">
          <caption className="meta pb-2 text-left">
            A year ahead if your balance and spending stay the same
          </caption>
          <thead>
            <tr className="border-b border-ink/15">
              <th scope="col" className="meta py-3 font-medium" />
              <th scope="col" className="meta py-3 font-medium">
                Now: {before.card_name}
              </th>
              <th scope="col" className="py-3 font-medium">
                New: {after.card_name}
              </th>
            </tr>
          </thead>
          <tbody>
            <Row label="APR" before={pct(before.apr_bp)} after={pct(after.apr_bp)} />
            <Row label="Interest" before={money(before.interest)} after={money(after.interest)} />
            <Row label="Cash back" before={money(before.rewards)} after={money(after.rewards)} />
            <Row label="Net cost" before={money(before.net)} after={money(after.net)} strong lower={better(before, after)} />
          </tbody>
        </table>
      )}

      {session.coach_note && <p className="mt-6 max-w-prose text-lead">{session.coach_note}</p>}

      <div className="mt-8" aria-live="polite">
        <FormError message={error} />
      </div>

      {waiting ? (
        <div className="mt-4 border border-ink bg-signal p-6">
          <p className="text-d4 font-medium">Tap your card on the reader.</p>
          <p className="mt-1">Waiting for up to a minute.</p>
          <Button variant="onAccent" className="mt-5" onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => confirm(false)}>Confirm with card tap</Button>
          {import.meta.env.DEV && (
            <Button variant="light" className="border border-ink" onClick={() => confirm(true)}>
              Simulate tap (dev)
            </Button>
          )}
          <Button variant="light" className="border border-ink" onClick={onBack}>
            Not now
          </Button>
        </div>
      )}
    </div>
  )
}

/** Which column has the lower net cost. */
function better(before: CostLine, after: CostLine): 'before' | 'after' | 'same' {
  return after.net < before.net ? 'after' : after.net > before.net ? 'before' : 'same'
}

function Row({
  label,
  before,
  after,
  strong = false,
  lower,
}: {
  label: string
  before: string
  after: string
  strong?: boolean
  lower?: 'before' | 'after' | 'same'
}) {
  return (
    <tr className="border-b border-ink/15">
      <th scope="row" className="meta py-4 pr-4 font-medium">
        {label}
      </th>
      <td className={`py-4 pr-4 ${strong ? 'font-medium' : ''} ${lower === 'before' ? 'bg-signal px-2' : ''}`}>{before}</td>
      <td className={`py-4 ${strong ? 'font-medium' : ''} ${lower === 'after' ? 'bg-signal px-2' : ''}`}>{after}</td>
    </tr>
  )
}
