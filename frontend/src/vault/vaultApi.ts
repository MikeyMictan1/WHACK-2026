import { api } from '../lib/api.ts'

/** The user's data. Stored on our system, or carried on their NFC card after "Log out with NFC". */
export type VaultData = Record<string, unknown>
export type Vault = { location: 'system' | 'card'; data: VaultData }

export const vaultApi = {
  get: () => api<Vault>('/vault'),
  put: (data: VaultData) => api<Vault>('/vault', { method: 'PUT', json: data }),
}
