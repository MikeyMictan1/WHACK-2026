import type { ReactNode } from 'react'

type Props = {
  title: string
  aside: ReactNode
  children: ReactNode
}

/** Blue band with the form on a solid white panel. */
export function AuthLayout({ title, aside, children }: Props) {
  return (
    <div className="flex min-h-[calc(100svh-5rem)] items-center bg-brand">
      <div className="container-x grid gap-12 py-16 lg:grid-cols-[1fr_440px] lg:items-end">
        <div>
          <h1 className="text-[clamp(3.25rem,7.2vw,6.75rem)] leading-[0.95] font-light tracking-[-0.04em] text-white">
            {title}
          </h1>
          <p className="mt-6 max-w-sm text-[15px] text-white/85">{aside}</p>
        </div>
        <div className="border-t-4 border-signal bg-white p-6 md:p-8">{children}</div>
      </div>
    </div>
  )
}
