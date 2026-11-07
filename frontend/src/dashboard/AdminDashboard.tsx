import { useEffect, useState } from 'react'
import { nameOf, type User } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { ButtonLink } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { formatMoney } from '../lib/money.ts'
import { adminApi, type Family } from './adminApi.ts'
import { SiteClockPanel } from './SiteClockPanel.tsx'

function joined(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' })
}

/** The built-in admin's home: every parent account and the child accounts they manage. */
export function AdminDashboard({ admin }: { admin: User }) {
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .parents()
      .then(setFamilies)
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  const childCount = families?.reduce((n, f) => n + f.children.length, 0) ?? 0

  return (
    <>
      <PageHeader
        marker="Admin"
        title={`Hi, ${nameOf(admin)}.`}
        description="Every parent on the platform and the child accounts they manage."
      />

      <section className="container-x py-10 md:py-14">
        <SiteClockPanel />

        <div className="mt-14 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
          <h2 className="text-d3 font-light tracking-[-0.02em]">Parents</h2>
          {families && (
            <p className="meta">
              {families.length} {families.length === 1 ? 'parent' : 'parents'} · {childCount}{' '}
              {childCount === 1 ? 'child' : 'children'}
            </p>
          )}
        </div>

        {loadError && (
          <div className="mt-6">
            <FormError message={loadError} />
          </div>
        )}

        {!families && !loadError && (
          <div aria-busy="true" aria-label="Loading">
            <Skeleton className="mt-6 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        )}

        {families && families.length === 0 && <p className="py-8 text-muted">No parent accounts yet.</p>}

        {families && families.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/20">
                  <th className="meta py-3 pr-4 font-normal">Parent</th>
                  <th className="meta py-3 pr-4 font-normal">Username</th>
                  <th className="meta py-3 pr-4 font-normal">Joined</th>
                  <th className="meta py-3 font-normal">Child accounts</th>
                </tr>
              </thead>
              <tbody>
                {families.map(({ parent, children }) => (
                  <tr key={parent.id} className="border-b border-ink/15 align-top">
                    <td className="py-4 pr-4 font-medium">{nameOf(parent)}</td>
                    <td className="py-4 pr-4">@{parent.username}</td>
                    <td className="py-4 pr-4 tabular-nums text-muted">{joined(parent.created_at)}</td>
                    <td className="py-4">
                      {children.length === 0 ? (
                        <span className="text-muted">None</span>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {children.map((c) => (
                            <li key={c.id}>
                              <span className="font-medium">{nameOf(c)}</span>{' '}
                              <span className="text-muted">
                                @{c.username}
                                {c.weekly_allowance != null && ` · ${formatMoney(c.weekly_allowance)}/wk`}
                                {c.app_experience && ` · ${c.app_experience}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-14 flex flex-wrap gap-3 border-t border-line pt-8">
          <ButtonLink to="/profile" variant="light" className="border border-ink">
            Account and log out
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
