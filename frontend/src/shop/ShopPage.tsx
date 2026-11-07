import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, TextLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { formatMoney } from '../lib/money.ts'
import { PurchaseFlow } from './PurchaseFlow.tsx'
import { REWARD_KINDS, shopApi, type PurchaseRequest, type Reward, type Wallet } from './shopApi.ts'

/** Child: the rewards shop. Rows of in-game items, weekly treats and milestones. */
export function ShopPage() {
  const { user } = useAuth()
  if (user?.role === 'parent') return <Navigate to="/manage" replace />
  return <ChildShop />
}

function ChildShop() {
  const [rewards, setRewards] = useState<Reward[] | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [active, setActive] = useState<PurchaseRequest | null>(null)

  async function load() {
    const [r, w] = await Promise.all([shopApi.rewards(), shopApi.wallet()])
    setRewards(r)
    setWallet(w)
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
        title="Rewards."
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
          <div aria-busy="true" aria-label="Loading" className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        )}

        {rewards?.length === 0 && (
          <p className="mt-10 text-muted">Your shop is empty. Ask your parent to add some rewards.</p>
        )}

        {rewards &&
          REWARD_KINDS.map(({ kind, label, note }) => {
            const items = rewards.filter((r) => r.kind === kind)
            if (items.length === 0) return null
            return (
              <div key={kind} className="mt-12">
                <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
                  <h2 className="text-d3 font-light">{label}</h2>
                  <span className="meta">{note}</span>
                </div>
                <ul className="-mx-4 mt-6 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
                  {items.map((r) => (
                    <RewardCard key={r.id} reward={r} spendable={spendable} onCredit={onCredit} onBuy={() => buy(r)} />
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
                <li key={o.id} className="flex justify-between gap-4 border-b border-ink/15 py-4">
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
  spendable,
  onCredit,
  onBuy,
}: {
  reward: Reward
  spendable: number
  onCredit: boolean
  onBuy: () => void
}) {
  const short = Math.max(0, reward.price - spendable)
  const again = reward.available_again_at ? new Date(reward.available_again_at) : null
  const progress = Math.min(100, Math.round((spendable / reward.price) * 100))

  let blocker: string | null = null
  if (reward.owned) blocker = 'Owned. Equip it in LED Home'
  else if (again) blocker = `Again on ${again.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
  else if (short > 0) blocker = onCredit ? `${formatMoney(short)} more than your credit left` : `${formatMoney(short)} to go`

  return (
    <li className="flex w-60 shrink-0 snap-start flex-col border border-ink/15 bg-white p-5">
      <p className="meta">{formatMoney(reward.price)}</p>
      <h3 className="mt-2 text-d4 font-medium">{reward.title}</h3>
      {reward.description && <p className="mt-2 text-sm text-muted">{reward.description}</p>}

      {reward.kind === 'milestone' && (
        <div className="mt-4">
          <div className="h-2 w-full bg-ink/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Saved ${progress}%`}>
            <div className="h-full bg-signal" style={{ width: `${progress}%` }} />
          </div>
          <p className="meta mt-2">{progress}% {onCredit ? 'covered by your credit' : 'saved'}</p>
        </div>
      )}

      <div className="mt-auto pt-6">
        {blocker ? (
          <p className="text-sm text-muted">{blocker}</p>
        ) : (
          <Button size="sm" className="w-full" onClick={onBuy}>
            Buy
          </Button>
        )}
      </div>
    </li>
  )
}
