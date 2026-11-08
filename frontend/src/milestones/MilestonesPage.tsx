import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { formatMoney } from '../lib/money.ts'
import { celebrate } from './celebrate.ts'
import { milestonesApi, type Milestone, type MilestonesState } from './milestonesApi.ts'

/** Child: the goals their parent set, how close their savings are, and redeeming one from their own balance. */
export function MilestonesPage() {
  const [state, setState] = useState<MilestonesState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    milestonesApi
      .get()
      .then(setState)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function redeem(m: Milestone) {
    setBusy(true)
    try {
      setState(await milestonesApi.redeem(m.id))
      setConfirming(null)
      celebrate()
      showToast(`You reached ${m.name}. ${formatMoney(m.cost)} came out of your balance.`)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        marker="Your dashboard"
        title="Milestones"
        description={
          state
            ? `Big goals to save for. You have ${formatMoney(state.balance)} saved. Milestones come out of your own money, not your card.`
            : 'Big goals to save for.'
        }
      />
      <section className="container-x py-10 md:py-14">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <TextLink to="/dashboard">Back to dashboard</TextLink>
          <TextLink to="/earn">Earn money</TextLink>
        </div>

        {error && (
          <div className="mt-8">
            <FormError message={error} />
          </div>
        )}

        {!state && !error && (
          <div aria-busy="true" aria-label="Loading" className="mt-10 grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        )}

        {state && state.milestones.length === 0 && (
          <p className="mt-10 max-w-prose text-muted">
            You have no milestones yet. Ask your parent to add one, like a new bike or a concert ticket.
          </p>
        )}

        {state && state.milestones.length > 0 && (
          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {state.milestones.map((m) => (
              <MilestoneBox
                key={m.id}
                milestone={m}
                balance={state.balance}
                confirming={confirming === m.id}
                busy={busy}
                onAsk={() => setConfirming(m.id)}
                onCancel={() => setConfirming(null)}
                onConfirm={() => void redeem(m)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function MilestoneBox({
  milestone: m,
  balance,
  confirming,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: {
  milestone: Milestone
  balance: number
  confirming: boolean
  busy: boolean
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const reached = m.redeemed_at !== null
  const short = Math.max(0, m.cost - balance)

  return (
    <li className="flex flex-col border border-ink/15 bg-white p-6">
      <p className="meta">{formatMoney(m.cost)}</p>
      <h2 className="mt-2 text-d4 font-medium">{m.name}</h2>

      <div className="mt-6">
        <div
          className="h-3 w-full bg-ink/10"
          role="progressbar"
          aria-valuenow={m.progress_pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${m.name}: ${m.progress_pct}% saved`}
        >
          <div className="h-full bg-signal" style={{ width: `${m.progress_pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <span className="meta tabular-nums">{m.progress_pct}%</span>
          <span className="meta">
            {reached
              ? `Reached ${new Date(m.redeemed_at ?? '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
              : short > 0
                ? `${formatMoney(short)} to go`
                : 'Ready to redeem'}
          </span>
        </div>
      </div>

      <div className="mt-auto pt-6">
        {reached ? (
          <p className="text-sm text-muted">You reached this milestone.</p>
        ) : short > 0 ? (
          <p className="text-sm text-muted">Keep saving. You can redeem it once your balance covers it.</p>
        ) : confirming ? (
          <div>
            <p className="text-sm">Spend {formatMoney(m.cost)} from your balance on {m.name}?</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button size="sm" onClick={onConfirm} disabled={busy}>
                {busy ? 'Redeeming…' : 'Yes, redeem'}
              </Button>
              <Button size="sm" variant="light" className="border border-ink" onClick={onCancel} disabled={busy}>
                Not yet
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" className="w-full" onClick={onAsk}>
            Redeem
          </Button>
        )}
      </div>
    </li>
  )
}
