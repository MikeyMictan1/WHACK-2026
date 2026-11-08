import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { showToast } from '../components/ui/toast.ts'
import { adminApi } from './adminApi.ts'

/** Frees every NFC card so it can be linked to a child again. Wiping a card can't do this:
 * the link is kept by the card's serial number, which never changes. */
export function CardLinksPanel() {
  const [pending, setPending] = useState(false)

  async function unlinkAll() {
    if (!window.confirm('Unlink every NFC card from every child? Each child links a card again on their next tap.')) return
    setPending(true)
    try {
      const { unlinked } = await adminApi.unlinkAllCards()
      showToast(unlinked === 1 ? 'Unlinked 1 card' : `Unlinked ${unlinked} cards`)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light tracking-[-0.02em]">NFC cards</h2>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <p className="max-w-xl text-muted">
          Cards are linked to a child by their built-in serial number, so wiping a card in an app doesn't free it.
          This forgets every link. Accounts, money and history stay as they are, and each child's next tap links that
          card.
        </p>
        <Button onClick={unlinkAll} disabled={pending}>
          {pending ? 'Unlinking…' : 'Unlink all cards'}
        </Button>
      </div>
    </div>
  )
}
