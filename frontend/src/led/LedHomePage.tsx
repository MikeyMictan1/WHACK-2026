import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { LedGrid } from './LedGrid.tsx'
import { ledApi, type LedState, type WardrobeSkin } from './ledApi.ts'

const STATE_POLL_MS = 200
const WARDROBE_POLL_MS = 500

/** LED Display: what the Unicorn shows right now, and the skins you own to pick from. Buying happens in the shop. */
export function LedHomePage() {
  const { user } = useAuth()
  const [state, setState] = useState<LedState | null>(null)
  const [skins, setSkins] = useState<WardrobeSkin[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Live display + wardrobe previews. Paused while the tab is hidden.
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    const pollState = () => visible() && void ledApi.state().then(setState).catch(() => {})
    const pollSkins = () => visible() && void ledApi.wardrobe().then(setSkins).catch(() => {})
    pollState()
    pollSkins()
    const a = window.setInterval(pollState, STATE_POLL_MS)
    const b = window.setInterval(pollSkins, WARDROBE_POLL_MS)
    return () => {
      window.clearInterval(a)
      window.clearInterval(b)
    }
  }, [])

  async function equip(skin: WardrobeSkin) {
    setBusy(skin.key)
    try {
      setState(await ledApi.equip(skin.key))
      setSkins((list) => list?.map((s) => ({ ...s, showing: s.key === skin.key })) ?? null)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const board = state?.board

  return (
    <>
      <PageHeader
        marker="LED Display"
        title="LED Display."
        description="What your LED display is showing right now. Pick one of your skins and it changes here and on the board."
      />

      <section className="container-x py-10 md:py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,440px)_1fr] md:items-end">
          {state ? (
            <LedGrid frame={state.frame} label={`LED screen showing ${state.skin_name}`} />
          ) : (
            <Skeleton className="aspect-square w-full" />
          )}

          <div>
            <p className="meta">Now showing</p>
            <p className="mt-2 text-d2 font-light">{state?.skin_name ?? '…'}</p>
            {state?.owner_name && <p className="mt-2 text-muted">Equipped by {state.owner_name}</p>}

            <div className="mt-8 border-t border-line pt-5 text-sm">
              {!board ? (
                <span className="text-muted">Checking the board…</span>
              ) : board.connected ? (
                <p>
                  <span aria-hidden className="mr-2 inline-block size-2 bg-brand align-middle" />
                  Unicorn connected{board.port ? ` on ${board.port}` : ''}.
                  {!board.fast && (
                    <span className="mt-2 block text-muted">
                      Animations update once a second. Copy the latest whack_grid.py to the board for smooth playback.
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-muted">
                  <span aria-hidden className="mr-2 inline-block size-2 bg-ink/30 align-middle" />
                  No Unicorn plugged in. Showing on screen only.
                </p>
              )}
              {board?.error && <p className="mt-2 text-red-700">{board.error}</p>}
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
          <h2 className="text-d3 font-light">Your skins</h2>
          {user?.role === 'child' && (
            <ButtonLink to="/shop" size="sm" variant="light" className="border border-brand">
              Get more in the shop
            </ButtonLink>
          )}
        </div>

        {!skins && (
          <div aria-busy="true" aria-label="Loading" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}

        {skins && (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {skins
              .filter((s) => s.owned)
              .map((s) => (
              <li
                key={s.key}
                className={`flex flex-col border bg-white p-3 ${s.showing ? 'border-signal' : 'border-line'}`}
              >
                <LedGrid frame={s.preview} small label={`${s.name} preview`} />
                <h3 className="mt-3 font-medium">{s.name}</h3>
                <p className="meta mt-1">{s.description}</p>
                <div className="mt-auto pt-4">
                  {s.showing ? (
                    <p className="flex h-10 items-center justify-center bg-signal text-sm font-medium">On the display</p>
                  ) : (
                    <Button size="sm" className="w-full" disabled={busy !== null} onClick={() => equip(s)}>
                      Show this
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

    </>
  )
}
