import { useId, useState, type ReactNode } from 'react'
import { money } from '../lib/format.ts'
import {
  CARD_BALANCE,
  CARD_EXAMPLES,
  CARD_MONTHLY_SPEND,
  CHOICES,
  GLOSSARY,
  INTEREST_ROWS,
  MYTHS,
  SCORE_EVENTS,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_START,
  STATEMENT_PARTS,
  UTILISATION_BANDS,
  type DemoId,
} from './content.ts'

/** Small things to play with inside each lesson. All numbers here are examples, not your account. */

const chip = (selected: boolean) =>
  `border border-ink px-4 py-2 text-left text-sm font-medium ${
    selected ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-ink hover:text-white'
  }`

const wc = (amount: number) => money(Math.round(amount * 100))

function Panel({ label = 'Try it', children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mt-6 border border-ink/20 bg-white p-5 md:p-6">
      <p className="meta mb-4">{label}</p>
      {children}
    </div>
  )
}

function Bar({ percent, className = 'bg-ink' }: { percent: number; className?: string }) {
  return (
    <div className="h-3 border border-ink" aria-hidden>
      <div className={`h-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

export function Demo({ id }: { id: DemoId }) {
  switch (id) {
    case 'choices':
      return <ChoiceDemo />
    case 'score':
      return <ScoreDemo />
    case 'interest':
      return <InterestDemo />
    case 'statement':
      return <StatementDemo />
    case 'utilisation':
      return <UtilisationDemo />
    case 'cards':
      return <CardsDemo />
    case 'myths':
      return <MythsDemo />
    case 'glossary':
      return <GlossaryDemo />
  }
}

// ---- What is credit? ----------------------------------------------------------------

function ChoiceDemo() {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <Panel>
      <p className="font-medium">{CHOICES.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {CHOICES.options.map((o, i) => (
          <button key={o.label} type="button" aria-pressed={picked === i} className={chip(picked === i)} onClick={() => setPicked(i)}>
            {o.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-5 min-h-12 max-w-prose">
        {picked !== null && CHOICES.options[picked].outcome}
      </p>
    </Panel>
  )
}

// ---- Credit score ----------------------------------------------------------------------

type ScoreEvent = (typeof SCORE_EVENTS)[number]

function verdictFor(score: number) {
  return score < 580 ? 'Needs work' : score < 670 ? 'Fair' : score < 740 ? 'Good' : 'Excellent'
}

function ScoreDemo() {
  const [score, setScore] = useState(SCORE_START)
  const [log, setLog] = useState<ScoreEvent[]>([])

  function apply(event: ScoreEvent) {
    setScore((s) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, s + event.delta)))
    setLog((l) => [event, ...l].slice(0, 4))
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-d2 font-light tracking-[-0.03em]" aria-live="polite">
          {score}
        </p>
        <p className="text-lead">{verdictFor(score)}</p>
      </div>
      <div className="mt-3">
        <Bar percent={((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100} />
        <div className="meta mt-1 flex justify-between">
          <span>{SCORE_MIN}</span>
          <span>{SCORE_MAX}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {SCORE_EVENTS.map((e) => (
          <button key={e.label} type="button" className={chip(false)} onClick={() => apply(e)}>
            {e.label}
          </button>
        ))}
      </div>

      <ul className="mt-5 border-t border-line" aria-live="polite">
        {log.map((e, i) => (
          <li key={`${e.label}-${i}`} className="flex gap-4 border-b border-line py-3 text-[15px]">
            <span className="w-10 shrink-0 font-medium">{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
            <span>
              {e.label}. <span className="text-muted">{e.why}</span>
            </span>
          </li>
        ))}
      </ul>
      {log.length > 0 && (
        <button
          type="button"
          className="mt-4 text-sm font-medium underline-offset-4 hover:underline"
          onClick={() => {
            setScore(SCORE_START)
            setLog([])
          }}
        >
          Start again
        </button>
      )}
    </Panel>
  )
}

// ---- APR and interest ----------------------------------------------------------------------

function InterestDemo() {
  const id = useId()
  const [amount, setAmount] = useState(50)
  const [months, setMonths] = useState(12)
  const rows = INTEREST_ROWS.map((r) => ({ ...r, cost: amount * ((1 + r.apr / 1200) ** months - 1) }))
  const max = Math.max(...rows.map((r) => r.cost))

  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-amount`} className="flex justify-between text-sm font-medium">
            <span>You owe</span>
            <span>{wc(amount)}</span>
          </label>
          <input
            id={`${id}-amount`}
            type="range"
            min={10}
            max={200}
            step={5}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-2 w-full accent-ink"
          />
        </div>
        <div>
          <label htmlFor={`${id}-months`} className="flex justify-between text-sm font-medium">
            <span>For how long</span>
            <span>{months} {months === 1 ? 'month' : 'months'}</span>
          </label>
          <input
            id={`${id}-months`}
            type="range"
            min={1}
            max={24}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="mt-2 w-full accent-ink"
          />
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-4" aria-live="polite">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex justify-between text-[15px]">
              <span className="font-medium">
                {r.name} <span className="text-muted">({r.apr}% APR)</span>
              </span>
              <span className="font-medium">{wc(r.cost)} interest</span>
            </div>
            <div className="mt-1">
              <Bar percent={(r.cost / max) * 100} />
            </div>
          </li>
        ))}
      </ul>
      <p className="meta mt-4">Assumes you pay nothing back until the end. Real cards also have minimum payments.</p>
    </Panel>
  )
}

