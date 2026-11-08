import type { ReactNode } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'

type Section = { heading: string; body: ReactNode }

type Props = {
  title: string
  updated: string
  sections: Section[]
}

/** Shared layout for Terms and Privacy. The copy is a template placeholder, not legal advice. */
export function LegalPage({ title, updated, sections }: Props) {
  return (
    <>
      <PageHeader marker="Legal" title={title} description={`Last updated ${updated}.`} />
      <section className="container-x py-12 md:py-16">
        <p className="max-w-[68ch] bg-sky px-5 py-4 text-[15px]">
          Template placeholder. Replace this page with terms written for your product and
          reviewed by someone qualified before you launch.
        </p>
        <div className="mt-12 max-w-[68ch]">
          {sections.map((s, i) => (
            <section key={s.heading} className="border-t border-ink/15 py-8">
              <h2 className="text-d4 font-medium">
                <span className="mr-4 text-muted">{String(i + 1).padStart(2, '0')}</span>
                {s.heading}
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink/80">{s.body}</div>
            </section>
          ))}
        </div>
      </section>
    </>
  )
}
