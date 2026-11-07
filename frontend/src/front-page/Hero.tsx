import { useAuth } from '../auth/useAuth.ts'
import { ButtonLink, TextLink } from '../components/ui/Button.tsx'
import { BlurBackdrop } from '../components/visual/BlurBackdrop.tsx'
import { Flashlight } from '../components/visual/Flashlight.tsx'
import { Link } from 'react-router'
import { NAV_LINKS } from '../components/layout/navigation.ts'
import { Carousel } from './Carousel.tsx'
import { Mascot } from './Mascot.tsx'

export function Hero() {
  const { user } = useAuth()

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden lg:h-[100svh] lg:min-h-[720px]">
      <BlurBackdrop />
      <Flashlight />

      <div className="container-x relative flex flex-wrap items-end justify-between gap-8 pt-28 lg:grid lg:grid-cols-[auto_minmax(200px,1fr)_minmax(0,480px)] lg:items-stretch lg:gap-x-12">
        <h1 className="text-[clamp(3.25rem,min(7.4vw,11svh),7rem)] leading-[0.95] font-light tracking-[-0.045em] text-white">
          GIDDY UP 
          <br />
          GLITCH
          <br />
          <span className="text-signal">WHACK 26'</span>
        </h1>
        <Mascot className="hidden h-[clamp(220px,24vw,340px)] self-end justify-self-center lg:block" />
        {/*
          Spans the headline's full height: text from the top, actions on the baseline.
          Right-aligned on wide screens, mirroring the left-aligned headline around the mascot.
        */}
        <div className="flex max-w-[480px] flex-col justify-between gap-8 lg:max-w-none lg:items-end lg:py-1 lg:text-right">
          <p className="text-lg leading-relaxed text-white/90 md:text-xl lg:text-[clamp(1.45rem,2vw,1.95rem)] lg:leading-[1.3]">
            A template for Giddy Up Glitch to use for Whack 26'. React and Tailwind frontend on a FastAPI backend, with login already working. Three feature slots that need to be built.
          </p>
          <div className="flex items-center gap-8">
            <ButtonLink to="/dashboard" variant="light" className="h-14 border border-ink/10 px-8 text-base">
              Explore features
            </ButtonLink>
            {!user && (
              <TextLink to="/register" className="text-base text-white">
                Create account
              </TextLink>
            )}
          </div>
        </div>
      </div>

      <Carousel className="relative mt-6 min-h-[380px] flex-1 lg:min-h-0" />

      <div className="container-x relative pt-4 pb-8">
        <nav aria-label="Features" className="grid gap-2 sm:grid-cols-3 md:gap-3">
          {NAV_LINKS.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="flex h-14 items-center justify-between border border-ink/10 bg-white px-5 text-base font-medium text-ink hover:bg-signal md:h-16 md:text-lg"
            >
              {f.label}
              <span aria-hidden>↗</span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  )
}
