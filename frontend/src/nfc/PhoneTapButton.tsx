import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { phoneNfcSupported, scanCard } from './phoneNfc.ts'

type Props = {
  /** Called with the card id once the card touches the phone. Throw to show an error. */
  onTap: (cardUid: string) => Promise<void>
  onError: (message: string | null) => void
  label?: string
  disabled?: boolean
  className?: string
}

/**
 * "Tap card on this phone": reads the card with the phone's own NFC (Android Chrome).
 * Renders nothing where Web NFC isn't available (iPhone, desktop).
 */
export function PhoneTapButton({ onTap, onError, label = 'Tap card on this phone', disabled, className = '' }: Props) {
  const [scanning, setScanning] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])

  if (!phoneNfcSupported) return null

  async function start() {
    onError(null)
    const c = new AbortController()
    ctrl.current = c
    setScanning(true)
    try {
      const uid = await scanCard(c.signal)
      c.abort() // stop the phone listening once we have the card
      await onTap(uid)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onError((err as Error).message)
    } finally {
      setScanning(false)
    }
  }

  if (scanning) {
    return (
      <div className={`border border-ink bg-signal p-4 text-left ${className}`}>
        <p className="font-medium">Hold your card on the back of the phone.</p>
        <Button size="sm" variant="onAccent" className="mt-3" onClick={() => ctrl.current?.abort()}>
          Stop
        </Button>
      </div>
    )
  }
  return (
    <Button variant="light" className={`border border-ink ${className}`} onClick={start} disabled={disabled}>
      {label}
    </Button>
  )
}
