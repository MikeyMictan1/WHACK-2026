import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { NAV_LINKS } from '../components/layout/navigation.ts'
import { CELL_BORDER, CELL_PAD, Cell, Sheet, SheetHeader } from '../components/layout/Sheet.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'
import { BlurBackdrop } from '../components/visual/BlurBackdrop.tsx'
import { Hero } from './Hero.tsx'
import { ProductMock } from './ProductMock.tsx'

const FEATURE_COPY: Record<string, string> = {
  '/feature-1': 'Say what the first feature does, in a sentence or two.',
  '/feature-2': 'Say what the second feature does, in a sentence or two.',
  '/ai': 'Ask anything and get an answer from Claude.',
}


export function FrontPage() {
  const { user } = useAuth()

  return (
    <>
      <Hero />

      <div className="container-x flex flex-col gap-16 py-16 md:gap-24 md:py-24">
        {/* Showcase */}
        <section aria-label="Showcase">
          <Sheet>
            <SheetHeader
              title="One app, front to back"
              note="The frontend talks to the backend from the first page load. Build on top of what is already running."
            />
            <Cell span={12} pad={false} className="relative isolate overflow-hidden">
              <BlurBackdrop />
              <div className="relative mx-auto max-w-[1040px] px-4 pt-10 sm:px-10 md:pt-16">
                <ProductMock />
              </div>
            </Cell>
            <Cell span={12} className="!py-4">
              <p className="meta">
                Sample dashboard with illustrative numbers. The status line in its title bar is live.
              </p>
            </Cell>
          </Sheet>
        </section>

        {/* Features */}
        <section aria-label="Features">
          <Sheet>
            <SheetHeader
              title="Three slots to fill"
              note="Each one has a folder in the frontend and a controller in the backend."
            />
            {NAV_LINKS.map((f) => (
              <Link
                key={f.to}
                to={f.to}
                className="group col-span-4 grid grid-cols-4 md:col-span-12 md:grid-cols-12"
              >
                <span className={`col-span-1 md:col-span-2 ${CELL_BORDER} ${CELL_PAD} text-sm font-medium text-muted group-hover:bg-sky`}>
                  {f.index}
                </span>
                <span className={`col-span-3 md:col-span-4 ${CELL_BORDER} ${CELL_PAD} text-d3 font-light group-hover:bg-sky`}>
                  {f.label}
                </span>
                <span className={`col-span-4 md:col-span-4 ${CELL_BORDER} ${CELL_PAD} text-muted group-hover:bg-sky`}>
                  {FEATURE_COPY[f.to]}
                </span>
                <span
                  className={`hidden items-center justify-between md:col-span-2 md:flex ${CELL_BORDER} ${CELL_PAD} text-[15px] font-medium group-hover:bg-signal`}
                >
                  Open
                  <span aria-hidden>↗</span>
                </span>
              </Link>
            ))}
          </Sheet>
        </section>
      </div>

      {/* Closing band */}
      <section className="bg-signal">
        <div className="container-x grid gap-10 py-20 md:grid-cols-[1fr_auto] md:items-end md:py-28">
          <h2 className="text-[clamp(3rem,9vw,8.5rem)] leading-[0.92] font-bold tracking-[-0.045em] uppercase">
            Your
            <br />
            turn.
          </h2>
          <ButtonLink to={user ? '/feature-1' : '/register'} variant="onAccent" className="md:mb-4">
            {user ? 'Explore features' : 'Create account'}
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
