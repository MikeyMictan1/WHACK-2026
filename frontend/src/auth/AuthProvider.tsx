import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './AuthContext.ts'
import { authApi } from './authApi.ts'
import type { LoginInput, RegisterInput, User } from './types.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (input: LoginInput) => {
    const u = await authApi.login(input)
    setUser(u)
    return u
  }

  const register = async (input: RegisterInput) => {
    const u = await authApi.register(input)
    setUser(u)
    return u
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  const loginWithCard = async () => {
    const u = await authApi.loginWithCard()
    setUser(u)
    return u
  }

  const loginWithPhoneCard = async (uid: string) => {
    const u = await authApi.loginWithPhoneCard(uid)
    setUser(u)
    return u
  }

  return (
    <AuthContext value={{ user, loading, login, register, logout, loginWithCard, loginWithPhoneCard }}>
      {children}
    </AuthContext>
  )
}
