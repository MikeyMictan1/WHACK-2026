import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import type { NegotiationSession } from './negotiationApi.ts'

const MAX_LENGTH = 500

type Props = {
  session: NegotiationSession
  sending: boolean
  onSend: (text: string) => Promise<boolean>
}

/** The conversation with the seller bot, and the box to answer it. */
export function ChatPanel({ session, sending, onSend }: Props) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const outOfMessages = session.turns_used >= session.max_turns

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [session.messages.length, sending])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending || outOfMessages) return
    if (await onSend(text)) setDraft('')
  }

  return (
    <div className="flex flex-col border border-line bg-white">
      <ol aria-live="polite" aria-label="Conversation" className="flex max-h-[28rem] min-h-[18rem] flex-col gap-5 overflow-y-auto p-5">
        {session.messages.map((m) => (
          <li key={m.id} className={m.role === 'child' ? 'self-end' : 'self-start'}>
            <p className="meta mb-1">{m.role === 'child' ? 'You' : session.seller}</p>
            <p
              className={`max-w-prose px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'child' ? 'bg-brand text-white' : 'border border-line bg-sky'
              }`}
            >
              {m.text}
            </p>
          </li>
        ))}
        {sending && (
          <li className="self-start" aria-label={`${session.seller} is typing`}>
            <p className="meta mb-1">{session.seller}</p>
            <div className="flex w-64 flex-col gap-2 border border-line px-4 py-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </li>
        )}
        <div ref={endRef} />
      </ol>

      <form onSubmit={submit} className="border-t border-line p-5">
        {outOfMessages ? (
          <p className="text-[15px]">That was your last message. Accept the offer or walk away.</p>
        ) : (
          <>
            <label htmlFor="negotiate-input" className="text-sm font-medium">
              Your message
            </label>
            <textarea
              id="negotiate-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              maxLength={MAX_LENGTH}
              rows={3}
              disabled={sending}
              placeholder="Say why you deserve a better rate"
              className="mt-2 w-full resize-y border border-ink/20 bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink disabled:opacity-60"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <span className="meta">
                {session.max_turns - session.turns_used} of {session.max_turns} messages left
              </span>
              <Button type="submit" disabled={sending || !draft.trim()}>
                {sending ? 'Waiting for a reply' : 'Send'}
              </Button>
            </div>
          </>
        )}
        {session.scripted && (
          <p className="meta mt-4 border-t border-line pt-3">
            Practice mode: the AI is offline, so some replies are scripted.
          </p>
        )}
      </form>
    </div>
  )
}
