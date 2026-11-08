import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Link } from 'react-router'
import { TextLink } from '../components/ui/Button.tsx'
import { CardImage } from '../card/CardImage.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { creditApi, formatDate, type CreditSummary } from '../credit/creditApi.ts'
import { formatMoney } from '../lib/money.ts'
import { PushToggle } from '../push/PushToggle.tsx'
import { DecorPanel } from '../decor/DecorPanel.tsx'
import { DecorTile } from '../decor/DecorTile.tsx'
import { decorApi, type DecorItem, type Spending } from '../decor/decorApi.ts'
import { Bar } from '../monthly/ScoreSection.tsx'
import { shopApi, type Wallet } from '../shop/shopApi.ts'

const ACTIONS = [
  { to: '/plans', label: 'Change plan', note: 'Compare cards, haggle a rate' },
  { to: '/review', label: 'Monthly report', note: 'Your statement and your month' },
  { to: '/card', label: 'Credit card info', note: 'Limit, APR, what you owe' },
  { to: '/shop', label: 'Shop', note: 'Treats, goals, decor, skins' },
  { to: '/earn', label: 'Missions', note: 'Do jobs, get paid' },
  { to: '/milestones', label: 'Milestones', note: 'Your big goals' },
  { to: '/led', label: 'LED Display', note: 'Pick what it shows' },
  { to: '/decor', label: 'Decorate', note: 'Arrange your dashboard' },
]

/** The child's home: balance, their card, big buttons to everything else, decor down both sides. */
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
      <PageHeader marker="Dashboard" title={`Hi, ${nameOf(child)}.`} />

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

            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:items-center">
              <div>
                <p className="meta">Your money</p>
                {wallet ? (
                  <p className="mt-2 text-d1 font-light tabular-nums text-brand">{formatMoney(wallet.balance)}</p>
                ) : (
                  <Skeleton className="mt-3 h-16 w-56" />
                )}
                {credit?.has_credit && (
                  <p className="mt-3 text-lead">
                    {formatMoney(credit.available)} <span className="text-muted">credit left on your card</span>
                  </p>
                )}
              </div>
              {credit ? (
                <Link to="/card" aria-label={`${credit.card.name}: card details`} className="block hover:opacity-90">
                  <CardImage cardId={credit.card.id} name={credit.card.name} />
                </Link>
              ) : (
                <Skeleton className="aspect-[860/601] w-full" />
              )}
            </div>

            <nav aria-label="Go to" className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ACTIONS.map((a, i) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className={`flex min-h-28 flex-col justify-between p-4 text-white hover:bg-signal md:min-h-32 md:p-5 ${
                    i < 3 ? 'bg-brand' : 'bg-ink-2'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2 text-lg leading-tight font-medium md:text-xl">
                    {a.label}
                    <span aria-hidden>↗</span>
                  </span>
                  <span className="text-sm text-white/75">{a.note}</span>
                </Link>
              ))}
            </nav>

            {credit && <CardGlance credit={credit} />}

            <div className="grid gap-x-10 lg:grid-cols-2">
              <SpendingChart spending={spending} />
              <div>
                <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Recent transactions</h2>
                {!wallet && <Skeleton className="mt-4 h-14 w-full" />}
                {wallet?.entries.length === 0 && (
                  <p className="py-6 text-muted">Nothing yet. Do a mission to get your first money.</p>
                )}
                <ul>
                  {wallet?.entries.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-4 border-b border-line py-4">
                      <div>
                        <p className="font-medium">{e.description}</p>
                        <p className="meta mt-1">
                          {e.kind} · {new Date(e.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <span className={`tabular-nums ${e.amount < 0 ? '' : 'font-medium text-brand'}`}>
                        {e.amount > 0 ? '+' : '−'}
                        {formatMoney(Math.abs(e.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-12">
              <PushToggle what="when your parent approves what you want to buy" />
              <TextLink to="/profile" className="mt-6 inline-block">
                Account and log out
              </TextLink>
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
