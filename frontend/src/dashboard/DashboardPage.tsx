import { useAuth } from '../auth/useAuth.ts'
import { ChildDashboard } from './ChildDashboard.tsx'
import { ParentDashboard } from './ParentDashboard.tsx'

/** /dashboard: parents see family management, kids see their own home. */
export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null
  return user.role === 'parent' ? <ParentDashboard parent={user} /> : <ChildDashboard child={user} />
}
