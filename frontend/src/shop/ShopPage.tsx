import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { decorApi } from '../decor/decorApi.ts'
import { decorArt } from '../decor/decorArt.ts'
import { LedGrid } from '../led/LedGrid.tsx'
import { ledApi } from '../led/ledApi.ts'
import { formatMoney } from '../lib/money.ts'
import { PurchaseFlow } from './PurchaseFlow.tsx'
import { REWARD_KINDS, shopApi, type PurchaseRequest, type Reward, type Wallet } from './shopApi.ts'

/** Child: the shop. Big tiles with a picture of each item (LED preview, decor art) and the buy button below. */
export function ShopPage() {
  const { user } = useAuth()
  if (user?.role === 'parent') return <Navigate to="/manage" replace />
  return <ChildShop />
}

function ChildShop() {
  const [rewards, setRewards] = useState<Reward[] | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [active, setActive] = useState<PurchaseRequest | null>(null)
  /** LED previews by shop item id, and the decor the child already has. */
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [ownedDecor, setOwnedDecor] = useState<Set<number>>(new Set())

  function loadDecor() {
    decorApi
      .get()
      .then((d) => setOwnedDecor(new Set(d.items.map((i) => i.reward_id))))
      .catch(() => {})
  }

  async function load() {
    const [r, w] = await Promise.all([shopApi.rewards(), shopApi.wallet()])
    setRewards(r)
    setWallet(w)
    loadDecor()
  }

  useEffect(() => {
    Promise.all([shopApi.rewards(), shopApi.wallet(), shopApi.requests(true)])
      .then(([r, w, open]) => {
        setRewards(r)
        setWallet(w)
        // Resume a purchase that was in progress (e.g. after a refresh).
        setActive((current) => current ?? open[0] ?? null)
      })
      .catch((err: Error) => showToast(err.message, 'error'))
    loadDecor()
  }, [])

  // Animated LED previews, refreshed while the tab is visible.
  useEffect(() => {
    const poll = () =>
      document.visibilityState === 'visible' &&
      void ledApi
        .wardrobe()
        .then((list) => {
          const map: Record<number, string> = {}
          for (const w of list) if (w.reward_id !== null) map[w.reward_id] = w.preview
          setPreviews(map)
        })
        .catch(() => {})
    poll()
    const id = window.setInterval(poll, 1000)
    return () => window.clearInterval(id)
  }, [])

  async function buy(reward: Reward) {
    try {
      setActive(await shopApi.buy(reward.id))
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const spendable = wallet?.spendable ?? 0
  const onCredit = wallet?.spend_from === 'credit'

  return (
    <>
      <PageHeader
        marker="Shop"
        title="Shop."
        description={
          wallet
            ? onCredit
              ? `You have ${formatMoney(spendable)} of credit left on your ${wallet.card_name} card.`
              : `You have ${formatMoney(spendable)} to spend.`
            : 'Loading your balance…'
        }
      />

      <section className="container-x py-10 md:py-14">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <TextLink to="/dashboard">Back to dashboard</TextLink>
          <TextLink to="/earn">Earn money</TextLink>
        </div>

        {!rewards && (
          <div aria-busy="true" aria-label="Loading" className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        )}

        {rewards?.length === 0 && (
          <p className="mt-10 text-muted">Your shop is empty. Ask your parent to add some rewards.</p>
        )}

        {rewards &&
          REWARD_KINDS.map(({ kind, label, note }) => {
            // Decor with artwork first, so the pictures sit together; items without art go last.
            const items = rewards
              .filter((r) => r.kind === kind)
              .sort((a, b) => (kind === 'in_game' ? Number(!decorArt(a.title)) - Number(!decorArt(b.title)) : 0))
            if (items.length === 0) return null
            return (
              <div key={kind} className="mt-14">
                <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink pb-3">
                  <h2 className="text-d3 font-light">{label}</h2>
                  <span className="meta">{note}</span>
                </div>
                <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
                  {items.map((r) => (
                    <RewardCard
                      key={r.id}
                      reward={r}
                      owned={r.owned || (r.kind === 'in_game' && ownedDecor.has(r.id))}
                      preview={previews[r.id]}
                      spendable={spendable}
                      onCredit={onCredit}
                      onBuy={() => buy(r)}
                    />
                  ))}
                </ul>
              </div>
            )
          })}

        {wallet && wallet.owned.length > 0 && (
          <div className="mt-16">
            <h2 className="border-b border-ink pb-3 text-d3 font-light">Your stuff</h2>
            <ul>
              {wallet.owned.map((o) => (
                <li key={o.id} className="flex justify-between gap-4 border-b border-line py-4">
                  <span className="font-medium">{o.title}</span>
                  <span className="meta">
                    {formatMoney(o.price)} · {new Date(o.created_at).toLocaleDateString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {active && (
        <PurchaseFlow
          key={active.id}
          request={active}
          onClose={() => setActive(null)}
          onChange={() => void load().catch(() => {})}
        />
      )}
    </>
  )
}

function RewardCard({
  reward,
  owned,
  preview,
  spendable,
  onCredit,
  onBuy,
}: {
  reward: Reward
  owned: boolean
  preview: string | undefined
  spendable: number
  onCredit: boolean
  onBuy: () => void
}) {
  const short = Math.max(0, reward.price - spendable)
  const again = reward.available_again_at ? new Date(reward.available_again_at) : null
  const progress = reward.price > 0 ? Math.min(100, Math.round((spendable / reward.price) * 100)) : 100

  let blocker: string | null = null
  if (again) blocker = `Again on ${again.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
  else if (short > 0) blocker = onCredit ? `${formatMoney(short)} more than your credit left` : `${formatMoney(short)} to go`

  return (
    <li className="flex flex-col border border-line bg-white">
      <Visual reward={reward} preview={preview} />
      <div className="flex flex-1 flex-col border-t border-line p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium">{reward.title}</h3>
          <p className="shrink-0 font-medium tabular-nums text-brand">{formatMoney(reward.price)}</p>
        </div>
        {reward.description && <p className="mt-1 text-sm text-muted">{reward.description}</p>}
        {reward.kind === 'weekly' && reward.left_this_week !== null && (
          <p className="meta mt-2">
            {reward.weekly_limit === 1 ? 'Once a week' : `${reward.left_this_week} of ${reward.weekly_limit} left this week`}
          </p>
        )}
        {reward.kind === 'milestone' && (
          <div className="mt-3">
            <div
              className="h-2 w-full bg-sky"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Saved ${progress}%`}
            >
              <div className="h-full bg-signal" style={{ width: `${progress}%` }} />
            </div>
            <p className="meta mt-2">
              {progress}% {onCredit ? 'covered by your credit' : 'saved'}
            </p>
          </div>
        )}

        <div className="mt-auto pt-4">
          {owned ? (
            <ButtonLink
              to={reward.kind === 'led_skin' ? '/led' : '/decor'}
              size="sm"
              variant="light"
              className="w-full border border-brand"
            >
              {reward.kind === 'led_skin' ? 'Owned. Show it' : 'Owned. Place it'}
            </ButtonLink>
          ) : blocker ? (
            <p className="flex min-h-10 items-center justify-center bg-sky px-2 text-center text-sm text-muted">{blocker}</p>
          ) : (
            <Button size="sm" className="w-full" onClick={onBuy}>
              Buy
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

/** The picture on top of a tile: the live LED preview, the decor art, or a big blue initial. */
function Visual({ reward, preview }: { reward: Reward; preview: string | undefined }) {
  if (reward.kind === 'led_skin') {
    return preview ? (
      <LedGrid frame={preview} small label={`${reward.title} preview`} />
    ) : (
      <Skeleton className="aspect-square w-full" />
    )
  }
  const art = reward.kind === 'in_game' ? decorArt(reward.title) : null
  if (art) {
    // Absolutely placed so a tall image can never stretch the square; it shrinks to fit instead.
    return (
      <div className="relative aspect-square bg-sky">
        <img src={art} alt="" className="absolute inset-0 h-full w-full object-contain p-5" />
      </div>
    )
  }
  const label = { milestone: 'Big goal', weekly: 'Real-life treat', in_game: 'In-game', led_skin: 'LED skin' }[reward.kind]
  return (
    <div className="flex aspect-square flex-col justify-between bg-brand p-5 text-white">
      <span className="text-sm font-medium text-white/70">{label}</span>
      <span className="text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-light">{reward.title.charAt(0).toUpperCase()}</span>
    </div>
  )
}
