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
    <>
      <section className="bg-white">
        <div className="container-x grid items-center gap-10 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
          <img src={logoBlue} alt="Teenacredit" className="w-full max-w-[640px]" />
          <div className="max-w-[520px]">
            <h1 className="text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.02] font-light tracking-[-0.035em] text-brand">
              A first credit card,
              <br />
              <span className="font-medium">with play money.</span>
            </h1>
            <p className="mt-6 text-lead text-muted">
              Kids and teens spend, borrow and pay back with Whack Coins, tapping a real NFC card. Parents set the
              limits, approve the big stuff and see how the habits are going. Nobody loses a real penny learning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
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

      <section className="flex flex-col bg-brand">
        <span aria-hidden className="block h-1.5 bg-signal" />
        <Carousel className="relative min-h-[380px] md:min-h-[460px]" />
        <div className="container-x pt-4 pb-12">
          <nav aria-label="Get started" className="grid gap-2 sm:grid-cols-3 md:gap-3">
            {LINKS.map((f) => (
              <Link
                key={f.to}
                to={f.to}
                className="flex h-14 items-center justify-between bg-white px-5 text-base font-medium text-brand hover:bg-signal hover:text-white md:h-16 md:text-lg"
              >
                {f.label}
                <span aria-hidden>↗</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </>
  )
}
