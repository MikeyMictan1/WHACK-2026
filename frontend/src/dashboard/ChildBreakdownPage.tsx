import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { nameOf } from '../auth/types.ts'
import { creditApi } from '../credit/creditApi.ts'
import { CURRENCY_LABEL, parseMoney } from '../lib/money.ts'
import { shopApi } from '../shop/shopApi.ts'
import { ChildForm } from './ChildForm.tsx'
import { childrenApi, type Child } from './childrenApi.ts'
import { skipMessage } from './skipMessage.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { STATUS_LABEL, formatDate } from '../credit/creditApi.ts'
import { formatMoney } from '../lib/money.ts'
import { signed } from '../lib/format.ts'
import { Bar, FactorRow, Reasons, ScoreChart } from '../monthly/ScoreSection.tsx'
import { CardImage } from '../card/CardImage.tsx'
import { breakdownApi, type Breakdown, type BreakdownRow, type Recap } from './breakdownApi.ts'

/** A parent's dashboard for one child: actions, the numbers, the score and how it moved, and a written recap. */
export function ChildBreakdownPage() {
  const { childId } = useParams()
  const id = Number(childId)
  const navigate = useNavigate()
  const [data, setData] = useState<Breakdown | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)

  function reload() {
    breakdownApi
      .get(id)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    breakdownApi
      .get(id)
      .then(setData)
      .catch((err: Error) => setError(err.message))
    childrenApi
      .list()
      .then((list) => setChild(list.find((c) => c.id === id) ?? null))
      .catch(() => {})
  }, [id])

  const name = child ? nameOf(child) : (data?.child_name ?? 'them')

  async function onBonus() {
    const input = window.prompt(`Give ${name} a bonus. How much (${CURRENCY_LABEL})?`, '5.00')
    if (input === null) return
    const amount = parseMoney(input)
    if (amount === null) return showToast('Enter an amount like 5.00', 'error')
    try {
      await shopApi.bonus(id, amount, 'Bonus from parent')
      reload()
      showToast(`Gave ${name} ${formatMoney(amount)}`)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function onSkip() {
    const ok = window.confirm(
      `Skip a month for ${name}? It pays 4 weeks of allowance, closes their statement, charges interest or a ` +
        'late fee if they have not paid, and issues a new statement. It cannot be undone.',
    )
    if (!ok) return
    try {
      const result = await creditApi.skipMonth(id)
      reload()
      showToast(skipMessage(result))
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function onRemove() {
    if (!window.confirm(`Remove ${name}'s account? This deletes their account and data.`)) return
    try {
      await childrenApi.remove(id)
      showToast(`${name}'s account was removed`)
      navigate('/dashboard')
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function writeRecap() {
    setWriting(true)
    try {
      const recap = await breakdownApi.writeRecap(id)
      setData((d) => (d ? { ...d, recap } : d))
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setWriting(false)
    }
  }

  return (
    <>
      <PageHeader
        marker="Parent dashboard"
        title={data ? data.child_name : 'Breakdown'}
        description="Where the money went, how the credit score moved and why."
      />

      <section className="container-x py-10 md:py-14">
        <TextLink to="/dashboard">Back to your kids</TextLink>

        <div className="mt-6 flex flex-wrap gap-3 border-y border-line py-4">
          <Button size="sm" onClick={onBonus}>
            Give bonus
          </Button>
          <Button size="sm" variant="light" className="border border-brand" onClick={onSkip}>
            Skip a month
          </Button>
          <Button size="sm" variant="light" className="border border-brand" onClick={() => setEditing((e) => !e)} disabled={!child}>
            {editing ? 'Close settings' : 'Edit settings'}
          </Button>
          <Button size="sm" variant="light" className="border border-brand" onClick={onRemove}>
            Remove
          </Button>
        </div>

        {editing && child && (
          <div className="mt-6 border border-line p-6">
            <ChildForm
              mode="edit"
              child={child}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                setChild(await childrenApi.update(child.id, input))
                setEditing(false)
                reload()
                showToast(input.password ? 'Saved. The new password works now.' : 'Saved')
              }}
            />
          </div>
        )}

        {error && (
          <div className="mt-6">
            <FormError message={error} />
          </div>
        )}
        {!data && !error && (
          <div aria-busy="true" aria-label="Loading">
            <Skeleton className="mt-8 h-24 w-full" />
            <Skeleton className="mt-4 h-48 w-full" />
          </div>
        )}

        {data && (
          <>
            <div className="mt-8 grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
              <CardImage cardId={data.summary.card.id} name={data.summary.card.name} className="max-w-[300px]" />
              <Stats d={data} />
            </div>
            <RecapSection recap={data.recap} writing={writing} onWrite={writeRecap} />
            <Money d={data} />
            <ScoreBlock d={data} />
            <Transactions d={data} />
            <Statements d={data} />
          </>
        )}
      </section>
    </>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <div className="mt-14 border-b border-ink pb-4">
      <h2 className="text-d3 font-light tracking-[-0.02em]">{children}</h2>
    </div>
  )
}

function Stats({ d }: { d: Breakdown }) {
  const s = d.summary
  const stats = [
    { label: 'Own balance', value: formatMoney(s.wallet_balance) },
    { label: s.card.name, value: s.has_credit ? `Owes ${formatMoney(s.owed)}` : 'Debit', note: s.has_credit ? `limit ${formatMoney(s.limit)}` : undefined },
    { label: 'Credit score', value: String(d.score.score), note: d.score.change ? `${signed(d.score.change)} last month` : d.score.band },
    {
      label: 'Next payment',
      value:
        s.statement && s.can_pay ? `${formatMoney(s.statement.remaining)} due ${formatDate(s.statement.due_date)}` : 'Nothing to pay',
      note: `their date ${formatDate(s.sim_date)}`,
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
      {stats.map((st) => (
        <div key={st.label} className="bg-paper px-4 py-3">
          <dt className="meta">{st.label}</dt>
          <dd className="mt-1 font-medium">{st.value}</dd>
          {st.note && <dd className="text-xs text-muted">{st.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

function RecapSection({ recap, writing, onWrite }: { recap: Recap | null; writing: boolean; onWrite: () => void }) {
  return (
    <>
      <div className="mt-14 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light tracking-[-0.02em]">Recap</h2>
        <Button size="sm" onClick={onWrite} disabled={writing}>
          {writing ? 'Writing…' : recap ? 'Write a new recap' : 'Write a recap'}
        </Button>
      </div>
      {!recap && (
        <p className="mt-6 max-w-prose text-muted">
          A short written summary of how they are using their card, with something to praise and two things to talk about.
          Written from the numbers below. It never sees their name.
        </p>
      )}
      {recap && (
        <div className="mt-6 max-w-prose">
          <p className="text-d4 font-medium">{recap.headline}</p>
          <p className="mt-4">{recap.spending}</p>
          <p className="mt-3">{recap.credit}</p>
          <p className="meta mt-6">Worth praising</p>
          <p className="mt-1">{recap.praise}</p>
          <p className="meta mt-6">Talk about</p>
          <ul className="mt-1 list-disc pl-5">
            {recap.talk_about.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="meta mt-6">
            {formatDate(recap.created_at)}
            {recap.scripted && ' · written by the built-in summary, the AI was not available'}
          </p>
        </div>
      )}
    </>
  )
}

function Rows({ rows, total, empty }: { rows: BreakdownRow[]; total: number; empty: string }) {
  if (rows.length === 0) return <p className="mt-4 text-muted">{empty}</p>
  return (
    <ul className="mt-4 flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-medium">
              {r.label} <span className="text-muted">({r.count})</span>
            </p>
            <p className="tabular-nums">{formatMoney(r.total)}</p>
          </div>
          <div className="mt-2">
            <Bar value={r.total} max={Math.max(total, 1)} label={`${r.label}: ${formatMoney(r.total)} of ${formatMoney(total)}`} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Money({ d }: { d: Breakdown }) {
  return (
    <>
      <Heading>Spending and earning</Heading>
      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div>
          <h3 className="text-d4 font-medium">Spent: {formatMoney(d.spent_total)}</h3>
          <Rows rows={d.spending} total={d.spent_total} empty="Nothing bought yet." />
        </div>
        <div>
          <h3 className="text-d4 font-medium">Earned: {formatMoney(d.earned_total)}</h3>
          <Rows rows={d.earned} total={d.earned_total} empty="Nothing earned yet." />
        </div>
      </div>
      <p className="mt-8 max-w-prose">
        What credit has cost them so far: {formatMoney(d.interest_total)} in interest and {formatMoney(d.late_fee_total)} in late fees.
      </p>
    </>
  )
}

function ScoreBlock({ d }: { d: Breakdown }) {
  const sc = d.score
  return (
    <>
      <Heading>Credit score</Heading>
      {!d.score_tracking && (
        <p className="mt-4 max-w-prose text-muted">
          Score tracking is off for {d.child_name}, so they cannot see this. It is still being kept, and you can turn it on by
          editing their account.
        </p>
      )}
      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <p className="text-d1 font-light tabular-nums">{sc.score}</p>
          <p className="mt-1 text-lead">
            {sc.band}
            {sc.change !== null && <span className="text-muted"> · {signed(sc.change)} last month</span>}
          </p>
          <div className="mt-4">
            <Bar value={sc.score - sc.min_score} max={sc.max_score - sc.min_score} label="Score on the 300 to 800 scale" />
          </div>
        </div>
        <ul className="flex flex-col gap-6">
          {sc.factors.map((f) => (
            <FactorRow key={f.key} factor={f} />
          ))}
        </ul>
      </div>
      <h3 className="mt-12 text-d4 font-medium">Why it moved last month</h3>
      <Reasons score={sc} />
      <h3 className="mt-12 text-d4 font-medium">Score over time</h3>
      <div className="mt-4">
        <ScoreChart points={sc.history} min={sc.min_score} max={sc.max_score} />
      </div>
    </>
  )
}

function Transactions({ d }: { d: Breakdown }) {
  return (
    <>
      <Heading>Recent activity</Heading>
      {d.transactions.length === 0 ? (
        <p className="mt-4 text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-2">
          {d.transactions.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-4 border-b border-ink/15 py-3">
              <span>
                {t.description}
                <span className="meta block">
                  {t.kind.replace('_', ' ')} · {formatDate(t.created_at)}
                </span>
              </span>
              <span className="tabular-nums">{t.amount > 0 ? '+' : t.amount < 0 ? '−' : ''}{formatMoney(Math.abs(t.amount))}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Statements({ d }: { d: Breakdown }) {
  const list = d.summary.statements
  return (
    <>
      <Heading>Statements</Heading>
      {list.length === 0 ? (
        <p className="mt-4 text-muted">No statements yet. The first one comes when you skip a month for them.</p>
      ) : (
        <ul className="mt-2">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink/15 py-3">
              <span>
                Statement {s.number} · {formatMoney(s.total)}
                <span className="meta block">
                  {s.card_name} · issued {formatDate(s.statement_date)} · due {formatDate(s.due_date)}
                </span>
              </span>
              <span>{STATUS_LABEL[s.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
