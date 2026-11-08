import type { Role } from '../../auth/types.ts'

export type NavItem = { to: string; label: string }

/** The main nav for whoever is looking. The dashboard is home once you are logged in. */
export function navLinks(role: Role | null): NavItem[] {
  if (role === 'child')
    return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/shop', label: 'Shop' },
      { to: '/earn', label: 'Earn' },
      { to: '/led', label: 'LED Display' },
      { to: '/card', label: 'Credit card' },
    ]
  if (role === 'parent' || role === 'admin') return [{ to: '/dashboard', label: 'Dashboard' }]
  return [
    { to: '/', label: 'Home' },
    { to: '/learn', label: 'How credit works' },
  ]
}
