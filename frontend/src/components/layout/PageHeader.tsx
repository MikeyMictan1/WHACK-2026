import type { ReactNode } from 'react'

type Props = {
  /** Small marker above the title, e.g. "01" or "Account". */
  marker: string
  title: string
  description?: ReactNode
}

/** A solid blue band under the nav with a light, oversized white title. */
export function PageHeader({ marker, title, description }: Props) {
  return (
    <header className="bg-brand text-white">
      <div className="container-x pt-12 pb-10 md:pt-16 md:pb-14">
        <p className="flex items-center gap-3 text-sm font-medium text-white/75">
          <span aria-hidden className="block h-0.5 w-6 bg-signal" />
          {marker}
        </p>
        <h1 className="mt-3 text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] font-light tracking-[-0.04em]">{title}</h1>
        {description && <p className="mt-5 max-w-xl text-lead text-white/85">{description}</p>}
      </div>
    </header>
  )
}
