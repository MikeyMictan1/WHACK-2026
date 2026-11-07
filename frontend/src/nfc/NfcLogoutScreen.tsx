import { useEffect, useRef, useState } from 'react'
import { authApi } from '../auth/authApi.ts'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'

type Props = {
  /** Data is on the card and the server has logged the user out. */
  onDone: () => void
  /** "Back": stop waiting, stay logged in. */
  onBack: () => void
}

/** Full-screen "Tap your NFC card now" step of "Log out with NFC". */
export function NfcLogoutScreen({ onDone, onBack }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    const ctrl = new AbortController()
    authApi
      .logoutWithNfc(ctrl.signal)
      .then(() => done.current())
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) setError(err.message)
      })
    return () => ctrl.abort()
  }, [attempt])

  function back() {
    void authApi.cancelLogoutWithNfc().catch(() => {})
    onBack()
  }

  function retry() {
    setError(null)
    setAttempt((a) => a + 1)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nfc-tap-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-paper px-4"
    >
      <div className="w-full max-w-md text-center">
        <p className="meta">Log out with NFC</p>
        <h2 id="nfc-tap-title" className="mt-3 text-d3 font-medium">
          {error ? 'That didn’t work' : 'Tap your NFC card now'}
        </h2>
        {error ? (
          <div className="mt-6 text-left">
            <FormError message={error} />
          </div>
        ) : (
          <>
            <p className="mt-4 text-muted">
              Hold a blank card on the reader. Your data moves onto it and is removed from our system. If the card is
              already on the reader, lift it and tap again.
            </p>
            <span aria-hidden className="mx-auto mt-8 block h-3 w-3 animate-ping rounded-full bg-ink" />
          </>
        )}
        <div className="mt-10 flex justify-center gap-3">
          <Button variant="light" onClick={back} className="border border-ink/20">
            Back
          </Button>
          {error && <Button onClick={retry}>Try again</Button>}
        </div>
      </div>
    </div>
  )
}
