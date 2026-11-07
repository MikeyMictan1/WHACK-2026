import { useEffect, useState } from 'react'
import { FormError } from '../components/ui/FormError.tsx'
import { vaultApi, type Vault } from './vaultApi.ts'

/**
 * The user's data as JSON. Saved to our system when the box loses focus.
 * Feature pages can read/write the same data through vaultApi.
 */
export function VaultPanel() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    vaultApi.get().then((v) => {
      setVault(v)
      setText(JSON.stringify(v.data, null, 2))
    })
  }, [])

  async function save() {
    if (saved) return
    let data: Record<string, unknown>
    try {
      data = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      setError('That isn’t valid JSON, so it wasn’t saved.')
      return
    }
    try {
      await vaultApi.put(data)
      setError(null)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!vault) return null

  return (
    <div className="mt-12 border-t border-ink pt-8">
      <h2 className="text-d4 font-medium">Your data</h2>

      {vault.location === 'card' ? (
        <p className="mt-4 border-l-2 border-ink bg-ink/5 px-4 py-3 text-sm">
          Your data is on your NFC card, not on our system. Log out, then tap the card to bring it back.
        </p>
      ) : (
        <>
          <p className="meta mt-2">
            Stored on our system. Use “Log out with NFC” to move it onto your card instead.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSaved(false)
            }}
            onBlur={save}
            spellCheck={false}
            rows={10}
            className="mt-4 w-full border border-ink/20 bg-white p-4 font-mono text-sm text-ink outline-none hover:border-ink/40 focus:border-ink"
            placeholder='{ "balance": 120.50 }'
          />
          <p className="meta mt-1">{saved ? 'Saved' : 'Unsaved changes, saved when you click away'}</p>
          <div className="mt-4">
            <FormError message={error} />
          </div>
        </>
      )}
    </div>
  )
}
