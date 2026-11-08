import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import logoBlue from '../../assets/brand/logo-blue.png'
import logoWhite from '../../assets/brand/logo-white.png'

/** The Teenacredit wordmark. `tone="white"` for blue bands. Goes to the dashboard once logged in. */
export function Logo({ tone = 'blue', className = 'h-9' }: { tone?: 'blue' | 'white'; className?: string }) {
  const { user } = useAuth()
  return (
    <Link to={user ? '/dashboard' : '/'} className="flex shrink-0 items-center" aria-label="Teenacredit, home">
      <img src={tone === 'white' ? logoWhite : logoBlue} alt="" className={`w-auto ${className}`} />
    </Link>
  )
}
