import { useEffect, useState } from 'react'
import { api } from '../../lib/api.ts'
import { Skeleton } from '../ui/Skeleton.tsx'

type State = { kind: 'loading' } | { kind: 'ok'; status: string } | { kind: 'error' }

/** Shows the live response of a backend placeholder endpoint. */
export function ApiStatus({ endpoint }: { endpoint: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api<{ status: string }>(endpoint, { signal: controller.signal })
      .then((r) => setState({ kind: 'ok', status: r.status }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      })
    return () => controller.abort()
  }, [endpoint])

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-ink py-4">
      <code className="font-mono text-sm">GET /api{endpoint}</code>
      {state.kind === 'loading' ? (
        <Skeleton className="h-4 w-32" />
      ) : state.kind === 'ok' ? (
        <span className="text-sm font-medium text-ink/70">200 · {state.status}</span>
      ) : (
        <span className="text-sm font-medium text-red-600">Backend offline</span>
      )}
    </div>
  )
}
