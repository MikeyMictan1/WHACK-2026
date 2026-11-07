import { Link } from 'react-router'
import { Logo } from './Logo.tsx'

const LEGAL = [
  { to: '/learn', label: 'Info pages' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
]

export function Footer() {
  return (
    <footer className="border-t border-ink/15">
      <div className="container-x flex items-center justify-between gap-6 pt-8 pb-28">
        <Logo />
        <ul className="flex gap-8">
          {LEGAL.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
