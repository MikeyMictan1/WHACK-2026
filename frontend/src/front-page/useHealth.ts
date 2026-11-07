import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'

export type Health = { state: 'checking' } | { state: 'ok'; ms: number } | { state: 'offline' }

/** One real round trip to GET /api/health, timed. */
export function useHealth(): Health {
  const [health, setHealth] = useState<Health>({ state: 'checking' })

  useEffect(() => {
    const controller = new AbortController()
    const start = performance.now()
    api('/health', { signal: controller.signal })
      .then(() => setHealth({ state: 'ok', ms: Math.round(performance.now() - start) }))
      .catch(() => {
        if (!controller.signal.aborted) setHealth({ state: 'offline' })
      })
    return () => controller.abort()
  }, [])

  return health
}
