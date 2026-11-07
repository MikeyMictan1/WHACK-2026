import { api } from '../lib/api.ts'
import type { LoginInput, RegisterInput, User } from './types.ts'

export const authApi = {
  me: () => api<User>('/auth/me'),
  login: (input: LoginInput) => api<User>('/auth/login', { method: 'POST', json: input }),
  register: (input: RegisterInput) => api<User>('/auth/register', { method: 'POST', json: input }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  /** Reads the NFC card on the reader and logs in as its owner. */
  loginWithCard: () => api<User>('/nfc/login', { method: 'POST' }),
  /** Waits (up to 60s) for a NEW card tap, moves the user's data onto it, then logs out. */
  logoutWithNfc: (signal?: AbortSignal) =>
    api<{ bytes_used: number; capacity: number }>('/nfc/logout', { method: 'POST', signal }),
  /** The "Back" button while waiting for a tap. */
  cancelLogoutWithNfc: () => api<void>('/nfc/logout/cancel', { method: 'POST' }),
}
