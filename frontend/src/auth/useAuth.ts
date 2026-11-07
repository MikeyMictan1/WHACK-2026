import { use } from 'react'
import { AuthContext } from './AuthContext.ts'

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
