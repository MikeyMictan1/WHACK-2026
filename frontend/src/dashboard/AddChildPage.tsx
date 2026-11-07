import { useState } from 'react'
import { useNavigate } from 'react-router'
import { nameOf } from '../auth/types.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { showToast } from '../components/ui/toast.ts'
import { useWarnOnLeave } from '../lib/useWarnOnLeave.ts'
import { ChildForm } from './ChildForm.tsx'
import { childrenApi, type ChildInput } from './childrenApi.ts'

/** Its own page so the form has room to grow (more fields coming). */
export function AddChildPage() {
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useWarnOnLeave(dirty && !submitted)

  async function onSubmit(input: ChildInput) {
    const created = await childrenApi.create(input)
    setSubmitted(true)
    showToast(`${nameOf(created)} can now log in as @${created.username}`)
    navigate('/dashboard')
  }

  return (
    <>
      <PageHeader
        marker="Parent dashboard"
        title="Add a child"
        description="They log in on the same login page with the username and password you choose here."
      />

      <section className="container-x py-10 md:py-14">
        <div
          className="max-w-2xl border border-line bg-white p-6 md:p-8"
          onChangeCapture={() => setDirty(true)}
        >
          <ChildForm mode="create" onCancel={() => navigate('/dashboard')} onSubmit={onSubmit} />
        </div>
      </section>
    </>
  )
}
