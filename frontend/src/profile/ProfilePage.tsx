import { useState } from 'react'
import { useNavigate } from 'react-router'
import { nameOf } from '../auth/types.ts'
import { useAuth } from '../auth/useAuth.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { showToast } from '../components/ui/toast.ts'
import { NfcLogoutScreen } from '../nfc/NfcLogoutScreen.tsx'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [nfcLogout, setNfcLogout] = useState(false)

  if (!user) return null

  async function onLogout() {
    setPending(true)
    // Leave the protected route first, otherwise RequireAuth redirects to /login.
    navigate('/', { replace: true })
    await logout()
  }

  async function onNfcLogoutDone() {
    // The server already logged us out; leave the protected route, then clear local state.
    navigate('/', { replace: true })
    showToast('Your data is on your NFC card. Tap it to log back in.')
    await logout()
  }

  const rows = [
    ['Username', user.username],
    [
      'Account type',
      user.role === 'admin' ? 'Admin (built in)' : user.role === 'parent' ? 'Parent' : 'Child (managed by your parent)',
    ],
    ['Member since', new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })],
    ['User ID', String(user.id)],
  ] as const

  return (
    <>
      <PageHeader marker="Account" title={nameOf(user)} />

      <section className="container-x py-10 md:py-14">
        <dl className="border-t border-ink">
          {rows.map(([term, value]) => (
            <div
              key={term}
              className="grid gap-1 border-b border-ink/15 py-5 sm:grid-cols-[180px_1fr] sm:gap-6"
            >
              <dt className="meta pt-1">{term}</dt>
              <dd className="text-d4 break-all">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button onClick={onLogout} disabled={pending}>
            {pending ? 'Logging out…' : 'Log out'}
          </Button>
          {user.role === 'child' && (
            <Button variant="light" onClick={() => setNfcLogout(true)} disabled={pending} className="border border-ink">
              Log out with NFC
            </Button>
          )}
        </div>
        {user.role === 'child' && (
          <p className="meta mt-3">
            “Log out” keeps your data on our system. “Log out with NFC” moves it onto your card and removes it from ours.
          </p>
        )}

        {nfcLogout && <NfcLogoutScreen onDone={onNfcLogoutDone} onBack={() => setNfcLogout(false)} />}
      </section>
    </>
  )
}
