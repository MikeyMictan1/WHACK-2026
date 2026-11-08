import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { STATUS_LABEL, creditApi, formatDate, type CreditSummary } from '../credit/creditApi.ts'
import { money, pct } from '../lib/format.ts'
import { Bar } from '../monthly/ScoreSection.tsx'
import { CardImage } from './CardImage.tsx'

/** Child: their card as a picture, with what they can spend, what they owe and the card's terms. */
export function CardPage() {
  const { user } = useAuth()
  if (user && user.role !== 'child') return <Navigate to="/dashboard" replace />
  return <ChildCard />
}

function ChildCard() {
  const [c, setC] = useState<CreditSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    creditApi
      .get()
      .then(setC)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <>
      <PageHeader
        marker="Credit card"
        title={c ? c.card.name : 'Your card.'}
        description={
          c
            ? c.has_credit
              ? 'What you can spend, what you owe, and the rules of your card.'
              : 'A debit card: you spend your own money, so there is nothing to pay back.'
            : undefined
        }
      />

      <section className="container-x py-10 md:py-14">
        <FormError message={error} />
        {!c && !error && (
          <div aria-busy="true" aria-label="Loading" className="grid gap-10 lg:grid-cols-2">
            <Skeleton className="aspect-[860/601] w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        )}
        {c && <CardDetails c={c} />}
      </section>
    </>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="meta">{label}</dt>
      <dd className="mt-1 text-d4 tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  )
}

function CardDetails({ c }: { c: CreditSummary }) {
  const st = c.statement
  const terms: [string, string][] = c.has_credit
    ? [
        ['APR (yearly interest)', pct(c.card.apr_bp)],
        ['Cash back', c.card.rewards_bp ? pct(c.card.rewards_bp) : 'None'],
        ['Late fee', c.card.late_fee ? money(c.card.late_fee) : 'None'],
        ['Time to pay', `${c.grace_days} days after each statement`],
        ['Minimum payment', `${c.min_payment_percent}% or ${money(c.min_payment_floor)}, whichever is more`],
      ]
    : [
        ['APR', 'No interest'],
        ['How it works', 'Purchases come out of your own balance'],
      ]

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <CardImage cardId={c.card.id} name={c.card.name} />

        <div>
          {c.has_credit ? (
            <>
              <p className="meta">Credit left to spend</p>
              <p className="mt-2 text-d1 font-light tabular-nums text-brand">{money(c.available)}</p>
              <p className="mt-2 text-muted">of a {money(c.limit)} limit</p>
              <div className="mt-5">
                <Bar value={c.owed} max={Math.max(c.limit, 1)} label={`Using ${c.utilisation_pct}% of your limit`} />
              </div>
              <p className="meta mt-2">
                Using {c.utilisation_pct}% of your limit. Under 30% is the healthy zone.{' '}
                <TextLink to="/learn#utilisation" className="text-sm">
                  Why?
                </TextLink>
              </p>
            </>
          ) : (
            <>
              <p className="meta">Your balance</p>
              <p className="mt-2 text-d1 font-light tabular-nums text-brand">{money(c.wallet_balance)}</p>
            </>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {c.has_credit && <ButtonLink to="/review">{c.can_pay ? 'Pay your statement' : 'Monthly report'}</ButtonLink>}
            <ButtonLink to="/plans" variant="light" className="border border-brand">
              Change plan
            </ButtonLink>
          </div>
        </div>
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        <Stat label="You owe" value={money(c.owed)} note={c.unbilled ? `${money(c.unbilled)} not on a statement yet` : undefined} />
        <Stat label="Own money" value={money(c.wallet_balance)} />
        <Stat
          label="Next payment"
          value={st && c.can_pay ? money(st.remaining) : 'Nothing due'}
          note={st && c.can_pay ? `due ${formatDate(st.due_date)}` : undefined}
        />
        <Stat label="Next statement" value={formatDate(c.next_statement_date)} note={`your date is ${formatDate(c.sim_date)}`} />
        {c.score && (
          <Stat
            label="Credit score"
            value={String(c.score.score)}
            note={c.score.change ? `${c.score.change > 0 ? '+' : '−'}${Math.abs(c.score.change)} last month · ${c.score.band}` : c.score.band}
          />
        )}
      </dl>

      <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Card terms</h2>
      <dl>
        {terms.map(([term, value]) => (
          <div key={term} className="grid gap-1 border-b border-line py-4 sm:grid-cols-[240px_1fr] sm:gap-6">
            <dt className="meta pt-0.5">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {c.statements.length > 0 && (
        <>
          <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Statements</h2>
          <ul>
            {c.statements.slice(0, 6).map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line py-3">
                <span>
                  Statement {s.number} · {money(s.total)}
                  <span className="meta block">
                    issued {formatDate(s.statement_date)} · due {formatDate(s.due_date)}
                  </span>
                </span>
                <span className="text-sm">{STATUS_LABEL[s.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {c.activity.length > 0 && (
        <>
          <h2 className="mt-14 border-b border-ink pb-3 text-d3 font-light">Card activity</h2>
          <ul>
            {c.activity.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <span>
                  {e.description}
                  <span className="meta block">{formatDate(e.on_date)}</span>
                </span>
                <span className="tabular-nums">
                  {e.amount > 0 ? '+' : '−'}
                  {money(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