// ---- Statements ----------------------------------------------------------------------------------

function StatementDemo() {
  const [selected, setSelected] = useState(0)
  const part = STATEMENT_PARTS[selected]
  return (
    <Panel label="Tap a part of the statement">
      <div className="grid gap-px border border-ink bg-ink sm:grid-cols-2">
        {STATEMENT_PARTS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
            className={`flex flex-col gap-1 px-4 py-4 text-left ${selected === i ? 'bg-signal' : 'bg-white hover:bg-sky'}`}
          >
            <span className="meta text-ink/70">{p.label}</span>
            <span className="text-d4 font-medium">{p.value}</span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-5 max-w-prose">
        <span className="font-medium">{part.label}.</span> {part.text}
      </p>
    </Panel>
  )
}

// ---- Utilisation -------------------------------------------------------------------------------------

function UtilisationDemo() {
  const id = useId()
  const [used, setUsed] = useState(25)
  const band = UTILISATION_BANDS.find((b) => used <= b.upTo) ?? UTILISATION_BANDS[UTILISATION_BANDS.length - 1]
  return (
    <Panel>
      <label htmlFor={id} className="flex justify-between text-sm font-medium">
        <span>You owe, on a 100 WC limit</span>
        <span>{wc(used)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={used}
        onChange={(e) => setUsed(Number(e.target.value))}
        className="mt-2 w-full accent-ink"
      />
      <div className="mt-4">
        <Bar percent={used} className={used <= 30 ? 'bg-signal' : 'bg-ink'} />
        <div className="meta relative mt-1 h-4">
          <span className="absolute" style={{ left: '10%' }}>10%</span>
          <span className="absolute" style={{ left: '30%' }}>30%</span>
          <span className="absolute" style={{ left: '50%' }}>50%</span>
        </div>
      </div>
      <p aria-live="polite" className="mt-3">
        <span className="text-d4 font-medium">{used}%</span> <span className="font-medium">{band.label}.</span>{' '}
        <span className="text-muted">{band.text}</span>
      </p>
    </Panel>
  )
}

// ---- Choosing a card ------------------------------------------------------------------------------------

function CardsDemo() {
  const [guess, setGuess] = useState<number | null>(null)
  const rows = CARD_EXAMPLES.map((c) => {
    const interest = (CARD_BALANCE * c.apr) / 100
    const rewards = (CARD_MONTHLY_SPEND * 12 * c.cashBack) / 100
    return { ...c, interest, rewards, net: interest - rewards }
  })
  const worst = rows.reduce((w, r, i) => (r.net > rows[w].net ? i : w), 0)

  return (
    <Panel label="Guess first">
      <p className="font-medium">
        You carry {wc(CARD_BALANCE)} for a year and spend {wc(CARD_MONTHLY_SPEND)} a month. Which card costs you the most?
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {rows.map((r, i) => (
          <button key={r.name} type="button" aria-pressed={guess === i} className={chip(guess === i)} onClick={() => setGuess(i)}>
            {r.name}
          </button>
        ))}
      </div>

      {guess !== null && (
        <div aria-live="polite" className="mt-6">
          <p className="font-medium">
            {guess === worst ? 'Right.' : 'Not quite.'} {rows[worst].name} costs the most over the year.
          </p>
          <table className="mt-4 w-full border-t border-ink text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink/15">
                <th scope="col" className="meta py-2 font-medium">Card</th>
                <th scope="col" className="meta py-2 font-medium">APR</th>
                <th scope="col" className="meta py-2 font-medium">Interest</th>
                <th scope="col" className="meta py-2 font-medium">Cash back</th>
                <th scope="col" className="meta py-2 font-medium">You pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-b border-ink/15">
                  <th scope="row" className="py-3 pr-3 font-medium">{r.name}</th>
                  <td className="py-3 pr-3">{r.apr}%</td>
                  <td className="py-3 pr-3">{wc(r.interest)}</td>
                  <td className="py-3 pr-3">{wc(r.rewards)}</td>
                  <td className={`py-3 font-medium ${i === worst ? 'bg-signal px-2' : ''}`}>{wc(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta mt-3">Made-up numbers to show the idea. Venture W needs a high score to get.</p>
        </div>
      )}
    </Panel>
  )
}

// ---- Myth or fact ---------------------------------------------------------------------------------------------

function MythsDemo() {
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  const answered = Object.keys(answers).length
  const right = MYTHS.filter((m, i) => answers[i] === m.isTrue).length

  return (
    <Panel label={answered ? `${right} right out of ${answered}` : 'True or false?'}>
      <ul>
        {MYTHS.map((m, i) => {
          const given = answers[i]
          const done = given !== undefined
          return (
            <li key={m.claim} className="border-t border-line py-5 first:border-t-0 first:pt-0">
              <p className="font-medium">{m.claim}</p>
              <div className="mt-3 flex gap-3">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    disabled={done}
                    aria-pressed={given === value}
                    className={`${chip(given === value)} disabled:opacity-100 ${done && given !== value ? 'opacity-40' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: value }))}
                  >
                    {value ? 'True' : 'False'}
                  </button>
                ))}
              </div>
              {done && (
                <p aria-live="polite" className="mt-3 max-w-prose text-[15px]">
                  <span className="font-medium">{given === m.isTrue ? 'Correct.' : 'Not quite.'}</span> {m.why}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {answered > 0 && (
        <button type="button" className="mt-2 text-sm font-medium underline-offset-4 hover:underline" onClick={() => setAnswers({})}>
          Start again
        </button>
      )}
    </Panel>
  )
}

// ---- Glossary ---------------------------------------------------------------------------------------------------

function GlossaryDemo() {
  const id = useId()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const items = GLOSSARY.filter((g) => !q || g.term.toLowerCase().includes(q) || g.short.toLowerCase().includes(q))

  return (
    <Panel label="Search the words">
      <label htmlFor={id} className="sr-only">
        Search the glossary
      </label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Try APR or limit"
        className="h-12 w-full border border-ink/20 bg-white px-4 text-[15px] text-ink outline-none placeholder:text-muted hover:border-ink/40 focus:border-ink"
      />
      <dl className="mt-4 border-t border-ink" aria-live="polite">
        {items.map((g) => (
          <div key={g.term} className="grid gap-1 border-b border-ink/15 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
            <dt className="font-medium">{g.term}</dt>
            <dd className="text-muted">{g.short}</dd>
          </div>
        ))}
        {items.length === 0 && <p className="py-4 text-muted">Nothing matches that. Try another word.</p>}
      </dl>
    </Panel>
  )
}
