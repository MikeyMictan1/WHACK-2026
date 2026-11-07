import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, TextLink } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { formatMoney } from '../lib/money.ts'
import { CHORE_KINDS, shopApi, type Chore } from '../shop/shopApi.ts'

const STATUS_LABEL = {
  pending: 'Waiting for your parent',
  approved: 'Paid last time',
  denied: 'Not approved last time',
} as const

/** Child: chores and extracurriculars. "I did it" sends it to the parent to approve and pay. */
export function EarnPage() {
  const [chores, setChores] = useState<Chore[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  async function load() {
    setChores(await shopApi.chores())
  }

  useEffect(() => {
    shopApi
      .chores()
      .then(setChores)
      .catch((err: Error) => showToast(err.message, 'error'))
  }, [])

  async function claim(chore: Chore) {
    setBusy(chore.id)
    try {
      await shopApi.claimChore(chore.id)
      showToast(`Sent. Your parent will check "${chore.title}".`)
      await load()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader marker="Earn" title="Earn money." description="Do a job, tell your parent, get paid when they approve it." />

      <section className="container-x py-10 md:py-14">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <TextLink to="/dashboard">Back to dashboard</TextLink>
          <TextLink to="/shop">Go to the shop</TextLink>
        </div>

        {!chores && (
          <div aria-busy="true" aria-label="Loading" className="mt-10">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="mt-3 h-14 w-full" />
          </div>
        )}

        {chores?.length === 0 && <p className="mt-10 text-muted">No jobs yet. Ask your parent to add some.</p>}

        {chores &&
          CHORE_KINDS.map(({ kind, label }) => {
            const items = chores.filter((c) => c.kind === kind)
            if (items.length === 0) return null
            return (
              <div key={kind} className="mt-12">
                <h2 className="border-b border-ink pb-3 text-d3 font-light">{label}</h2>
                <ul>
                  {items.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 py-5">
                      <div>
                        <p className="text-d4 font-medium">{c.title}</p>
                        <p className="meta mt-1">
                          Pays {formatMoney(c.amount)}
                          {c.my_claim_status && ` · ${STATUS_LABEL[c.my_claim_status]}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={busy !== null || c.my_claim_status === 'pending'}
                        onClick={() => claim(c)}
                      >
                        {c.my_claim_status === 'pending' ? 'Sent' : 'I did it'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
      </section>
    </>
  )
}
