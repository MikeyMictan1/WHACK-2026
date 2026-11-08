import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { showToast } from '../components/ui/toast.ts'

type NfcEvent =
  | { type: 'hello'; connected: boolean; name: string | null }
  | { type: 'reader'; connected: boolean; name: string | null }
  | { type: 'card'; uid: string }
  | { type: 'card_removed' }

/**
 * Listens to the backend's NFC bridge (/api/nfc/events).
 *
 *  - Logged out + tap: log in as the child the card belongs to (saved data on the card comes back).
 *  - Logged in + tap: nothing here. Taps only act on screens that ask for one (pay, switch plan,
 *    "Log out with NFC"); those screens wait for the tap on the backend.
 */
export function useNfc() {
  const navigate = useNavigate()
  const { user, loading, loginWithCard } = useAuth()
  // The EventSource lives for the whole session, so read the latest values through a ref.
  const latest = useRef({ user, loading, loginWithCard, navigate })
  useEffect(() => {
    latest.current = { user, loading, loginWithCard, navigate }
  })

  useEffect(() => {
    const source = new EventSource('/api/nfc/events')

    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as NfcEvent
      const { user, loading, loginWithCard, navigate } = latest.current
      if (event.type !== 'card' || user || loading) return

      loginWithCard()
        .then((u) => {
          showToast(`Welcome back, ${u.username}.`)
          navigate('/dashboard')
        })
        .catch((err: Error) => showToast(err.message, 'error'))
    }

    return () => source.close()
  }, [])
}
