import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import {
  STATUS_LABEL,
  creditApi,
  formatDate,
  type CreditSummary,
  type PayResult,
  type Statement,
} from '../credit/creditApi.ts'
import { pct } from '../lib/format.ts'
import { formatMoney, parseMoney } from '../lib/money.ts'
import { PhoneTapButton } from '../nfc/PhoneTapButton.tsx'
import { skipMessage } from '../dashboard/skipMessage.ts'
import { ScoreSection } from './ScoreSection.tsx'
import { StorySection } from './StorySection.tsx'

/**
 * /review: the story of the month, the child's card, the latest statement, and what to do about it.
 * The "Change plan?" button is always here.
 */
export function MonthlyReviewPage() {
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    creditApi
      .get()
      .then(setSummary)
      .catch((err: Error) => setError(err.message))
  }, [])

  const [skipping, setSkipping] = useState(false)

  async function onNextMonth() {
    const ok = window.confirm(
      'Move on to next month? Your statement closes: anything you have not paid gets interest, and paying less ' +
        'than the minimum adds a late fee. You get 4 weeks of allowance and a new statement. It cannot be undone.',
    )
    if (!ok) return
    setSkipping(true)
    try {
      const result = await creditApi.skipMyMonth()
      setSummary(await creditApi.get())
      showToast(skipMessage(result, true))
      window.scrollTo({ top: 0 })
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSkipping(false)
    }
  }

  function onPaid(result: PayResult) {
    setSummary(result.summary)
    showToast(
      result.cash_back > 0
        ? `Paid ${formatMoney(result.paid)}. You earned ${formatMoney(result.cash_back)} cash back.`
        : `Paid ${formatMoney(result.paid)}.`,
    )
  }

  return (
    <>
      <PageHeader
        marker="Monthly review"
        title="Your month."
        description="Your card, your statement and what to do next."
      />

      <section className="container-x py-10 md:py-14">
        <FormError message={error} />

        {!summary && !error && (
          <div aria-busy="true" aria-label="Loading">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="mt-6 h-64 w-full" />
          </div>
        )}

        {summary && (
          <>
            <StorySection refreshKey={`${summary.statement?.number ?? 0}-${summary.statement?.status ?? ''}`} />
            <CardSummary summary={summary} />
            <ScoreSection summary={summary} />

            {summary.has_credit ? (
              <>
                <StatementSection summary={summary} onPaid={onPaid} />
                <SoFarSection summary={summary} />
                <RealLifeSection summary={summary} />
                <HistorySection summary={summary} />
                <ActivitySection summary={summary} />
              </>
            ) : (
              <p className="mt-10 max-w-prose text-lead text-muted">
                You are on a debit card, so you spend your own money and there is no statement to pay. Switch to a
                credit card to see how statements, interest and cash back work.
              </p>
            )}

            <div className="mt-14 border-t border-ink pt-8">
              {summary.switch_locked_reason && <p className="mb-5 max-w-prose text-sm">{summary.switch_locked_reason}</p>}
              <div className="flex flex-wrap items-center gap-6">
                <Button onClick={onNextMonth} disabled={skipping}>
                  {skipping ? 'Moving on...' : 'Next month'}
                </Button>
                <ButtonLink to="/plans">Change plan?</ButtonLink>
                <TextLink to="/learn#statements">How statements work</TextLink>
                <TextLink to="/dashboard">Back to dashboard</TextLink>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}

// ---- the card ------------------------------------------------------------------------------

function CardSummary({ summary }: { summary: CreditSummary }) {
  const rows = summary.has_credit
    ? ([
        ['Your card', summary.card.name],
        ['APR', pct(summary.card.apr_bp)],
        ['You owe', formatMoney(summary.owed)],
        ['Credit left', `${formatMoney(summary.available)} of ${formatMoney(summary.limit)}`],
        ['Your date', formatDate(summary.sim_date)],
      ] as const)
    : ([
        ['Your card', summary.card.name],
        ['Your balance', formatMoney(summary.wallet_balance)],
        ['Your date', formatDate(summary.sim_date)],
      ] as const)

  return (
    <dl className={`grid grid-cols-2 border-t border-ink ${summary.has_credit ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
      {rows.map(([term, value]) => (
        <div key={term} className="border-b border-ink/15 py-5 pr-4">
          <dt className="meta">{term}</dt>
          <dd className="mt-1 text-d4">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---- the latest statement ------------------------------------------------------------------------

function StatementSection({ summary, onPaid }: { summary: CreditSummary; onPaid: (r: PayResult) => void }) {
  const st = summary.statement

  return (
    <div className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light tracking-[-0.02em]">{st ? `Statement ${st.number}` : 'Your statement'}</h2>
        {st && <p className="meta">{STATUS_LABEL[st.status]}</p>}
      </div>

      {!st && (
        <p className="mt-6 max-w-prose text-muted">
          No statement yet. Your first one is issued on {formatDate(summary.next_statement_date)}, at the end of your first
          month. Until then, what you buy on your card builds up here.
        </p>
      )}

      {st && (
        <>
          <StatementTable st={st} />

          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            <Fact term="Due date" value={formatDate(st.due_date)} />
            <Fact term="Minimum payment" value={formatMoney(st.minimum)} />
            <Fact term="Left to pay" value={formatMoney(st.remaining)} />
          </dl>

          {st.cash_back > 0 && (
            <p className="mt-6 max-w-prose text-sm">
              {st.cash_back_paid
                ? `You earned ${formatMoney(st.cash_back)} cash back on this statement.`
                : st.status === 'open'
                  ? `Pay it in full by the due date to earn ${formatMoney(st.cash_back)} cash back.`
                  : `The ${formatMoney(st.cash_back)} cash back on this statement was not paid out, because it was not paid in full by the due date.`}
            </p>
          )}

          {summary.can_pay ? (
            <PayPanel summary={summary} statement={st} onPaid={onPaid} />
          ) : (
            <p className="mt-6 max-w-prose text-muted">
              {st.total === 0
                ? 'You owed nothing on this statement, so there is nothing to pay.'
                : st.status === 'paid'
                  ? 'Paid in full. Nicely done: paying in full by the due date means no interest.'
                  : 'The due date has passed for this statement.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function StatementTable({ st }: { st: Statement }) {
  const rows: [string, number][] = [
    ['Carried over from the last statement', st.carried],
    ['Purchases', st.purchases],
    ['Interest', st.interest],
    ['Fees', st.fees],
  ]
  return (
    <table className="mt-6 w-full text-left">
      <caption className="sr-only">Statement {st.number} breakdown</caption>
      <tbody>
        {rows.map(([label, amount]) => (
          <tr key={label} className="border-b border-ink/15">
            <th scope="row" className="py-3 pr-4 font-normal text-muted">
              {label}
            </th>
            <td className="py-3 text-right tabular-nums">{formatMoney(amount)}</td>
          </tr>
        ))}
        <tr className="border-b border-ink">
          <th scope="row" className="py-4 pr-4 font-medium">
            Total
          </th>
          <td className="py-4 text-right text-d4 font-medium tabular-nums">{formatMoney(st.total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="meta">{term}</dt>
      <dd className="mt-1 text-d4">{value}</dd>
    </div>
  )
}

// ---- paying -----------------------------------------------------------------------------------------

function PayPanel({
  summary,
  statement,
  onPaid,
}: {
  summary: CreditSummary
  statement: Statement
  onPaid: (r: PayResult) => void
}) {
  const [custom, setCustom] = useState('')
  const [devSimulate, setDevSimulate] = useState(false) // dev builds only: pay without a card
  const [waitingFor, setWaitingFor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const attempt = useRef(0) // only the latest payment attempt may clear the waiting screen

  const wallet = summary.wallet_balance
  const remaining = statement.remaining
  const toMinimum = Math.max(0, statement.minimum - statement.paid)
  const customAmount = parseMoney(custom)

  async function pay(amount: number, simulate: boolean, cardUid?: string) {
    const id = ++attempt.current
    setError(null)
    setWaitingFor(amount)
    const c = new AbortController()
    ctrl.current = c
    try {
      onPaid(await creditApi.pay(amount, simulate, c.signal, cardUid))
      setCustom('')
    } catch (err) {
      if (!c.signal.aborted) setError((err as Error).message)
    } finally {
      if (attempt.current === id) setWaitingFor(null)
    }
  }

  /** Stop waiting for a tap (the Back button). */
  function cancel() {
    attempt.current++
    ctrl.current?.abort()
    void creditApi.cancelPay().catch(() => {})
    setWaitingFor(null)
  }

  /** Dev backup: stop waiting for the reader and pay without a card. */
  function simulate(amount: number) {
    ctrl.current?.abort()
    void creditApi.cancelPay().catch(() => {})
    void pay(amount, true)
  }

  if (waitingFor !== null) {
    return (
      <div className="mt-8 border border-ink bg-signal p-6">
        <p className="text-d4 font-medium">Tap your card on the reader to pay {formatMoney(waitingFor)}.</p>
        <p className="mt-1">Waiting for up to 30 seconds.</p>
        <FormError message={error} />
        <div className="mt-5 flex flex-wrap gap-3">
          <PhoneTapButton
            onError={setError}
            onTap={async (uid) => {
              // The phone read the card: stop the reader wait and pay with this card instead.
              ctrl.current?.abort()
              await pay(waitingFor, false, uid)
            }}
          />
          {import.meta.env.DEV && (
            <Button variant="onAccent" onClick={() => simulate(waitingFor)}>
              Simulate tap (dev)
            </Button>
          )}
          <Button variant="onAccent" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const tooMuch = customAmount !== null && customAmount > remaining
  const short = customAmount !== null && customAmount > wallet

  return (
    <div className="mt-8 border border-ink/20 bg-white p-5 md:p-6">
      <p className="meta">Pay from your balance of {formatMoney(wallet)}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => void pay(remaining, devSimulate)} disabled={wallet < remaining}>
          Pay in full: {formatMoney(remaining)}
        </Button>
        {toMinimum > 0 && toMinimum < remaining && (
          <Button variant="light" className="border border-ink" onClick={() => void pay(toMinimum, devSimulate)} disabled={wallet < toMinimum}>
            Pay the minimum: {formatMoney(toMinimum)}
          </Button>
        )}
      </div>
      {wallet < remaining && (
        <p className="mt-3 text-sm text-muted">You need {formatMoney(remaining - wallet)} more in your balance to pay in full.</p>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (customAmount !== null && !tooMuch && !short) void pay(customAmount, devSimulate)
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="pay-custom" className="text-sm font-medium">
            Or pay another amount
          </label>
          <input
            id="pay-custom"
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="5.00"
            className="h-12 w-40 border border-ink/20 bg-white px-4 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink"
          />
        </div>
        <Button type="submit" variant="light" className="border border-ink" disabled={customAmount === null || tooMuch || short}>
          Pay
        </Button>
      </form>
      {tooMuch && <p className="mt-3 text-sm text-muted">That is more than the {formatMoney(remaining)} you owe on this statement.</p>}
      {short && !tooMuch && <p className="mt-3 text-sm text-muted">That is more than your balance.</p>}

      {import.meta.env.DEV && (
        <label className="mt-6 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={devSimulate} onChange={(e) => setDevSimulate(e.target.checked)} className="size-4 accent-ink" />
          Simulate the card tap (dev)
        </label>
      )}

      <p className="mt-6 max-w-prose text-sm text-muted">
        Pay the whole statement by the due date and you pay no interest. Pay at least the minimum or the payment counts as
        late
        {summary.card.late_fee > 0 ? ` and costs a ${formatMoney(summary.card.late_fee)} late fee` : ''}. Whatever you leave
        unpaid is charged interest at {pct(summary.card.apr_bp)} a year.
      </p>

      <div className="mt-4">
        <FormError message={error} />
      </div>
    </div>
  )
}

// ---- the rest of the page ---------------------------------------------------------------------------------

function SoFarSection({ summary }: { summary: CreditSummary }) {
  return (
    <div className="mt-12">
      <h2 className="border-b border-ink pb-4 text-d3 font-light tracking-[-0.02em]">This month so far</h2>
      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        <Fact term="Bought on your card" value={formatMoney(summary.unbilled)} />
        <Fact term="Credit left" value={formatMoney(summary.available)} />
        <Fact term="Next statement" value={formatDate(summary.next_statement_date)} />
      </dl>
    </div>
  )
}

function RealLifeSection({ summary }: { summary: CreditSummary }) {
  return (
    <div className="mt-12 border border-ink/20 bg-sky p-6">
      <p className="meta text-ink/70">At real-life size</p>
      <p className="mt-2 max-w-prose text-lead">
        At {pct(summary.card.apr_bp)} APR, if you owed {formatMoney(summary.example_balance)} for a month, this card would
        charge {formatMoney(summary.example_interest)} in interest. Pay in full by the due date and it would cost nothing.
        Your amounts are small, so the interest is too. The habit is the same.
      </p>
    </div>
  )
}

function HistorySection({ summary }: { summary: CreditSummary }) {
  const older = summary.statements.slice(1)
  if (older.length === 0) return null
  return (
    <div className="mt-12">
      <h2 className="border-b border-ink pb-4 text-d3 font-light tracking-[-0.02em]">Earlier statements</h2>
      <ul>
        {older.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 py-4">
            <div>
              <p className="font-medium">Statement {s.number}</p>
              <p className="meta mt-1">
                {formatDate(s.statement_date)} · {STATUS_LABEL[s.status]}
              </p>
            </div>
            <p className="tabular-nums">{formatMoney(s.total)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActivitySection({ summary }: { summary: CreditSummary }) {
  if (summary.activity.length === 0) return null
  return (
    <div className="mt-12">
      <h2 className="border-b border-ink pb-4 text-d3 font-light tracking-[-0.02em]">Card activity</h2>
      <ul>
        {summary.activity.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4 border-b border-ink/15 py-4">
            <div>
              <p className="font-medium">{e.description}</p>
              <p className="meta mt-1">
                {e.kind.replace('_', ' ')} · {formatDate(e.on_date)}
              </p>
            </div>
            <span className={`tabular-nums ${e.amount < 0 ? '' : 'font-medium'}`}>
              {e.amount < 0 ? '−' : '+'}
              {formatMoney(Math.abs(e.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
