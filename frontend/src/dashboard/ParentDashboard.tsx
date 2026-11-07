import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, ButtonLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { CURRENCY_LABEL, formatMoney, parseMoney } from '../lib/money.ts'
import { shopApi } from '../shop/shopApi.ts'
import { ChildForm } from './ChildForm.tsx'
import { childrenApi } from './childrenApi.ts'
import { ParentApprovals } from './ParentApprovals.tsx'

/** The parent's home: their kids' accounts, and adding / editing / removing them. */
export function ParentDashboard({ parent }: { parent: User }) {
  const [children, setChildren] = useState<User[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [balances, setBalances] = useState<Record<string, number>>({})

  function loadBalances() {
    shopApi.balances().then(setBalances).catch(() => {})
  }

  useEffect(() => {
    childrenApi
      .list()
      .then((list) => {
        setChildren(list)
        // First visit with no kids yet: open the form straight away.
        if (list.length === 0) setAdding(true)
      })
      .catch((err: Error) => setLoadError(err.message))
    loadBalances()
  }, [])

  async function onBonus(child: User) {
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

  async function onRemove(child: User) {
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
          {children && !adding && <Button onClick={() => setAdding(true)}>Add child</Button>}
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

        {children && children.length === 0 && !adding && (
          <p className="py-8 text-muted">No child accounts yet.</p>
        )}

        {children && children.length > 0 && (
          <ul>
            {children.map((child) => (
              <li key={child.id} className="border-b border-ink/15 py-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-d4 font-medium">{nameOf(child)}</p>
                    <p className="meta mt-1">
                      @{child.username} · age {child.age} · balance {formatMoney(balances[child.id] ?? 0)}
                    </p>
                  </div>
                  {editingId !== child.id && (
                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" variant="light" className="border border-ink" onClick={() => onBonus(child)}>
                        Give bonus
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

        {children && adding && (
          <div className="mt-8 border border-line bg-white p-6 md:p-8">
            <h3 className="text-d4 font-medium">Add a child</h3>
            <p className="meta mt-2 mb-6">
              They log in on the same login page with the username and password you choose here.
            </p>
            <ChildForm
              mode="create"
              onCancel={children.length > 0 ? () => setAdding(false) : undefined}
              onSubmit={async (input) => {
                const created = await childrenApi.create(input)
                setChildren((list) => [...(list ?? []), created])
                setAdding(false)
                showToast(`${nameOf(created)} can now log in as @${created.username}`)
              }}
            />
          </div>
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
