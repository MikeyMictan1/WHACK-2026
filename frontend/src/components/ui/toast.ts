export const TOAST_EVENT = 'app:toast'

/** Show a short message at the bottom of the screen (rendered by <Toaster />), from anywhere. */
export function showToast(message: string, tone: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }))
}
