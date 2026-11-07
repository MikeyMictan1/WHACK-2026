import { useAuth } from '../auth/useAuth.ts'
import { AdminDashboard } from './AdminDashboard.tsx'
import { ChildDashboard } from './ChildDashboard.tsx'
import { ParentDashboard } from './ParentDashboard.tsx'

/** /dashboard: parents see family management, kids see their own home, the admin sees admin. */
export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null
  if (user.role === 'admin') return <AdminDashboard admin={user} />
  return user.role === 'parent' ? <ParentDashboard parent={user} /> : <ChildDashboard child={user} />
}
