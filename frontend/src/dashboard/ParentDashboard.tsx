import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { nameOf, type User } from '../auth/types.ts'
import { CardImage } from '../card/CardImage.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { creditApi, formatDate, type ChildCredit } from '../credit/creditApi.ts'
import { formatMoney } from '../lib/money.ts'
import { PushToggle } from '../push/PushToggle.tsx'
import { shopApi } from '../shop/shopApi.ts'
import { childrenApi, type Child } from './childrenApi.ts'
import { ParentApprovals } from './ParentApprovals.tsx'

/** The parent's home: approvals, then one tile per kid that opens that kid's own dashboard. */
export function ParentDashboard({ parent }: { parent: User }) {
  const [children, setChildren] = useState<Child[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [credit, setCredit] = useState<Record<number, ChildCredit>>({})

  function loadBalances() {
    shopApi.balances().then(setBalances).catch(() => {})
    creditApi
      .children()
      .then((list) => setCredit(Object.fromEntries(list.map((c) => [c.child_id, c]))))
      .catch(() => {})
  }

  useEffect(() => {
    childrenApi
      .list()
      .then(setChildren)
      .catch((err: Error) => setLoadError(err.message))
    loadBalances()
  }, [])

  return (
    <>
      <PageHeader
        marker="Dashboard"
        title={`Hi, ${nameOf(parent)}.`}
        description="Approve what your kids ask for, and open any of them to see how they are doing."
      />

      <section className="container-x py-10 md:py-14">
        {children && children.length > 0 && <ParentApprovals onChange={loadBalances} />}

        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
          <h2 className="text-d3 font-light tracking-[-0.02em]">Your kids</h2>
          {children && <ButtonLink to="/dashboard/children/new">Add child</ButtonLink>}
        </div>

        {loadError && (
          <div className="mt-6">
            <FormError message={loadError} />
          </div>
        )}

        {!children && !loadError && (
          <div aria-busy="true" aria-label="Loading" className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        )}

        {children && children.length === 0 && (
          <div className="mt-6 border border-line bg-sky p-8">
            <p className="text-d4">No child accounts yet.</p>
            <p className="mt-2 text-muted">Add one to give them a card, an allowance and a shop.</p>
            <ButtonLink to="/dashboard/children/new" className="mt-6">
              Add your first child
            </ButtonLink>
          </div>
        )}

        {children && children.length > 0 && (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {children.map((child) => (
              <li key={child.id}>
                <ChildTile child={child} credit={credit[child.id]} balance={balances[child.id] ?? 0} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-14 grid gap-3 sm:grid-cols-2">
          <Link to="/manage" className="flex min-h-24 flex-col justify-between bg-brand p-5 text-white hover:bg-signal">
            <span className="flex justify-between text-xl font-medium">
              Shop and chores <span aria-hidden>↗</span>
            </span>
            <span className="text-sm text-white/75">What your kids can buy and the jobs that pay</span>
          </Link>
          <Link to="/profile" className="flex min-h-24 flex-col justify-between bg-ink-2 p-5 text-white hover:bg-signal">
            <span className="flex justify-between text-xl font-medium">
              Account settings <span aria-hidden>↗</span>
            </span>
            <span className="text-sm text-white/75">Your login, and log out</span>
          </Link>
        </div>

        <div className="mt-10">
          <PushToggle what="when your kids ask to buy something or finish a chore" />
        </div>
      </section>
    </>
  )
}

/** One kid: their card, money and next payment. The whole tile opens their dashboard. */
function ChildTile({ child, credit, balance }: { child: Child; credit: ChildCredit | undefined; balance: number }) {
  const payable =
    credit !== undefined && credit.statement_number !== null && credit.status === 'open' && (credit.statement_remaining ?? 0) > 0
  const stats: [string, string][] = credit
    ? [
        ['Balance', formatMoney(balance)],
        [credit.has_credit ? 'Owes on card' : 'Card', credit.has_credit ? formatMoney(credit.owed) : 'Debit'],
        [
          'Next payment',
          !credit.has_credit
            ? 'Nothing to pay'
            : payable
              ? `${formatMoney(credit.statement_remaining ?? 0)} by ${formatDate(credit.due_date ?? credit.sim_date)}`
              : 'Nothing due',
        ],
      ]
    : []
  if (credit && credit.score !== null) stats.push(['Credit score', String(credit.score)])

  return (
    <Link
      to={`/dashboard/children/${child.id}`}
      className="group flex h-full flex-col border border-line bg-white hover:border-brand"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-4 bg-brand p-5 text-white group-hover:bg-brand-2 sm:grid-cols-[minmax(0,1fr)_170px]">
        <div>
          <p className="text-d3 font-light">{nameOf(child)}</p>
          <p className="mt-1 text-sm text-white/75">
            @{child.username}
            {child.weekly_allowance != null && ` · ${formatMoney(child.weekly_allowance)} a week`}
          </p>
          {credit && <p className="mt-3 text-sm font-medium">{credit.card_name}</p>}
        </div>
        {credit ? (
          <CardImage cardId={credit.card_id} name={credit.card_name} />
        ) : (
          <Skeleton className="aspect-[860/601] w-full" />
        )}
      </div>
      {credit ? (
        <dl className="grid flex-1 grid-cols-2 gap-px bg-line [&>*:last-child:nth-child(odd)]:col-span-2">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-4">
              <dt className="meta">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Skeleton className="m-5 h-20" />
      )}
      <p className="flex items-center justify-between border-t border-line px-5 py-3 text-[15px] font-medium text-brand group-hover:bg-signal group-hover:text-white">
        Open {nameOf(child)}’s dashboard <span aria-hidden>↗</span>
      </p>
    </Link>
  )
}
