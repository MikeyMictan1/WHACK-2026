import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { adminApi, type ClockUnit, type SiteClock } from './adminApi.ts'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
}

function offsetLabel(clock: SiteClock) {
  const parts = []
  if (clock.offset_months) parts.push(`${clock.offset_months} ${clock.offset_months === 1 ? 'month' : 'months'}`)
  if (clock.offset_days) parts.push(`${clock.offset_days} ${clock.offset_days === 1 ? 'day' : 'days'}`)
  return parts.length ? `+${parts.join(', ')} ahead` : 'Not altered'
}

const ADVANCE: { unit: ClockUnit; label: string }[] = [
  { unit: 'day', label: '+1 day' },
  { unit: 'week', label: '+1 week' },
  { unit: 'month', label: '+1 month' },
]

/** Shows the site clock and lets the admin push it forward or reset it. */
export function SiteClockPanel() {
  const [clock, setClock] = useState<SiteClock | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    adminApi
      .clock()
      .then(setClock)
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  async function run(action: () => Promise<SiteClock>, message: string) {
    setPending(true)
    try {
      setClock(await action())
      showToast(message)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setPending(false)
    }
  }

  const altered = clock != null && (clock.offset_days !== 0 || clock.offset_months !== 0)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light tracking-[-0.02em]">Site clock</h2>
        {clock && <p className="meta">{offsetLabel(clock)}</p>}
      </div>

      {loadError && (
        <div className="mt-6">
          <FormError message={loadError} />
        </div>
      )}

      {!clock && !loadError && <Skeleton className="mt-6 h-24 w-full" />}

      {clock && (
        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="meta">Current site time</dt>
              <dd className="mt-1 text-d4 font-medium tabular-nums">{formatDate(clock.now)}</dd>
            </div>
            <div>
              <dt className="meta">Unaltered time</dt>
              <dd className="mt-1 tabular-nums">{formatDate(clock.natural)}</dd>
            </div>
            <div>
              <dt className="meta">Clock started</dt>
              <dd className="mt-1 tabular-nums">{formatDate(clock.created_at)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            {ADVANCE.map(({ unit, label }) => (
              <Button
                key={unit}
                disabled={pending}
                onClick={() => run(() => adminApi.advanceClock(unit), `Clock moved forward ${label.slice(1)}`)}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="light"
              className="border border-ink"
              disabled={pending || !altered}
              onClick={() => run(adminApi.resetClock, 'Clock reset')}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
