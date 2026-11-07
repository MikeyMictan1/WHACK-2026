import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { STATUS_LABEL, creditApi, formatDate, type ChildCredit, type SkipResult } from '../credit/creditApi.ts'
import { CURRENCY_LABEL, formatMoney, parseMoney } from '../lib/money.ts'
import { shopApi } from '../shop/shopApi.ts'
import { ChildForm } from './ChildForm.tsx'
import { APP_EXPERIENCE_PRESETS, childrenApi, type Child } from './childrenApi.ts'
import { ParentApprovals } from './ParentApprovals.tsx'

/** The parent's home: their kids' accounts, and adding / editing / removing them. */
export function ParentDashboard({ parent }: { parent: User }) {
  const [children, setChildren] = useState<Child[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
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

  async function onBonus(child: Child) {
    const input = window.prompt(`Give ${nameOf(child)} a bonus. How much (${CURRENCY_LABEL})?`, '5.00')
    if (input === null) return
    const amount = parseMoney(input)
    if (amount === null) return showToast('Enter an amount like 5.00', 'error')
    try {
      await shopApi.bonus(child.id, amount, 'Bonus from parent')
      loadBalances()
      showToast(`Gave ${nameOf(child)} ${formatMoney(amount)}`)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function onSkip(child: Child) {
    const ok = window.confirm(
      `Skip a month for ${nameOf(child)}? It pays 4 weeks of allowance, closes their statement, charges interest or a ` +
        'late fee if they have not paid, and issues a new statement. It cannot be undone.',
    )
    if (!ok) return
    try {
      const result = await creditApi.skipMonth(child.id)
      loadBalances()
      showToast(skipMessage(result))
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function onRemove(child: Child) {
    if (!window.confirm(`Remove ${nameOf(child)}'s account? This deletes their account and data.`)) return
    try {
      await childrenApi.remove(child.id)
      setChildren((list) => list?.filter((c) => c.id !== child.id) ?? null)
      showToast(`${nameOf(child)}'s account was removed`)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        marker="Parent dashboard"
        title={`Hi, ${nameOf(parent)}.`}
        description="Approve what your kids buy and earn, manage their accounts, and set up the shop."
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
          <div aria-busy="true" aria-label="Loading">
            <Skeleton className="mt-6 h-16 w-full" />
            <Skeleton className="mt-3 h-16 w-full" />
          </div>
        )}

        {children && children.length === 0 && <p className="py-8 text-muted">No child accounts yet.</p>}

        {children && children.length > 0 && (
          <ul>
            {children.map((child) => (
              <li key={child.id} className="border-b border-ink/15 py-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-d4 font-medium">{nameOf(child)}</p>
                    <p className="meta mt-1">
                      @{child.username} · balance {formatMoney(balances[child.id] ?? 0)}
                      {child.weekly_allowance != null && ` · ${formatMoney(child.weekly_allowance)}/wk allowance`}
                      {child.app_experience && ` · ${APP_EXPERIENCE_PRESETS.includes(child.app_experience as never) ? child.app_experience : 'custom'} experience`}
                    </p>
                    {credit[child.id] && <p className="meta mt-1">{creditLine(credit[child.id])}</p>}
                  </div>
                  {editingId !== child.id && (
                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" variant="light" className="border border-ink" onClick={() => onBonus(child)}>
                        Give bonus
                      </Button>
                      <Button size="sm" variant="light" className="border border-ink" onClick={() => onSkip(child)}>
                        Skip a month
                      </Button>
                      <Button size="sm" variant="light" className="border border-ink" onClick={() => setEditingId(child.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="light" className="border border-ink" onClick={() => onRemove(child)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                {editingId === child.id && (
                  <div className="mt-6 border-t border-line pt-6">
                    <ChildForm
                      mode="edit"
                      child={child}
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (input) => {
                        const updated = await childrenApi.update(child.id, input)
                        setChildren((list) => list?.map((c) => (c.id === updated.id ? updated : c)) ?? null)
                        setEditingId(null)
                        showToast(input.password ? 'Saved. The new password works now.' : 'Saved')
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-14 flex flex-wrap gap-3 border-t border-line pt-8">
          <ButtonLink to="/manage">Shop and chores</ButtonLink>
          <ButtonLink to="/profile" variant="light" className="border border-ink">
            Account settings
          </ButtonLink>
        </div>
      </section>
    </>
  )
}

/** One line about a child's card under their name. Their dates are their own: they move when you skip a month. */
function creditLine(c: ChildCredit): string {
  if (!c.has_credit) return `${c.card_name} (debit) · their date ${formatDate(c.sim_date)}`
  const due =
    c.statement_number !== null && c.status === 'open' && (c.statement_remaining ?? 0) > 0
      ? `statement ${c.statement_number}: ${formatMoney(c.statement_remaining ?? 0)} due ${formatDate(c.due_date ?? c.sim_date)}`
      : 'nothing to pay'
  return `${c.card_name} · owes ${formatMoney(c.owed)} · ${due} · their date ${formatDate(c.sim_date)}`
}

/** What skipping a month did, in a sentence or two. */
function skipMessage(r: SkipResult): string {
  const parts = [`${r.child_name}: a month passed`]
  if (r.allowance > 0) parts.push(`${formatMoney(r.allowance)} allowance paid`)
  if (r.previous_number !== null && r.outcome) {
    const label = r.outcome === 'paid' ? STATUS_LABEL.paid : r.outcome === 'carried' ? STATUS_LABEL.carried : STATUS_LABEL.late
    parts.push(`statement ${r.previous_number}: ${label.toLowerCase()}`)
  }
  if (r.interest > 0) parts.push(`${formatMoney(r.interest)} interest`)
  if (r.late_fee > 0) parts.push(`${formatMoney(r.late_fee)} late fee`)
  if (r.statement) parts.push(`new statement ${r.statement.number}: ${formatMoney(r.statement.total)} due ${formatDate(r.statement.due_date)}`)
  return parts.join(', ')
}
