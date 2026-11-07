import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { useAuth } from './useAuth.ts'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="container-x py-24" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-5 h-16 w-2/3 max-w-xl" />
        <Skeleton className="mt-12 h-40 w-full" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
