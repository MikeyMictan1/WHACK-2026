import { Link } from 'react-router'
import { Logo } from './Logo.tsx'

const LEGAL = [
  { to: '/learn', label: 'Info pages' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
]

export function Footer() {
  return (
    <footer className="bg-brand-2 text-white">
      <div className="container-x flex flex-wrap items-center justify-between gap-6 pt-10 pb-28">
        <Logo tone="white" className="h-8" />
        <ul className="flex gap-8">
          {LEGAL.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="text-sm text-white/75 underline-offset-4 hover:text-white hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="w-full text-xs text-white/60">Play money only. Whack Coins (WC) are not real currency.</p>
      </div>
    </footer>
  )
}
