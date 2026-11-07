import { useState } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { Logo } from './Logo.tsx'
import { NAV_LINKS } from './navigation.ts'

/** Plain floating text links. Active page is underlined; hover underlines too. */
const link = ({ isActive }: { isActive: boolean }) =>
  `text-[15px] underline-offset-[8px] decoration-[1.5px] hover:underline ${
    isActive ? 'font-medium text-white underline' : 'text-white/75 hover:text-white'
  }`

/**
 * No bar: the links sit over the page and scroll away with it.
 * The hero runs underneath; other pages are padded by Layout.
 */
export function NavBar() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const account = user ? { to: '/profile', label: user.username } : { to: '/login', label: 'Log in' }

  return (
    <header className="absolute inset-x-0 top-0 z-50 text-white">
      <div className="container-x flex h-20 items-center justify-between gap-6">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-10 md:flex">
          <NavLink to="/" end className={link}>
            Home
          </NavLink>
          {NAV_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={link}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden w-24 justify-end md:flex">
          {loading ? (
            <span aria-hidden className="block h-4 w-14 animate-pulse bg-white/30" />
          ) : (
            <NavLink to={account.to} className={link}>
              {account.label}
            </NavLink>
          )}
        </div>

        <button
          type="button"
          className="text-[15px] font-medium underline-offset-[8px] hover:underline md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-y border-ink/10 bg-paper text-ink md:hidden">
          <ul className="container-x">
            {[{ to: '/', label: 'Home' }, ...NAV_LINKS, account].map((l) => (
              <li key={l.to} className="border-b border-ink/10 last:border-b-0">
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  onClick={close}
                  className={({ isActive }) =>
                    `block py-5 text-d4 ${isActive ? 'font-medium text-ink' : 'text-ink/60'}`
                  }
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
