import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { showToast } from '../components/ui/toast.ts'
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from './push.ts'

/** "Phone notifications" row for the dashboards: turn Web Push on/off for this device. */
export function PushToggle({ what }: { what: string }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  async function run(action: () => Promise<PushState>, done?: string) {
    setBusy(true)
    try {
      const next = await action()
      setState(next)
      if (next === 'on' && done) showToast(done)
      if (next === 'blocked') showToast('Notifications are blocked for this site. Allow them in the browser settings.', 'error')
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (state === null || state === 'unsupported') return null

  const text = {
    'needs-install': 'On iPhone: tap Share, then Add to Home Screen, open Whack from there and turn notifications on.',
    blocked: 'Notifications are blocked for this site. Allow them in the browser settings to get alerts.',
    off: `Get a notification on this device ${what}.`,
    on: `On for this device. You’ll get a notification ${what}.`,
  }[state]

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
      <div>
        <p className="meta">Phone notifications</p>
        <p className="mt-1 max-w-prose text-sm text-muted">{text}</p>
      </div>
      {state === 'off' && (
        <Button size="sm" onClick={() => run(enablePush, 'Notifications are on')} disabled={busy}>
          Turn on
        </Button>
      )}
      {state === 'on' && (
        <div className="flex gap-3">
          <Button
            size="sm"
            variant="light"
            className="border border-ink"
            disabled={busy}
            onClick={() => sendTestPush().then(() => showToast('Test sent'), (e: Error) => showToast(e.message, 'error'))}
          >
            Send a test
          </Button>
          <Button size="sm" variant="light" className="border border-ink" onClick={() => run(disablePush)} disabled={busy}>
            Turn off
          </Button>
        </div>
      )}
    </div>
  )
}
