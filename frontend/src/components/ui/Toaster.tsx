import { useEffect, useState } from 'react'
import { TOAST_EVENT } from './toast.ts'

type Toast = { message: string; tone: 'info' | 'error'; id: number }

/** Renders messages sent with showToast(). Mounted once in Layout. */
export function Toaster() {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    let timer: number | undefined
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<Toast, 'id'>>).detail
      setToast({ message, tone, id: Date.now() })
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToast(null), 5000)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      window.clearTimeout(timer)
    }
  }, [])

  if (!toast) return null
  return (
    <div
      key={toast.id}
      role="status"
      className={`fixed inset-x-4 bottom-6 z-[110] mx-auto max-w-md px-5 py-4 text-sm shadow-lg ${
        toast.tone === 'error' ? 'bg-red-700 text-white' : 'bg-ink text-white'
      }`}
    >
      {toast.message}
    </div>
  )
}
