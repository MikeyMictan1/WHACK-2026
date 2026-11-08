import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { DecorTile } from './DecorTile.tsx'
import { decorApi, type DecorItem, type DecorSide, type DecorState } from './decorApi.ts'

/** Put the cosmetics you own on the left or right of your home screen. Pick an item, then pick a side. */
export function DecorPage() {
  const [state, setState] = useState<DecorState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    decorApi
      .get()
      .then(setState)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function place(rewardId: number, side: DecorSide | null) {
    if (!state) return
    // Everything already placed stays; this item moves to the end of its new side (or leaves the screen).
    const layout = state.items
      .filter((i) => i.side && i.reward_id !== rewardId)
      .map((i) => ({ reward_id: i.reward_id, side: i.side as DecorSide }))
    if (side) layout.push({ reward_id: rewardId, side })
    setBusy(true)
    try {
      setState(await decorApi.save(layout))
      setPicked(null)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const chosen = state?.items.find((i) => i.reward_id === picked) ?? null
  const full = (side: DecorSide) =>
    !!state && state.items.filter((i) => i.side === side && i.reward_id !== picked).length >= state.slots_per_side

  return (
    <>
      <PageHeader
        marker="Your dashboard"
        title="Decor"
        description="Decorate the sides of your home screen with the cosmetics you have bought."
      />
      <section className="container-x py-10 md:py-14">
        {error && <FormError message={error} />}
        {!state && !error && <Skeleton className="h-40 w-full" />}

        {state && state.items.length === 0 && (
          <div>
            <p className="max-w-prose text-muted">
              You do not own any decor yet. Buy an in-game item in the Rewards shop and it will show up here.
            </p>
            <div className="mt-6">
              <ButtonLink to="/shop">Go to Rewards</ButtonLink>
            </div>
          </div>
        )}

        {state && state.items.length > 0 && (
          <>
            <div className="grid gap-10 md:grid-cols-2">
              {state.sides.map((side) => (
                <div key={side}>
                  <h2 className="border-b border-ink pb-3 text-d3 font-light capitalize">{side} side</h2>
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {state.items
                      .filter((i) => i.side === side)
                      .map((i) => (
                        <Slot key={i.reward_id} item={i} picked={picked === i.reward_id} onPick={setPicked} />
                      ))}
                  </ul>
                  {state.items.every((i) => i.side !== side) && <p className="mt-4 text-muted">Nothing placed here.</p>}
                </div>
              ))}
            </div>

            <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">In the box</h2>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {state.items
                .filter((i) => !i.side)
                .map((i) => (
                  <Slot key={i.reward_id} item={i} picked={picked === i.reward_id} onPick={setPicked} />
                ))}
            </ul>
            {state.items.every((i) => i.side) && <p className="mt-4 text-muted">Everything you own is on show.</p>}

            <div className="mt-10 border-t border-ink pt-6" aria-live="polite">
              {chosen ? (
                <>
                  <p className="font-medium">{chosen.title}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {state.sides.map((side) => (
                      <Button
                        key={side}
                        size="sm"
                        disabled={busy || full(side) || chosen.side === side}
                        onClick={() => place(chosen.reward_id, side)}
                      >
                        {full(side) ? `The ${side} is full` : `Put on the ${side}`}
                      </Button>
                    ))}
                    {chosen.side && (
                      <Button
                        size="sm"
                        variant="light"
                        className="border border-ink"
                        disabled={busy}
                        onClick={() => place(chosen.reward_id, null)}
                      >
                        Take off
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted">Pick an item above. Each side holds {state.slots_per_side}.</p>
              )}
            </div>
          </>
        )}

        <div className="mt-12">
          <ButtonLink to="/dashboard" variant="light" className="border border-ink">
            Back to home
          </ButtonLink>
        </div>
      </section>
    </>
  )
}

function Slot({ item, picked, onPick }: { item: DecorItem; picked: boolean; onPick: (id: number | null) => void }) {
  return (
    <li>
      <button
        type="button"
        className="block w-full text-left"
        aria-pressed={picked}
        onClick={() => onPick(picked ? null : item.reward_id)}
      >
        <DecorTile item={item} selected={picked} />
      </button>
    </li>
  )
}
