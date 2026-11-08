import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { formatMoney } from '../lib/money.ts'
import { PhoneTapButton } from '../nfc/PhoneTapButton.tsx'
import { shopApi, type PurchaseRequest } from './shopApi.ts'

const POLL_MS = 2000

type Props = {
  request: PurchaseRequest
  /** Close the overlay (request finished, or child backed out). */
  onClose: () => void
  /** The request changed (paid, denied, ...) so the shop can refresh. */
  onChange: () => void
}

/**
 * Full-screen purchase steps:
 *   pending  -> "Waiting for your parent" (polls)
 *   approved -> "Tap your card" (backend waits for a tap on the reader; "Simulate tap" as backup)
 *   paid     -> "Bought"
 */
export function PurchaseFlow({ request, onClose, onChange }: Props) {
  const [req, setReq] = useState(request)
  const [tapError, setTapError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  // Waiting for the parent: poll until the status moves on.
  useEffect(() => {
    if (req.status !== 'pending') return
    const id = window.setInterval(() => {
      shopApi
        .request(req.id)
        .then((r) => {
          if (r.status !== 'pending') {
            setReq(r)
            changed.current()
          }
        })
        .catch(() => {})
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [req.id, req.status])

  // Approved: ask the backend to wait for a card tap.
  const tapCtrl = useRef<AbortController | null>(null)
  useEffect(() => {
    if (req.status !== 'approved') return
    const ctrl = new AbortController()
    tapCtrl.current = ctrl
    shopApi
      .pay(req.id, false, ctrl.signal)
      .then((r) => {
        setReq(r)
        changed.current()
      })
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) setTapError(err.message)
      })
    return () => ctrl.abort()
  }, [req.id, req.status, attempt])

  function stopWaitingForTap() {
    tapCtrl.current?.abort()
    void shopApi.cancelPay(req.id).catch(() => {})
  }

  async function simulateTap() {
    stopWaitingForTap()
    setTapError(null)
    setBusy(true)
    try {
      setReq(await shopApi.pay(req.id, true))
      changed.current()
    } catch (err) {
      setTapError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** The child tapped their card on this phone (Android Web NFC). */
  async function phoneTap(cardUid: string) {
    stopWaitingForTap()
    setTapError(null)
    setBusy(true)
    try {
      setReq(await shopApi.pay(req.id, false, undefined, cardUid))
      changed.current()
    } finally {
      setBusy(false)
    }
  }

  async function cancelPurchase() {
    stopWaitingForTap()
    setBusy(true)
    try {
      await shopApi.cancel(req.id)
    } catch {
      // already finished; nothing to cancel
    }
    changed.current()
    onClose()
  }

  // In-game items (decor, LED skins) skip the parent and start at the tap.
  const selfServe = req.kind === 'in_game' || req.kind === 'led_skin'
  const content = {
    pending: {
      step: 'Step 1 of 2',
      title: 'Waiting for your parent',
      body: `We asked them to approve ${req.title} for ${formatMoney(req.price)}. Keep this screen open.`,
    },
    approved: {
      step: selfServe ? 'Pay' : 'Step 2 of 2',
      title: tapError ? 'That didn’t work' : 'Tap your card',
      body: `${selfServe ? `${req.title} for ${formatMoney(req.price)}. In-game items need no approval.` : 'Approved.'} Hold your card on the reader to pay (lift it and tap again if it is already there), or tap it on the back of this phone.`,
    },
    paid: {
      step: 'Done',
      title: 'Bought.',
      body:
        req.paid_with === 'credit'
          ? `${req.title} is yours. ${formatMoney(req.price)} was charged to your card and will be on your next statement.`
          : `${req.title} is yours. ${formatMoney(req.price)} came out of your balance.`,
    },
    denied: { step: 'Not this time', title: 'Your parent said no', body: 'Nothing was paid. Maybe try something else.' },
    cancelled: { step: 'Cancelled', title: 'Purchase cancelled', body: 'Nothing was paid.' },
    expired: { step: 'Timed out', title: 'This request expired', body: 'Nothing was paid. You can ask again.' },
  }[req.status]

  const finished = !['pending', 'approved'].includes(req.status)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-paper px-4"
    >
      <div className="w-full max-w-md text-center">
        <p className="meta">{content.step}</p>
        <h2 id="purchase-title" className="mt-3 text-d3 font-medium">
          {content.title}
        </h2>
        <p className="mt-4 text-muted">{content.body}</p>

        {req.status === 'pending' && (
          <span aria-hidden className="mx-auto mt-10 block h-1 w-24 animate-pulse bg-ink" />
        )}

        {req.status === 'approved' && (
          <>
            {tapError ? (
              <div className="mt-6 text-left">
                <FormError message={tapError} />
              </div>
            ) : (
              <span aria-hidden className="mx-auto mt-10 block size-24 animate-pulse border-4 border-ink bg-signal" />
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {tapError && (
                <Button
                  onClick={() => {
                    setTapError(null)
                    setAttempt((a) => a + 1)
                  }}
                  disabled={busy}
                >
                  Try again
                </Button>
              )}
              <PhoneTapButton disabled={busy} onError={setTapError} onTap={phoneTap} />
              <Button variant="light" className="border border-ink" onClick={simulateTap} disabled={busy}>
                Simulate tap
              </Button>
            </div>
          </>
        )}

        <div className="mt-10 flex justify-center">
          {finished ? (
            <Button onClick={onClose}>{req.status === 'paid' ? 'Nice' : 'Close'}</Button>
          ) : (
            <button
              type="button"
              onClick={cancelPurchase}
              disabled={busy}
              className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Cancel purchase
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
