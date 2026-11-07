import { useState, type FormEvent } from 'react'
import { ApiStatus } from '../components/feature/ApiStatus.tsx'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { api, ApiError } from '../lib/api.ts'

const MAX_LENGTH = 4000

export function AiFeaturePage() {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = message.trim()
    if (!text || loading) return

    setLoading(true)
    setError(null)
    setReply(null)
    try {
      const res = await api<{ reply: string }>('/ai/chat', { method: 'POST', json: { message: text } })
      setReply(res.reply)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        marker="03"
        title="AI Feature"
        description="Type a prompt and get a response from Claude. The backend calls the Claude API in ai_controller.py."
      />

      <section className="container-x py-10 md:py-14">
        <ApiStatus endpoint="/ai" />

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label htmlFor="ai-prompt" className="text-sm font-medium">
            Your prompt
          </label>
          <textarea
            id="ai-prompt"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit(e)
            }}
            maxLength={MAX_LENGTH}
            rows={5}
            placeholder="Ask anything…"
            className="w-full resize-y border border-ink/20 bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink"
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="meta">
              {message.length}/{MAX_LENGTH} · Ctrl+Enter to send
            </span>
            <Button type="submit" disabled={loading || !message.trim()}>
              {loading ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </form>

        <div className="mt-8" aria-live="polite">
          <FormError message={error} />
          {loading && (
            <div className="flex flex-col gap-3 border border-ink/20 p-6">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {reply !== null && (
            <div className="border border-ink/20 bg-white p-6">
              <span className="meta">Response</span>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{reply}</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
