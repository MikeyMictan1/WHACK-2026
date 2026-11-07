import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { money, pct, pctRange } from '../lib/format.ts'
import { plansApi, type CurrentPlan, type PlanOption, type PlansResponse } from './plansApi.ts'

/** /plans: the five cards, side by side in rows, with what each would cost this child. */
export function PlansPage() {
  const [data, setData] = useState<PlansResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    plansApi
      .get()
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <>
      <PageHeader
        marker="Change plan"
        title="Pick a plan."
        description="Compare the cards your parent has turned on. Choose one to talk to its seller and try for a better rate."
      />

      <section className="container-x py-10 md:py-14">
        <FormError message={error} />

        {!data && !error && (
          <div aria-busy="true" aria-label="Loading plans">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="mt-6 h-32 w-full" />
            <Skeleton className="mt-3 h-32 w-full" />
            <Skeleton className="mt-3 h-32 w-full" />
          </div>
        )}

        {data && (
          <>
            <CurrentSummary plan={data.current} />

            {data.switch_locked_reason && (
              <p className="mt-6 max-w-prose border border-ink/20 bg-sky px-5 py-4 text-sm">{data.switch_locked_reason}</p>
            )}

            <div className="mt-12 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
              <h2 className="text-d3 font-light tracking-[-0.02em]">Plans</h2>
              <p className="meta">
                {data.estimate_is_example
                  ? `Interest figures use an example balance of ${money(data.estimate_balance)}, so you can see the cost at real-life size.`
                  : `Interest figures use what you owe: ${money(data.estimate_balance)}.`}
              </p>
            </div>

            <ul>
              {data.options.map((option) => (
                <PlanRow key={option.id} option={option} />
              ))}
            </ul>

            <div className="mt-10">
              <TextLink to="/review">Back to your monthly review</TextLink>
            </div>
          </>
        )}
      </section>
    </>
  )
}

function CurrentSummary({ plan }: { plan: CurrentPlan }) {
  const rows = [
    ['Your plan', plan.card_name],
    ['APR', pct(plan.apr_bp)],
    ['Limit', plan.credit_limit ? money(plan.credit_limit) : 'Your own money'],
    ['Balance', money(plan.balance)],
    ['Credit score', String(plan.score)],
  ] as const

  return (
    <dl className="grid grid-cols-2 border-t border-ink md:grid-cols-5">
      {rows.map(([term, value]) => (
        <div key={term} className="border-b border-ink/15 py-5 pr-4">
          <dt className="meta">{term}</dt>
          <dd className="mt-1 text-d4">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PlanRow({ option }: { option: PlanOption }) {
  const locked = option.blocked_reason !== null && !option.is_current
  const stats = [
    ['APR', option.negotiable ? pctRange(option.typical_low_bp, option.typical_high_bp) : 'No interest'],
    ['Limit', option.credit_limit ? money(option.credit_limit) : 'Your own money'],
    ['Cash back', option.rewards_bp ? pct(option.rewards_bp) : 'None'],
    ['Late fee', option.late_fee ? money(option.late_fee) : 'None'],
    ['Interest a month', money(option.monthly_interest)],
  ] as const

  return (
    <li className="grid gap-6 border-b border-ink/15 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_200px] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className={`text-d4 font-medium ${locked ? 'text-muted' : ''}`}>{option.name}</h3>
          {option.is_current && <span className="bg-signal px-2 py-0.5 text-sm font-medium">Your plan</span>}
        </div>
        <p className="mt-2 max-w-sm text-muted">{option.pitch}</p>
      </div>

      <dl className={`grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5 ${locked ? 'text-muted' : ''}`}>
        {stats.map(([term, value]) => (
          <div key={term}>
            <dt className="meta">{term}</dt>
            <dd className="mt-1 font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="lg:justify-self-end">
        {option.is_current ? (
          <p className="meta">You are on this plan.</p>
        ) : locked ? (
          <p className="max-w-[200px] text-sm text-muted">{option.blocked_reason}</p>
        ) : (
          <ButtonLink to={`/plans/${option.id}/negotiate`} className="w-full lg:w-auto">
            {option.negotiable ? 'Negotiate' : 'Switch'}
          </ButtonLink>
        )}
      </div>
    </li>
  )
}
