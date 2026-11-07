import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { TextLink } from '../components/ui/Button.tsx'
import { TOPICS, type Topic } from './content.ts'
import { Demo } from './demos.tsx'

const STORAGE_KEY = 'whack.learn.opened'

function loadOpened(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveOpened(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // storage blocked: progress just will not be remembered
  }
}

/** The lesson named in the URL (/learn#apr), if there is one. */
function topicFromHash(hash: string): string | null {
  const id = hash.slice(1)
  return TOPICS.some((t) => t.id === id) ? id : null
}

/** /learn: short lessons you open one at a time, each with something to play with. */
export function LearnPage() {
  const { hash } = useLocation()
  const [open, setOpen] = useState<Set<string>>(() => new Set(topicFromHash(hash) ? [hash.slice(1)] : []))
  const [seen, setSeen] = useState<string[]>(() => {
    const fromHash = topicFromHash(hash)
    const stored = loadOpened()
    return fromHash && !stored.includes(fromHash) ? [...stored, fromHash] : stored
  })
  const [lastHash, setLastHash] = useState(hash)

  // The URL hash changed while we are on this page (a link from the AI helper): open that lesson.
  if (hash !== lastHash) {
    setLastHash(hash)
    const id = topicFromHash(hash)
    if (id) {
      setOpen((prev) => new Set(prev).add(id))
      setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }
  }

  useEffect(() => saveOpened(seen), [seen])

  useEffect(() => {
    const id = topicFromHash(hash)
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [hash])

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const done = TOPICS.filter((t) => seen.includes(t.id)).length

  return (
    <>
      <PageHeader
        marker="Learn"
        title="How credit works."
        description="Short lessons you can play with. Open one, try the demo, then try it for real in the app."
      />

      <section className="container-x py-10 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
          <h2 className="text-d3 font-light tracking-[-0.02em]">Lessons</h2>
          <p className="meta" aria-live="polite">
            You have opened {done} of {TOPICS.length}
          </p>
        </div>

        <ul>
          {TOPICS.map((topic, i) => (
            <TopicRow key={topic.id} topic={topic} index={i} open={open.has(topic.id)} onToggle={() => toggle(topic.id)} />
          ))}
        </ul>

        <p className="mt-10 max-w-prose text-muted">
          Stuck on a word or an idea? Use the Ask button in the bottom right corner.
        </p>
      </section>
    </>
  )
}

function TopicRow({ topic, index, open, onToggle }: { topic: Topic; index: number; open: boolean; onToggle: () => void }) {
  const panelId = `${topic.id}-panel`
  return (
    <li id={topic.id} className="scroll-mt-6 border-b border-ink/15">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-baseline gap-4 py-6 text-left hover:bg-sky/60"
        >
          <span className="meta w-8 shrink-0">{String(index + 1).padStart(2, '0')}</span>
          <span className="flex-1">
            <span className="block text-d4 font-medium">{topic.title}</span>
            <span className="mt-1 block text-muted">{topic.blurb}</span>
          </span>
          <span className="shrink-0 text-sm font-medium">{open ? 'Close' : 'Open'}</span>
        </button>
      </h3>

      {open && (
        <div id={panelId} className="pb-10 sm:pl-12">
          {topic.lines.map((line) => (
            <p key={line} className="mt-3 max-w-prose text-[17px] leading-relaxed first:mt-0">
              {line}
            </p>
          ))}
          <Demo id={topic.demo} />
          {topic.tryIt && (
            <p className="mt-6">
              <TextLink to={topic.tryIt.to}>{topic.tryIt.label}</TextLink>
            </p>
          )}
        </div>
      )}
    </li>
  )
}
