import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { creditApi, formatDate, type CreditSummary } from '../credit/creditApi.ts'
import { formatMoney } from '../lib/money.ts'
import { PushToggle } from '../push/PushToggle.tsx'
import { DecorPanel } from '../decor/DecorPanel.tsx'
import { DecorTile } from '../decor/DecorTile.tsx'
import { decorApi, type DecorItem, type Spending } from '../decor/decorApi.ts'
import { Bar } from '../monthly/ScoreSection.tsx'
import { shopApi, type Wallet } from '../shop/shopApi.ts'

/** The child's home: balance, their card, ways to spend and earn, recent transactions. */
export function ChildDashboard({ child }: { child: User }) {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [credit, setCredit] = useState<CreditSummary | null>(null)

  const [decor, setDecor] = useState<DecorItem[]>([])
  const [spending, setSpending] = useState<Spending | null>(null)

  useEffect(() => {
    shopApi.wallet().then(setWallet).catch(() => {})
    creditApi.get().then(setCredit).catch(() => {})
    decorApi.get().then((d) => setDecor(d.items)).catch(() => {})
    decorApi.spending().then(setSpending).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader marker="Your dashboard" title={`Hi, ${nameOf(child)}.`} />

      <section className="container-x py-10 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[150px_minmax(0,1fr)_150px]">
        <div className="hidden lg:block">
          <DecorPanel side="left" items={decor} />
        </div>
        <div>
        {decor.some((i) => i.side) && (
          <ul className="mb-8 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:hidden">
            {decor
              .filter((i) => i.side)
              .map((i) => (
                <li key={i.reward_id}>
                  <DecorTile item={i} />
                </li>
              ))}
          </ul>
        )}
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
            <ButtonLink to="/decor" variant="light" className="border border-ink">
              Decor
            </ButtonLink>
          </div>
        </div>

        {credit && <CardGlance credit={credit} />}

        <SpendingChart spending={spending} />

        <div className="mt-10">
          <PushToggle what="when your parent approves what you want to buy" />
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
                  {e.kind} · {new Date(e.created_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <span className={`tabular-nums ${e.amount < 0 ? '' : 'font-medium'}`}>
                {e.amount > 0 ? '+' : '−'}
                {formatMoney(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap gap-3">
          <ButtonLink to="/review">Monthly review</ButtonLink>
          <ButtonLink to="/profile" variant="light" className="border border-ink">
            Account and log out
          </ButtonLink>
        </div>
        </div>
        <div className="hidden lg:block">
          <DecorPanel side="right" items={decor} />
        </div>
        </div>
      </section>
    </>
  )
}

/** Where the child's money has gone so far, by kind of item. */
function SpendingChart({ spending }: { spending: Spending | null }) {
  return (
    <>
      <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Where your money went</h2>
      {!spending && <Skeleton className="mt-4 h-24 w-full" />}
      {spending && spending.rows.length === 0 && <p className="py-6 text-muted">You have not bought anything yet.</p>}
      {spending && spending.rows.length > 0 && (
        <>
          <ul className="mt-4 flex flex-col gap-4">
            {spending.rows.map((r) => (
              <li key={r.key}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium">
                    {r.label} <span className="text-muted">({r.count})</span>
                  </p>
                  <p className="tabular-nums">{formatMoney(r.total)}</p>
                </div>
                <div className="mt-2">
                  <Bar value={r.total} max={Math.max(spending.total, 1)} label={`${r.label}: ${formatMoney(r.total)} of ${formatMoney(spending.total)}`} />
                </div>
              </li>
            ))}
          </ul>
          <p className="meta mt-4">Total spent {formatMoney(spending.total)}</p>
        </>
      )}
    </>
  )
}

/** The child's card on the home page: what is left to spend and when the next payment is due. */
function CardGlance({ credit }: { credit: CreditSummary }) {
  const st = credit.statement
  const nextPayment = st && credit.can_pay ? `${formatMoney(st.remaining)} by ${formatDate(st.due_date)}` : 'Nothing due'
  const rows: [string, string][] = credit.has_credit
    ? [
        ['Your card', credit.card.name],
        ['Credit left', `${formatMoney(credit.available)} of ${formatMoney(credit.limit)}`],
        ['You owe', formatMoney(credit.owed)],
        ['Next payment', nextPayment],
      ]
    : [
        ['Your card', credit.card.name],
        ['How it works', 'You spend your own money'],
      ]
  const score = credit.score // null when the parent has switched score tracking off
  if (score) {
    rows.push(['Credit score', `${score.score}${score.change ? ` (${score.change > 0 ? '+' : '−'}${Math.abs(score.change)})` : ''}`])
  }

  return (
    <>
      <dl className={`mt-10 grid grid-cols-2 border-t border-ink ${rows.length > 4 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
        {rows.map(([term, value]) => (
          <div key={term} className="border-b border-ink/15 py-5 pr-4">
            <dt className="meta">{term}</dt>
            <dd className="mt-1 text-d4">{value}</dd>
          </div>
        ))}
      </dl>
      {score && (
        <p className="mt-4 text-sm">
          {score.band}. <TextLink to="/learn#score">How your credit score works</TextLink>
        </p>
      )}
    </>
  )
}
