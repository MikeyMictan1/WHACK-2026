import { PageHeader } from '../layout/PageHeader.tsx'
import { ApiStatus } from './ApiStatus.tsx'

type Props = {
  index: string
  title: string
  description: string
  endpoint: string
}

/** Placeholder scaffold shared by the feature pages. Replace per feature. */
export function FeaturePage({ index, title, description, endpoint }: Props) {
  return (
    <>
      <PageHeader marker={index} title={title} description={description} />

      <section className="container-x py-10 md:py-14">
        <ApiStatus endpoint={endpoint} />
        <div className="mt-6 flex aspect-[16/7] items-center justify-center border border-dashed border-ink/20">
          <span className="meta">Feature content goes here</span>
        </div>
      </section>
    </>
  )
}
