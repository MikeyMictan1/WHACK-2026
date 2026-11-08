import { useState } from 'react'
import { NavLink } from 'react-router'
import { nameOf } from '../../auth/types.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { Logo } from './Logo.tsx'
import { navLinks } from './navigation.ts'

/** Blue text links on the white bar. Active page is underlined in red; hover underlines too. */
const link = ({ isActive }: { isActive: boolean }) =>
  `text-[15px] underline-offset-[8px] decoration-2 hover:underline ${
    isActive ? 'font-medium text-brand underline decoration-signal' : 'text-brand/80 hover:text-brand'
  }`

/** A solid white bar with the blue wordmark. Links depend on who is logged in. */
export function NavBar() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const links = navLinks(user?.role ?? null)
  const account = user ? { to: '/profile', label: nameOf(user) } : { to: '/login', label: 'Log in' }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white">
      <div className="container-x flex h-16 items-center justify-between gap-6 md:h-20">
        <Logo className="h-8 md:h-10" />

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex lg:gap-10">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={link}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden min-w-24 justify-end md:flex">
          {loading ? (
            <span aria-hidden className="block h-4 w-14 animate-pulse bg-sky" />
          ) : (
            <NavLink to={account.to} className={link}>
              {account.label}
            </NavLink>
          )}
        </div>

        <button
          type="button"
          className="text-[15px] font-medium text-brand underline-offset-[8px] hover:underline md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line bg-white text-ink md:hidden">
          <ul className="container-x">
            {[...links, account].map((l) => (
              <li key={l.to} className="border-b border-line last:border-b-0">
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  onClick={close}
                  className={({ isActive }) => `block py-5 text-d4 ${isActive ? 'font-medium text-brand' : 'text-ink/60'}`}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
