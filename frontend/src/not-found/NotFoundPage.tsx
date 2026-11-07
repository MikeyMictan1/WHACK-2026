import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'

export function NotFoundPage() {
  return (
    <>
      <PageHeader marker="404" title="Page not found." description="The address may be mistyped, or the page has moved." />
      <div className="container-x grid-12 py-12">
        <div className="col-span-full md:col-start-3">
          <ButtonLink to="/">Back to home</ButtonLink>
        </div>
      </div>
    </>
  )
}
