import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { formatMoney } from '../lib/money.ts'
import { shopApi, type Wallet } from '../shop/shopApi.ts'

/** The child's home: balance, ways to spend and earn, recent transactions. Credit comes later. */
export function ChildDashboard({ child }: { child: User }) {
  const [wallet, setWallet] = useState<Wallet | null>(null)

  useEffect(() => {
    shopApi.wallet().then(setWallet).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader marker="Your dashboard" title={`Hi, ${nameOf(child)}.`} />

      <section className="container-x py-10 md:py-14">
        <div className="grid gap-10 border-t border-ink pt-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="meta">Current balance</p>
            {wallet ? (
              <p className="mt-2 text-d1 font-light tabular-nums">{formatMoney(wallet.balance)}</p>
            ) : (
              <Skeleton className="mt-3 h-16 w-56" />
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/shop">Rewards</ButtonLink>
            <ButtonLink to="/earn" variant="light" className="border border-ink">
              Earn money
            </ButtonLink>
          </div>
        </div>

        <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Recent transactions</h2>
        {!wallet && <Skeleton className="mt-4 h-14 w-full" />}
        {wallet?.entries.length === 0 && (
          <p className="py-6 text-muted">Nothing yet. Do a job on the Earn page to get your first money.</p>
        )}
        <ul>
          {wallet?.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 border-b border-ink/15 py-4">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="meta mt-1">
                  {e.kind} · {new Date(e.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className={`tabular-nums ${e.amount < 0 ? '' : 'font-medium'}`}>
                {e.amount > 0 ? '+' : '−'}
                {formatMoney(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-12">
          <ButtonLink to="/profile" variant="light" className="border border-ink">
            Account and log out
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
