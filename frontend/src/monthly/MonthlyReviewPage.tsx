import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { money, pct } from '../lib/format.ts'
import { plansApi, type CurrentPlan } from '../plans/plansApi.ts'

/**
 * /review: where the child stands at the end of the month. The "Change plan?" button is always here.
 * The AI story of the month (DESIGN.md section 9) will go above the numbers.
 */
export function MonthlyReviewPage() {
  const [plan, setPlan] = useState<CurrentPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    plansApi
      .get()
      .then((r) => setPlan(r.current))
      .catch((err: Error) => setError(err.message))
  }, [])

  const rows = plan
    ? ([
        ['Credit score', String(plan.score)],
        ['Plan', plan.card_name],
        ['APR', pct(plan.apr_bp)],
        ['Balance', money(plan.balance)],
        ['Limit used', plan.credit_limit ? `${plan.utilisation_pct}% of ${money(plan.credit_limit)}` : 'Not applicable'],
        ['Paid on time in a row', `${plan.on_time_streak} months`],
        ['Interest this month', money(plan.interest_this_month)],
      ] as const)
    : []

  return (
    <>
      <PageHeader
        marker="Monthly review"
        title="Your month."
        description="Your credit score and plan at the end of the month."
      />

      <section className="container-x py-10 md:py-14">
        <FormError message={error} />

        {!plan && !error && (
          <div aria-busy="true" aria-label="Loading">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="mt-3 h-14 w-full" />
            <Skeleton className="mt-3 h-14 w-full" />
          </div>
        )}

        {plan && (
          <dl className="border-t border-ink">
            {rows.map(([term, value]) => (
              <div key={term} className="grid gap-1 border-b border-ink/15 py-5 sm:grid-cols-[240px_1fr] sm:gap-6">
                <dt className="meta pt-1">{term}</dt>
                <dd className="text-d4">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-6">
          <ButtonLink to="/plans">Change plan?</ButtonLink>
          <TextLink to="/dashboard">Back to dashboard</TextLink>
        </div>
      </section>
    </>
  )
}
