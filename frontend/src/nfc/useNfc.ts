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
 *  - Logged out + tap: log in with the card's data (it moves to our system, the card goes blank).
 *  - Logged in + tap: nothing. Cards only act during "Log out with NFC" (NfcLogoutScreen).
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
          showToast(`Welcome back, ${u.username}. Your data is back and the card is blank again.`)
          navigate('/profile')
        })
        .catch((err: Error) => showToast(err.message, 'error'))
    }

    return () => source.close()
  }, [])
}
