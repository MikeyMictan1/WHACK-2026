export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { json?: unknown }

/** Fetch wrapper for the FastAPI backend. Vite proxies /api to localhost:8000. */
export async function api<T>(path: string, { json, headers, ...init }: ApiOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  })

  if (!res.ok) {
    throw new ApiError(res.status, await readError(res))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    const detail = body?.detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors: [{ loc, msg, ... }]
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  } catch {
    // non-JSON response
  }
  return res.status >= 500 ? 'Server unavailable. Is the backend running?' : res.statusText
}
