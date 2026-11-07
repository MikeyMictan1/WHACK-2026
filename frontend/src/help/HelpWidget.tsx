import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { ApiError } from '../lib/api.ts'
import { helpApi, type HelpTopic } from './helpApi.ts'

const MAX_LENGTH = 500
const HISTORY_SENT = 6
const SUGGESTIONS = ['What is APR?', 'How do I raise my credit score?', 'How does Change plan work?']

type Message = { id: number; role: 'user' | 'assistant'; text: string; topics?: HelpTopic[]; scripted?: boolean }

/** Hidden on the negotiation page so it cannot be used to help with the seller chat. */
const HIDDEN_ON = /^\/plans\/[^/]+\/negotiate$/

/** The "Ask" button in the bottom right corner and the chat panel it opens. */
export function HelpWidget() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState(user?.id)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // A different person signed in (or out): never show them the last person's questions.
  if (owner !== user?.id) {
    setOwner(user?.id)
    setMessages([])
    setDraft('')
    setError(null)
  }

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, sending])

  if (HIDDEN_ON.test(pathname)) return null

  async function ask(text: string) {
    const question = text.trim()
    if (!question || sending) return
    const history = messages.slice(-HISTORY_SENT).map((m) => ({ role: m.role, text: m.text }))
    setError(null)
    setSending(true)
    setDraft('')
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text: question }])
    try {
      const res = await helpApi.chat(question, history, pathname)
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: res.reply, topics: res.topics, scripted: res.scripted }])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setSending(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void ask(draft)
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-[100] h-12 bg-ink px-6 text-[15px] font-medium text-white hover:bg-signal hover:text-ink md:right-8 md:bottom-8"
      >
        Ask
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label="Ask Whack"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
      className="fixed right-4 bottom-4 z-[100] flex h-[min(36rem,calc(100svh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col border border-ink bg-white md:right-8 md:bottom-8"
    >
      <header className="flex items-center justify-between bg-ink px-5 py-4 text-white">
        <h2 className="font-medium">Ask Whack</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium underline-offset-4 hover:underline">
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5" aria-live="polite">
        <p className="text-[15px] leading-relaxed">Got a question about credit or how Whack works? Ask me here.</p>

        {messages.length === 0 && (
          <ul className="mt-4 flex flex-col items-start gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => void ask(s)}
                  className="border border-ink px-3 py-2 text-left text-sm font-medium hover:bg-ink hover:text-white"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ol className="mt-4 flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'self-end' : 'self-start'}>
              <p className="meta mb-1">{m.role === 'user' ? 'You' : 'Whack'}</p>
              <p
                className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-sky' : 'border border-line'
                }`}
              >
                {m.text}
              </p>
              {m.topics && m.topics.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="meta">Read next: </span>
                  {m.topics.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ', '}
                      <Link
                        to={`/learn#${t.id}`}
                        onClick={() => window.innerWidth < 768 && setOpen(false)}
                        className="font-medium underline underline-offset-4"
                      >
                        {t.title}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {m.scripted && <p className="meta mt-2">Quick answer: the AI is offline right now.</p>}
            </li>
          ))}
          {sending && (
            <li className="self-start" aria-label="Whack is typing">
              <p className="meta mb-1">Whack</p>
              <div className="flex w-56 flex-col gap-2 border border-line px-4 py-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </li>
          )}
        </ol>

        <div className="mt-4">
          <FormError message={error} />
        </div>
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="border-t border-line p-4">
        <label htmlFor="help-input" className="sr-only">
          Your question
        </label>
        <textarea
          ref={inputRef}
          id="help-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(draft)
            }
          }}
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={sending}
          placeholder="Ask about credit or the game"
          className="w-full resize-none border border-ink/20 bg-white px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="meta text-xs leading-tight">AI can be wrong. Ask a parent about real money.</p>
          <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </section>
  )
}
