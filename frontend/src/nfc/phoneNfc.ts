/**
 * Read an NFC card with the phone itself (Web NFC: Chrome on Android, HTTPS only).
 * We only need the card's id (serial number); the backend checks it like a reader tap.
 * iPhones and desktop browsers don't have Web NFC, so callers hide the option there.
 */

type NdefReadingEvent = Event & { serialNumber?: string }
type NdefReader = EventTarget & { scan: (options?: { signal?: AbortSignal }) => Promise<void> }

export const phoneNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

/** Resolves with the card id once a card touches the phone. Rejects on error or abort. */
export function scanCard(signal: AbortSignal): Promise<string> {
  const Reader = (window as unknown as { NDEFReader: new () => NdefReader }).NDEFReader
  const reader = new Reader()
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
    reader.addEventListener('reading', (event) => {
      const id = (event as NdefReadingEvent).serialNumber
      if (id) resolve(id)
      else reject(new Error('Couldn’t read this card’s ID. Try an NTAG card.'))
    })
    reader.addEventListener('readingerror', () =>
      reject(new Error('Couldn’t read that card. Hold it still on the back of the phone, or try an NTAG card.')),
    )
    reader.scan({ signal }).catch((err: Error) => {
      if (err.name === 'AbortError') return
      reject(
        new Error(
          err.name === 'NotAllowedError'
            ? 'NFC permission was blocked. Allow NFC for this site in Chrome, then try again.'
            : err.name === 'NotSupportedError' || err.name === 'NotReadableError'
              ? 'NFC is off or not available. Turn on NFC in the phone’s settings.'
              : err.message,
        ),
      )
    })
  })
}
