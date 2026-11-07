import { Link } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Whack, home">
      <svg aria-hidden viewBox="0 0 20 20" className="size-5">
        <rect x="0" y="0" width="11" height="11" fill="currentColor" />
        <rect x="9" y="9" width="11" height="11" fill="currentColor" opacity="0.4" />
      </svg>
      <span className="text-lg font-semibold tracking-[-0.02em]">Whack</span>
    </Link>
  )
}
