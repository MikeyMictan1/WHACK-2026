import { useEffect } from 'react'

const MESSAGE = 'Your progress will be lost if you leave this page.'

/**
 * Warns before the tab closes/reloads, and traps the browser back button
 * behind a confirm, while `active`. Uses BrowserRouter (no data router here),
 * so back-button interception is done by hand via a history sentinel entry.
 */
export function useWarnOnLeave(active: boolean) {
  useEffect(() => {
    if (!active) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    window.history.pushState(null, '', window.location.href)
    const onPopState = () => {
      if (window.confirm(MESSAGE)) {
        window.history.go(-1)
      } else {
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
  }, [active])
}
