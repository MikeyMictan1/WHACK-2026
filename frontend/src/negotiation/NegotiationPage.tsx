import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { ApiError } from '../lib/api.ts'
import { pct } from '../lib/format.ts'
import { ChatPanel } from './ChatPanel.tsx'
import { ConfirmSwitch } from './ConfirmSwitch.tsx'
import { negotiationApi, type ConfirmResult, type NegotiationSession } from './negotiationApi.ts'
import { OfferPanel } from './OfferPanel.tsx'
import { moodOf } from './mood.ts'
import { SellerPortrait } from './SellerPortrait.tsx'

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong.')

/** /plans/:cardId/negotiate: chat with the seller bot, accept an offer, tap to switch. */
export function NegotiationPage() {
  const { cardId = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<NegotiationSession | null>(null)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    if (startedFor.current === cardId) return // StrictMode runs effects twice in dev
    startedFor.current = cardId
    negotiationApi
      .start(cardId)
      .then(setSession)
      .catch((err: unknown) => setError(messageOf(err)))
  }, [cardId])

  /** Returns true if the message went through, so the box can clear. */
  async function send(text: string): Promise<boolean> {
    if (!session) return false
    setError(null)
    setSending(true)
    // Show the child's message straight away; the reply replaces it.
    setSession({ ...session, messages: [...session.messages, { id: -1, role: 'child', text, offer_apr_bp: null }] })
    try {
      setSession(await negotiationApi.say(session.id, text))
      return true
    } catch (err) {
      setSession(session)
      setError(messageOf(err))
      return false
    } finally {
      setSending(false)
    }
  }

  async function accept() {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      setSession(await negotiationApi.accept(session.id))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function walkAway() {
    if (!session) return navigate('/plans')
    setBusy(true)
    try {
      await negotiationApi.walkAway(session.id)
      showToast('No problem. Your plan has not changed.')
      navigate('/plans')
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  const status = result ? 'confirmed' : session?.status
  const title = session?.card_name ?? 'Negotiate'
  const description =
    status === 'active'
      ? `You are talking to ${session?.seller}. Give a real reason for a better rate.`
      : status === 'agreed'
        ? 'Check the numbers, then tap your card to switch.'
        : status === 'confirmed'
          ? 'Your plan has changed.'
          : 'Compare plans, then try for a better rate.'

  return (
    <>
      {/* All white here: the seller art brings the blue. */}
      <header className="container-x pt-10 md:pt-14">
        <p className="flex items-center gap-3 text-sm font-medium text-muted">
          <span aria-hidden className="block h-0.5 w-6 bg-signal" />
          Negotiate
        </p>
        <h1 className="mt-2 text-[clamp(2.25rem,5vw,4rem)] leading-[0.95] font-light tracking-[-0.04em] text-brand">{title}</h1>
        <p className="mt-3 max-w-xl text-lead text-muted">{description}</p>
      </header>

      <section className="container-x py-8 md:py-10">
        {session && status !== 'confirmed' && (
          <div className="mb-8">
            <SellerPortrait session={session} mood={moodOf(session)} />
          </div>
        )}

        <div aria-live="polite" className="mb-6">
          <FormError message={error} />
        </div>

        {!session && !error && (
          <div aria-busy="true" aria-label="Starting">
            <Skeleton className="h-72 w-full" />
          </div>
        )}

        {!session && error && <TextLink to="/plans">Back to plans</TextLink>}

        {session && status === 'active' && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <ChatPanel session={session} sending={sending} onSend={send} />
            <OfferPanel session={session} busy={busy || sending} onAccept={accept} onWalkAway={walkAway} />
          </div>
        )}

        {session && status === 'agreed' && (
          <ConfirmSwitch session={session} onConfirmed={setResult} onBack={walkAway} />
        )}

        {session && result && (
          <div className="max-w-2xl">
            <h2 className="text-d3 font-light tracking-[-0.02em]">
              You are now on {result.plan.card_name} at {pct(result.plan.apr_bp)}.
            </h2>
            <p className="mt-4 text-lead text-muted">
              Your new terms start now. Watch how they change the interest on your next statement.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/review">See your monthly review</ButtonLink>
              <ButtonLink to="/dashboard" variant="light" className="border border-ink">
                Back to dashboard
              </ButtonLink>
            </div>
          </div>
        )}

        {session && (status === 'declined' || status === 'expired') && (
          <div className="max-w-2xl">
            <h2 className="text-d3 font-light tracking-[-0.02em]">
              {status === 'expired' ? 'This negotiation timed out.' : 'You walked away.'}
            </h2>
            <p className="mt-4 text-lead text-muted">Your plan has not changed. You can start again any time.</p>
            <div className="mt-8">
              <ButtonLink to="/plans">Back to plans</ButtonLink>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
