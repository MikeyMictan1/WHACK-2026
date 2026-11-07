import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { showToast } from '../components/ui/toast.ts'
import { CURRENCY_LABEL, formatMoney, parseMoney } from '../lib/money.ts'
import {
  CHORE_KINDS,
  REWARD_KINDS,
  shopApi,
  type Chore,
  type ChoreKind,
  type Reward,
  type RewardKind,
} from '../shop/shopApi.ts'

const selectClass =
  'h-12 w-full border border-ink/20 bg-white px-4 text-[15px] text-ink outline-none hover:border-ink/40 focus:border-ink'

/** Parent: what kids can buy (in-game, weekly, milestones like a PS5) and how they earn (chores). */
export function ManageShopPage() {
  const [rewards, setRewards] = useState<Reward[] | null>(null)
  const [chores, setChores] = useState<Chore[] | null>(null)

  async function load() {
    const [r, c] = await Promise.all([shopApi.rewards(), shopApi.chores()])
    setRewards(r)
    setChores(c)
  }

  useEffect(() => {
    Promise.all([shopApi.rewards(), shopApi.chores()])
      .then(([r, c]) => {
        setRewards(r)
        setChores(c)
      })
      .catch((err: Error) => showToast(err.message, 'error'))
  }, [])

  async function remove(fn: () => Promise<void>, title: string) {
    if (!window.confirm(`Remove "${title}"? Kids won't see it any more.`)) return
    try {
      await fn()
      await load()
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  async function addExamples() {
    try {
      await shopApi.starterPack()
      await load()
      showToast('Added example items and chores')
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const loading = !rewards || !chores

  return (
    <>
      <PageHeader
        marker="Parent dashboard"
        title="Shop and chores."
        description="Set what your kids can buy and how they earn. Prices are in play money."
      />

      <section className="container-x py-10 md:py-14">
        <TextLink to="/dashboard">Back to dashboard</TextLink>

        {loading && (
          <div aria-busy="true" aria-label="Loading" className="mt-8">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="mt-6 h-14 w-full" />
            <Skeleton className="mt-3 h-14 w-full" />
          </div>
        )}

        {rewards && chores && (
          <>
            {rewards.length === 0 && chores.length === 0 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-6">
                <p>Your shop is empty. Start with our examples, then edit them.</p>
                <Button onClick={addExamples}>Add example items</Button>
              </div>
            )}

            <h2 className="mt-12 border-b border-ink pb-4 text-d3 font-light">Shop items</h2>
            {REWARD_KINDS.map(({ kind, label, note }) => {
              const items = rewards.filter((r) => r.kind === kind)
              return (
                <div key={kind} className="mt-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-d4 font-medium">{label}</h3>
                    <span className="meta">{note}</span>
                  </div>
                  {items.length === 0 && <p className="mt-3 text-sm text-muted">None yet.</p>}
                  <ul className="mt-3">
                    {items.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-4 border-t border-ink/15 py-4">
                        <div className="min-w-0">
                          <p className="font-medium">{r.title}</p>
                          {r.description && <p className="meta mt-1 truncate">{r.description}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-5">
                          <span className="tabular-nums">{formatMoney(r.price)}</span>
                          <button
                            type="button"
                            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                            onClick={() => remove(() => shopApi.removeReward(r.id), r.title)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            <AddRewardForm onAdded={load} />

            <h2 className="mt-16 border-b border-ink pb-4 text-d3 font-light">Ways to earn</h2>
            {CHORE_KINDS.map(({ kind, label }) => {
              const items = chores.filter((c) => c.kind === kind)
              return (
                <div key={kind} className="mt-8">
                  <h3 className="text-d4 font-medium">{label}</h3>
                  {items.length === 0 && <p className="mt-3 text-sm text-muted">None yet.</p>}
                  <ul className="mt-3">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-4 border-t border-ink/15 py-4">
                        <p className="font-medium">{c.title}</p>
                        <div className="flex shrink-0 items-center gap-5">
                          <span className="tabular-nums">pays {formatMoney(c.amount)}</span>
                          <button
                            type="button"
                            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                            onClick={() => remove(() => shopApi.removeChore(c.id), c.title)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            <AddChoreForm onAdded={load} />
          </>
        )}
      </section>
    </>
  )
}

function AddRewardForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const title = String(form.get('title') ?? '').trim()
    const price = parseMoney(String(form.get('price') ?? ''))
    if (!title) return setError('Give it a name')
    if (price === null) return setError('Enter a price, like 4.50')
    setError(null)
    setPending(true)
    try {
      await shopApi.addReward({
        title,
        description: String(form.get('description') ?? '').trim(),
        price,
        kind: String(form.get('kind')) as RewardKind,
      })
      formEl.reset()
      await onAdded()
      showToast(`Added ${title}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-10 border border-line bg-white p-6 md:p-8">
      <h3 className="text-d4 font-medium">Add a shop item</h3>
      <p className="meta mt-2 mb-6">For example a PS5 milestone, a cinema trip, or a new theme.</p>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr_1fr]">
        <TextField label="Name" name="title" maxLength={60} required />
        <TextField label={`Price (${CURRENCY_LABEL})`} name="price" inputMode="decimal" placeholder="4.50" required />
        <div className="flex flex-col gap-2">
          <label htmlFor="reward-kind" className="text-sm font-medium">
            Type
          </label>
          <select id="reward-kind" name="kind" defaultValue="milestone" className={selectClass}>
            {REWARD_KINDS.filter((k) => k.kind !== 'led_skin').map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TextField label="Description" name="description" hint="Optional" maxLength={200} className="mt-6" />
      <div className="mt-6 flex flex-col gap-4">
        <FormError message={error} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add item'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function AddChoreForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const title = String(form.get('title') ?? '').trim()
    const amount = parseMoney(String(form.get('amount') ?? ''))
    if (!title) return setError('Give it a name')
    if (amount === null) return setError('Enter how much it pays, like 2.00')
    setError(null)
    setPending(true)
    try {
      await shopApi.addChore({ title, amount, kind: String(form.get('kind')) as ChoreKind })
      formEl.reset()
      await onAdded()
      showToast(`Added ${title}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-10 border border-line bg-white p-6 md:p-8">
      <h3 className="text-d4 font-medium">Add a way to earn</h3>
      <div className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr_1fr]">
        <TextField label="Name" name="title" maxLength={60} required />
        <TextField label={`Pays (${CURRENCY_LABEL})`} name="amount" inputMode="decimal" placeholder="2.00" required />
        <div className="flex flex-col gap-2">
          <label htmlFor="chore-kind" className="text-sm font-medium">
            Type
          </label>
          <select id="chore-kind" name="kind" defaultValue="chore" className={selectClass}>
            {CHORE_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <FormError message={error} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </form>
  )
}
