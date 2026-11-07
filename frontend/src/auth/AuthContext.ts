import { createContext } from 'react'
import type { LoginInput, RegisterInput, User } from './types.ts'

export type AuthState = {
  user: User | null
  /** True until the initial /auth/me check has finished. */
  loading: boolean
  login: (input: LoginInput) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  /** Log in with the NFC card currently on the reader. */
  loginWithCard: () => Promise<User>
}

export const AuthContext = createContext<AuthState | null>(null)
