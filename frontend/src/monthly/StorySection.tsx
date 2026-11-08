import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { Skeleton } from '../components/ui/Skeleton.tsx'
import { showToast } from '../components/ui/toast.ts'
import { api } from '../lib/api.ts'

export type Story = {
  statement_number: number
  created_at: string
  headline: string
  story: string
  tip: string
  /** True when the built-in summary wrote it because the AI was not available. */
  scripted: boolean
}

/** The monthly wrap: a short written story of the month, at the top of the review. Nothing shows before a first statement. */
export function StorySection({ refreshKey }: { refreshKey: string }) {
  const [story, setStory] = useState<Story | null | undefined>(undefined) // undefined = loading
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    api<Story | null>('/story')
      .then(setStory)
      .catch(() => setStory(null))
  }, [refreshKey]) // a new statement, or paying this one, earns a new story

  async function retry() {
    setRetrying(true)
    try {
      const next = await api<Story | null>('/story/retry', { method: 'POST' })
      setStory(next)
      if (next?.scripted) showToast('The writing helper is still busy. Try again in a bit.', 'info')
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setRetrying(false)
    }
  }

  if (story === undefined) return <Skeleton className="mb-10 h-32 w-full" />
  if (story === null) return null

  return (
    <div className="mb-10 border border-ink/20 bg-sky p-6 md:p-8">
      <p className="meta text-ink/70">Your month, statement {story.statement_number}</p>
      <h2 className="mt-2 text-d3 font-light tracking-[-0.02em]">{story.headline}</h2>
      <p className="mt-4 max-w-prose text-lead">{story.story}</p>
      <p className="meta mt-6 text-ink/70">Try next month</p>
      <p className="mt-1 max-w-prose">{story.tip}</p>
      {story.scripted && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="text-sm text-ink/70">This summary was written from your numbers without the AI.</p>
          <Button size="sm" variant="light" className="border border-ink" onClick={retry} disabled={retrying}>
            {retrying ? 'Trying…' : 'Write it again'}
          </Button>
        </div>
      )}
    </div>
  )
}
