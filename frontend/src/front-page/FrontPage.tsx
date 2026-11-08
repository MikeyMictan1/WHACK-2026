import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import logoBlue from '../assets/brand/logo-blue.png'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { Carousel } from './Carousel.tsx'

const LINKS = [
  { to: '/register', label: 'Create a family account' },
  { to: '/login', label: 'Log in' },
  { to: '/learn', label: 'How credit works' },
]

/**
 * Logged-out home. Top half white: the big wordmark on the left, the pitch and actions on the right.
 * Bottom half card blue: the carousel and quick links, then straight into the footer.
 * Logged in, the dashboard is home, so this sends you there.
 */
export function FrontPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/dashboard" replace />

  return (
    // On laptop screens and up, the white and blue halves together fill exactly one screen under the nav,
    // buttons included; the carousel takes whatever height is left. Phones scroll as normal.
    <div className="flex flex-col lg:h-[calc(100svh-5rem-1px)] lg:min-h-[600px]">
      <section className="shrink-0 bg-white">
        <div className="container-x grid items-center gap-8 py-10 md:py-14 lg:grid-cols-2 lg:gap-16 lg:py-[clamp(1.5rem,5svh,3.5rem)]">
          <img src={logoBlue} alt="Teenacredit" className="w-full max-w-[560px] lg:max-h-[26svh] lg:object-contain lg:object-left" />
          <div className="max-w-[540px]">
            <h1 className="text-[clamp(2rem,min(3.6vw,6svh),3.25rem)] leading-[1.04] font-light tracking-[-0.035em] text-brand">
              A physical, mock credit-card <span className="font-medium">for learning about credit.</span>
            </h1>
            <p className="mt-5 text-lead text-muted">
              Kids and teens spend, borrow and pay back with Whack Coins, tapping a real NFC card. Parents set the
              limits, approve the big stuff and see how the habits are going. Nobody loses a real penny learning.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <ButtonLink to="/register" className="h-14 px-8 text-base">
                Create account
              </ButtonLink>
              <TextLink to="/login" className="text-base text-brand">
                I already have one
              </TextLink>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col bg-brand lg:min-h-0 lg:flex-1">
        <span aria-hidden className="block h-1.5 shrink-0 bg-signal" />
        <Carousel className="relative min-h-[320px] md:min-h-[400px] lg:min-h-[160px] lg:flex-1" />
        <div className="container-x shrink-0 pt-3 pb-8 lg:pb-6">
          <nav aria-label="Get started" className="grid gap-2 sm:grid-cols-3 md:gap-3">
            {LINKS.map((f) => (
              <Link
                key={f.to}
                to={f.to}
                className="flex h-14 items-center justify-between bg-white px-5 text-base font-medium text-brand hover:bg-signal hover:text-white md:h-16 md:text-lg lg:h-14"
              >
                {f.label}
                <span aria-hidden>↗</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </div>
  )
}
