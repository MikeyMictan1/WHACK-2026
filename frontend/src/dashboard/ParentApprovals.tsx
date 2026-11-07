import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { showToast } from '../components/ui/toast.ts'
import { formatMoney } from '../lib/money.ts'
import { shopApi, type ChoreClaim, type PurchaseRequest } from '../shop/shopApi.ts'

const POLL_MS = 3000

/**
 * Things waiting for the parent: purchase requests and "I did it" chore claims.
 * Polls every few seconds and toasts when something new arrives.
 * `onChange` lets the dashboard refresh balances after a decision.
 */
export function ParentApprovals({ onChange }: { onChange: () => void }) {
  const [requests, setRequests] = useState<PurchaseRequest[] | null>(null)
  const [claims, setClaims] = useState<ChoreClaim[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)

  async function load() {
    const [r, c] = await Promise.all([shopApi.requests(true), shopApi.claims(true)])
    // Only 'pending' needs the parent; 'approved' is waiting for the child's tap.
    const pending = r.filter((x) => x.status === 'pending')
    const keys = [...pending.map((x) => `r${x.id}`), ...c.map((x) => `c${x.id}`)]
    if (seen.current) {
      const fresh = [
        ...pending.filter((x) => !seen.current?.has(`r${x.id}`)).map((x) => `${x.child_name} wants ${x.title}`),
        ...c.filter((x) => !seen.current?.has(`c${x.id}`)).map((x) => `${x.child_name} did: ${x.title}`),
      ]
      if (fresh.length) showToast(fresh.join(' · '))
    }
    seen.current = new Set(keys)
    setRequests(r)
    setClaims(c)
  }

  useEffect(() => {
    const tick = () => void load().catch(() => {})
    tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => window.clearInterval(id)
  }, [])

  async function act(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key)
    try {
      await fn()
      showToast(message)
      await load()
      onChange()
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!requests || !claims) return null
  const pending = requests.filter((r) => r.status === 'pending')
  const waitingForTap = requests.filter((r) => r.status === 'approved')
  const empty = pending.length === 0 && claims.length === 0 && waitingForTap.length === 0

  return (
    <div className="mb-14">
      <div className="flex items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light">Needs you</h2>
        {!empty && <span className="meta">{pending.length + claims.length} waiting</span>}
      </div>

      {empty && <p className="py-6 text-muted">Nothing to approve. Requests from your kids show up here.</p>}

      <ul>
        {pending.map((r) => (
          <li key={`r${r.id}`} className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 py-5">
            <div>
              <p className="text-d4">
                {r.child_name} wants <span className="font-medium">{r.title}</span>
              </p>
              <p className="meta mt-1">
                Purchase · {formatMoney(r.price)} · {r.kind.replace('_', '-')}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => act(`r${r.id}`, () => shopApi.approve(r.id), `Approved. ${r.child_name} can tap their card now.`)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="light"
                className="border border-ink"
                disabled={busy !== null}
                onClick={() => act(`r${r.id}`, () => shopApi.deny(r.id), 'Denied')}
              >
                Deny
              </Button>
            </div>
          </li>
        ))}

        {claims.map((c) => (
          <li key={`c${c.id}`} className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 py-5">
            <div>
              <p className="text-d4">
                {c.child_name} did <span className="font-medium">{c.title}</span>
              </p>
              <p className="meta mt-1">Earn · pays {formatMoney(c.amount)}</p>
            </div>
            <div className="flex gap-3">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => act(`c${c.id}`, () => shopApi.approveClaim(c.id), `Paid ${formatMoney(c.amount)} to ${c.child_name}`)}
              >
                Approve and pay
              </Button>
              <Button
                size="sm"
                variant="light"
                className="border border-ink"
                disabled={busy !== null}
                onClick={() => act(`c${c.id}`, () => shopApi.denyClaim(c.id), 'Denied')}
              >
                Deny
              </Button>
            </div>
          </li>
        ))}

        {waitingForTap.map((r) => (
          <li key={`t${r.id}`} className="border-b border-ink/15 py-5">
            <p className="text-d4 text-muted">
              {r.child_name}: <span className="text-ink">{r.title}</span>
            </p>
            <p className="meta mt-1">Approved · waiting for {r.child_name} to tap their card</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
