import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'

/** The child's home. Placeholder until cards, rewards and goals are built. */
export function ChildDashboard({ child }: { child: User }) {
  const rows = [
    ['Username', `@${child.username}`],
    ['Weekly allowance', child.weekly_allowance != null ? `${child.weekly_allowance}p` : '—'],
    ['Account', 'Managed by your parent'],
  ] as const

  return (
    <>
      <PageHeader
        marker="Your dashboard"
        title={`Hi, ${nameOf(child)}.`}
        description="Your card, balance, rewards and goals will show up here."
      />

      <section className="container-x py-10 md:py-14">
        <dl className="border-t border-ink">
          {rows.map(([term, value]) => (
            <div key={term} className="grid gap-1 border-b border-ink/15 py-5 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="meta pt-1">{term}</dt>
              <dd className="text-d4">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10">
          <ButtonLink to="/profile" variant="light" className="border border-ink">
            Account and log out
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
