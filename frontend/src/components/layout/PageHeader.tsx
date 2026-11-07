import type { ReactNode } from 'react'
import { BlurBackdrop } from '../visual/BlurBackdrop.tsx'

type Props = {
  /** Small marker above the title, e.g. "01" or "Account". */
  marker: string
  title: string
  description?: ReactNode
}

/** Band of the site backdrop with a light, oversized title. */
export function PageHeader({ marker, title, description }: Props) {
  return (
    <header className="relative isolate overflow-hidden border-b border-ink/10">
      <BlurBackdrop />
      <div className="container-x relative pt-32 pb-12 md:pt-40 md:pb-16">
        <p className="text-sm font-medium text-white/70">{marker}</p>
        <h1 className="mt-3 text-[clamp(3rem,7vw,6.5rem)] leading-[0.95] font-light tracking-[-0.04em] text-white">
          {title}
        </h1>
        {description && <p className="mt-6 max-w-xl text-lead text-white/85">{description}</p>}
      </div>
    </header>
  )
}
