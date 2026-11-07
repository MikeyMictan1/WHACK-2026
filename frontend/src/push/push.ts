import { api } from '../lib/api.ts'

/**
 * Phone notifications (Web Push). The service worker (public/sw.js) shows them; the backend
 * (models/push.py) sends them. Works in Chrome/Edge/Firefox, and on iPhone only once the site
 * is added to the home screen (iOS 16.4+).
 */

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const bin = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

/** Where this browser stands. Also re-sends an existing subscription, so the server has it. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return 'off'
  await api<void>('/push/subscribe', { method: 'POST', json: sub.toJSON() }).catch(() => {})
  return 'on'
}

/** Ask permission and subscribe. Must run from a click. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? 'needs-install' : 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await registration()
  const { key } = await api<{ key: string }>('/push/key')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
  await api<void>('/push/subscribe', { method: 'POST', json: sub.toJSON() })
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription()
  if (sub) {
    await api<void>('/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

export const sendTestPush = () => api<void>('/push/test', { method: 'POST' })
